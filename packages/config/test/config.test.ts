import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assignVariant, catalogFor, categoriesFor, CHANGELOG, DEFAULT_CONFIG, DEFAULT_PREFS, EU_REGIONS, plan, resolveConfig, RETENTION, SUBPROCESSORS,
  PUBLISHED_THROUGH_LEVEL, validateConfig, validateExperiments, type RemoteConfig,
} from "../src";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const NOW = Date.UTC(2026, 10, 4, 12);
const H = 3_600_000;

describe("[T-DFA-01] paramètres de monétisation pilotables par pays", () => {
  it("la config livrée est valide", () => {
    expect(validateConfig(DEFAULT_CONFIG, NOW)).toEqual([]);
  });

  it("chaque paramètre accepte une surcharge par pays, appliquée sans nouvelle version", () => {
    const cfg: RemoteConfig = {
      ...DEFAULT_CONFIG,
      version: 2,
      countries: {
        BE: { monetization: { ads: { enabled: false, maxPerDay: 0 }, featuredOffers: false, lateSeasonPurchase: "hide", minorCapCents: 1000, disabledSkus: ["boosters_xl"] }, notifications: { maxPerDay: 1 } },
      },
    };
    expect(validateConfig(cfg, NOW)).toEqual([]);
    const be = resolveConfig(cfg, "be"), fr = resolveConfig(cfg, "FR");
    expect(be.monetization).toMatchObject({ ads: { enabled: false, maxPerDay: 0 }, featuredOffers: false, lateSeasonPurchase: "hide", minorCapCents: 1000 });
    expect(be.notifications.maxPerDay).toBe(1);
    expect(fr.monetization.ads.enabled).toBe(true);
    expect(catalogFor(be).some((s) => s.id === "boosters_xl")).toBe(false);
    expect(be.consentAge).toBe(13);
    expect(fr.consentAge).toBe(15);
  });

  it("valeurs hors bornes refusées (plafond, pubs > 5/jour, notifications > 2/jour, plage de silence)", () => {
    const bad: RemoteConfig = { ...DEFAULT_CONFIG, countries: { DE: { monetization: { ads: { enabled: true, maxPerDay: 9 }, minorCapCents: 99999 }, notifications: { maxPerDay: 5, quietStartHour: 23, quietEndHour: 6 } } } };
    expect(validateConfig(bad, NOW).length).toBeGreaterThanOrEqual(4);
  });
});

describe("[T-ANA-02] expériences A/B encadrées", () => {
  it("test de prix sans annonce publique ou non borné : rejeté ; segment sur âge, dépense ou échecs : rejeté", () => {
    expect(validateExperiments([{ id: "p1", variable: "price", variants: ["a", "b"] }]).join()).toMatch(/annonce publique/);
    expect(validateExperiments([{ id: "p2", variable: "price", variants: ["a", "b"], publicAnnouncementUrl: "https://helios.example/tests-de-prix", maxPriceDeltaPct: 50 }]).join()).toMatch(/borné/);
    for (const k of ["age", "spend", "failStreak", "payerTier", "sessionLength"])
      expect(validateExperiments([{ id: k, variable: "ux", variants: ["a", "b"], segment: { [k]: 1 } }]).join(), k).toMatch(/segment interdit/);
    expect(validateExperiments([{ id: "ok", variable: "price", variants: ["a", "b"], publicAnnouncementUrl: "https://helios.example/tests-de-prix", maxPriceDeltaPct: 10, segment: { countries: ["FR"] } }])).toEqual([]);
  });

  it("[T-FAIR-01] test de difficulté : refusé sur tout niveau publié, accepté seulement au-delà du dernier niveau livré", () => {
    const d = (levels?: [number, number]) => validateExperiments([{ id: "d", variable: "difficulty", variants: ["a", "b"], ...(levels ? { segment: { levels } } : {}) }]);
    expect(d().join()).toMatch(/interdit sur un niveau publié/);
    expect(d([1, 50]).join()).toMatch(/interdit sur un niveau publié/);
    expect(d([PUBLISHED_THROUGH_LEVEL, PUBLISHED_THROUGH_LEVEL + 100]).join()).toMatch(/interdit/);
    expect(d([PUBLISHED_THROUGH_LEVEL + 1, PUBLISHED_THROUGH_LEVEL + 100])).toEqual([]);
    // Une config publiée à chaud passe par le même validateur.
    expect(validateConfig({ ...DEFAULT_CONFIG, experiments: [{ id: "d", variable: "difficulty", variants: ["a", "b"], segment: { levels: [10, 20] } }] }, Date.UTC(2026, 10, 4)).join()).toMatch(/interdit sur un niveau publié/);
  });

  it("le dernier niveau publié correspond au manifeste des niveaux livrés", () => {
    const m = JSON.parse(readFileSync(join(ROOT, "packages/levels/data/generated/manifest.json"), "utf8")) as { to: number };
    expect(PUBLISHED_THROUGH_LEVEL).toBe(m.to);
  });

  it("affectation déterministe par hachage de l'identifiant ; joueurs protégés exclus des tests de prix", () => {
    const e = { id: "p", variable: "price" as const, variants: ["control", "test"], publicAnnouncementUrl: "https://x.example", maxPriceDeltaPct: 10 };
    expect(assignVariant(e, "player-1", false)).toBe(assignVariant(e, "player-1", false));
    const counts = { control: 0, test: 0 } as Record<string, number>;
    for (let k = 0; k < 2000; k++) counts[assignVariant(e, `p${k}`, false)]++;
    expect(counts.test / 2000).toBeGreaterThan(0.45);
    for (let k = 0; k < 200; k++) expect(assignVariant(e, `p${k}`, true)).toBe("control");
  });
});

describe("notifications", () => {
  const p = DEFAULT_CONFIG.notifications;
  const prefs = { optIn: true, categories: { lives: true, team: true, season: true, offers: true } };
  const day0 = Date.UTC(2026, 10, 4, 0);

  it("[T-NOT-01] opt-in obligatoire ; 2 par jour au plus ; 23 h locale reportée à 8 h ; catégorie désactivée muette", () => {
    expect(plan([{ category: "lives", at: day0 + 10 * H, key: "a" }], DEFAULT_PREFS, false, 60, p)).toEqual([]);
    const three = [10, 12, 14].map((h, k) => ({ category: "lives" as const, at: day0 + h * H, key: `k${k}` }));
    expect(plan(three, prefs, false, 0, p)).toHaveLength(2);
    // 22 h UTC = 23 h à Paris (UTC+1) → reportée à 8 h heure de Paris le lendemain (7 h UTC).
    const late = plan([{ category: "team", at: day0 + 22 * H, key: "t" }], prefs, false, 60, p);
    expect(new Date(late[0].at).getUTCHours()).toBe(7);
    expect(late[0].at).toBeGreaterThan(day0 + 22 * H);
    expect(plan([{ category: "season", at: day0 + 10 * H, key: "s" }], { ...prefs, categories: { ...prefs.categories, season: false } }, false, 0, p)).toEqual([]);
  });

  it("[T-AGE-11] aucune notification commerciale pour un joueur protégé ; la catégorie n'est même pas proposée", () => {
    expect(categoriesFor(true)).not.toContain("offers");
    expect(plan([{ category: "offers", at: day0 + 10 * H, key: "o" }], prefs, true, 0, p)).toEqual([]);
    expect(plan([{ category: "offers", at: day0 + 10 * H, key: "o" }], prefs, false, 0, p)).toHaveLength(1);
  });
});

describe("gouvernance des données", () => {
  it("[T-GDPR-08] hébergement en région UE ; chaque sous-traitant a une garantie et un DPA ; SDK tiers seulement après consentement", () => {
    const infra = JSON.parse(readFileSync(join(ROOT, "deploy/infra.json"), "utf8")) as { resources: { region: string }[] };
    for (const r of infra.resources) expect(EU_REGIONS, JSON.stringify(r)).toContain(r.region);
    for (const s of SUBPROCESSORS) {
      expect(s.hosts.length, s.name).toBeGreaterThan(0);
      expect(["UE", "DPF + CCT", "CCT"]).toContain(s.safeguard);
      expect(s.dpa).toMatch(/^https:\/\//);
      if (/AdMob|Messaging|APNs/.test(s.name)) expect(s.afterConsent, s.name).toBe(true);
    }
    // Aucun hôte tiers n'est codé en dur dans le client en dehors de la liste des sous-traitants.
    const client = readFileSync(join(ROOT, "apps/game/src/ui/Meta.tsx"), "utf8") + readFileSync(join(ROOT, "apps/game/src/ui/Compliance.tsx"), "utf8");
    const hosts = [...client.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
    const allowedLinks = /(support\.google\.com|reportaproblem\.apple\.com|apps\.apple\.com|play\.google\.com|support\.apple\.com)$/;
    for (const h of hosts) expect(SUBPROCESSORS.some((s) => s.hosts.includes(h)) || allowedLinks.test(h), h).toBe(true);
  });

  it("durées de conservation définies pour chaque table horodatée, de 90 jours à 10 ans", () => {
    for (const r of RETENTION) expect(r.days, r.table).toBeGreaterThanOrEqual(90);
    expect(RETENTION.find((r) => r.table === "ledger")!.days).toBe(3650);
    expect(RETENTION.find((r) => r.table === "events")!.days).toBeLessThanOrEqual(395);
  });

  it("[T-DIG-01] journal des versions : la version de l'application a sa note (FR et EN) ; mises à jour de conformité marquées", () => {
    const version = JSON.parse(readFileSync(join(ROOT, "apps/game/package.json"), "utf8")).version;
    const top = CHANGELOG[0];
    expect(top.version).toBe(version);
    for (const r of CHANGELOG) {
      expect(r.notes.fr.length, r.version).toBeGreaterThan(0);
      expect(r.notes.en.length, r.version).toBe(r.notes.fr.length);
    }
    expect(CHANGELOG.some((r) => r.compliance)).toBe(true);
  });
});
