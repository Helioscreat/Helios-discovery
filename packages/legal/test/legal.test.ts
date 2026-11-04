import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RETENTION, SUBPROCESSORS } from "@helios/config";
import { CATALOG } from "@helios/economy";
import {
  allPlayerDocs, buildDoc, checkFamilies, DATA_TYPES, DEVICE_STORAGE, dpia, iarcAnswers, LOCALES, noticeFields, outputs, paidRandomItems,
  PAYMENT_SDK_DENYLIST, PHRASES, plainText, PLAYER_DOCS, privacyManifest, PUBLISHER, register, scanForExternalPayments, subprocessorKey,
  TRACKING_DOMAINS, traderSheet, TREATMENTS, type BuildConfig, type Doc,
} from "../src";

const ROOT = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const headingIds = (d: Doc) => d.blocks.flatMap((b) => ("h" in b && b.id ? [b.id] : []));

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir))) {
    if (["node_modules", "dist", "public", "generated"].includes(e)) continue;
    const p = `${dir}/${e}`;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}
const SOURCES = ["apps/game/src", "apps/server/src", ...readdirSync(join(ROOT, "packages")).map((p) => `packages/${p}/src`)].flatMap((d) => walk(d, [".ts", ".tsx"]));

describe("sources uniques", () => {
  it("les fichiers générés sont à jour (sinon : npm run build -w @helios/legal)", () => {
    for (const o of outputs()) expect(read(o.path), o.path).toBe(o.content);
  });

  it("chaque traitement cite des données, des tables et des destinataires connus ; chaque table conservée relève d'un traitement", () => {
    for (const t of TREATMENTS) {
      for (const d of t.data) expect(DATA_TYPES.some((x) => x.id === d), `${t.id}:${d}`).toBe(true);
      for (const tb of t.retention.tables) expect(RETENTION.some((r) => r.table === tb), `${t.id}:${tb}`).toBe(true);
      for (const r of t.recipients) expect(SUBPROCESSORS.some((s) => s.name === r), `${t.id}:${r}`).toBe(true);
      expect(t.automatedDecision).toBe(false);
    }
    for (const r of RETENTION) expect(TREATMENTS.some((t) => t.retention.tables.includes(r.table)), r.table).toBe(true);
    for (const d of DATA_TYPES) expect(TREATMENTS.some((t) => t.data.includes(d.id)), d.id).toBe(true);
  });

  it("les finalités facultatives (mesure, publicité, notifications) reposent sur le consentement", () => {
    for (const id of ["analytics", "ads", "notifications"]) expect(TREATMENTS.find((t) => t.id === id)!.basis, id).toBe("a");
  });

  it("aucune valeur à compléter hors de la fiche éditeur (les textes eux-mêmes sont complets)", () => {
    for (const [l, p] of Object.entries(PHRASES)) for (const [k, v] of Object.entries(p)) expect(v, `${l}:${k}`).not.toMatch(/⟦/);
  });
});

describe("[T-STO-05] documents juridiques dans les 6 langues", () => {
  it("chaque document joueur existe en fr, en, nl, de, es, it (Markdown et page HTML servie par le jeu)", () => {
    expect(LOCALES.sort()).toEqual(["de", "en", "es", "fr", "it", "nl"]);
    for (const l of LOCALES) for (const d of PLAYER_DOCS) {
      expect(read(`docs/legal/${l}/${d}.md`).length, `${l}/${d}`).toBeGreaterThan(200);
      expect(read(`apps/game/public/legal/${l}/${d}.html`), `${l}/${d}`).toContain(`<html lang="${l}">`);
    }
  });

  it("mêmes clés et mêmes variables {x} que le français, aucune chaîne vide", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const [l, p] of Object.entries(PHRASES)) {
      expect(Object.keys(p).sort(), l).toEqual(Object.keys(PHRASES.fr).sort());
      for (const [k, v] of Object.entries(p)) {
        expect(v.trim(), `${l}:${k}`).not.toBe("");
        expect(vars(v), `${l}:${k}`).toBe(vars(PHRASES.fr[k as keyof typeof PHRASES.fr]));
      }
    }
  });

  it("chaque document a la même structure (mêmes sections) dans toutes les langues", () => {
    for (const d of PLAYER_DOCS) {
      const ref = buildDoc(d, "fr").blocks.map((b) => Object.keys(b)[0]);
      for (const l of LOCALES) expect(buildDoc(d, l).blocks.map((b) => Object.keys(b)[0]), `${l}/${d}`).toEqual(ref);
    }
  });

  it("les chemins de menu cités sont les libellés exacts du jeu dans chaque langue", async () => {
    const { CATALOGS } = await import("../../../apps/game/src/i18n");
    for (const l of LOCALES) {
      const text = plainText(buildDoc("privacy", l));
      expect(text, l).toContain(`${CATALOGS[l]["home.settings"]} > ${CATALOGS[l]["privacy.title"]} > ${CATALOGS[l]["privacy.export"]}`);
    }
  });
});

describe("politique de confidentialité (RGPD art. 13)", () => {
  const RUBRICS = ["controller", "treatments", "legitimate", "recipients", "retention", "device", "minors", "rights", "automated", "required"];
  it("chaque langue contient les rubriques de l'art. 13 et toutes les finalités de l'inventaire", () => {
    for (const l of LOCALES) {
      const d = buildDoc("privacy", l);
      for (const r of RUBRICS) expect(headingIds(d), `${l}:${r}`).toContain(r);
      const table = d.blocks.find((b) => "table" in b && b.table.rows.length === TREATMENTS.length);
      expect(table, l).toBeDefined();
      const t = plainText(d);
      expect(t, l).toContain(PUBLISHER.supervisor.url);
      for (const s of SUBPROCESSORS) expect(t, `${l}:${s.name}`).toContain(s.name);
      for (const k of DEVICE_STORAGE) expect(t, `${l}:${k.key}`).toContain(k.key);
    }
  });

  it("chaque sous-traitant a un rôle traduit ; les durées affichées viennent de RETENTION", () => {
    for (const s of SUBPROCESSORS) expect(subprocessorKey(s.name), s.name).toBeDefined();
    const fr = plainText(buildDoc("privacy", "fr"));
    expect(fr).toContain("13 mois"); // events 395 j
    expect(fr).toContain("10 ans"); // ledger 3650 j
  });

  it("le stockage sur l'appareil déclaré correspond aux clés réellement écrites par le jeu", () => {
    const keys = new Set<string>();
    for (const f of SOURCES.filter((p) => p.startsWith("apps/game"))) for (const m of read(f).matchAll(/"(helios\.[a-z]+\.v\d+)"/g)) keys.add(m[1]);
    expect([...keys].sort()).toEqual(DEVICE_STORAGE.filter((d) => d.key.startsWith("helios.")).map((d) => d.key).sort());
    expect(DEVICE_STORAGE.some((d) => d.key === "IABTCF_*")).toBe(true); // écrit par le SDK UMP, pas par notre code
  });
});

describe("[T-GDPR-10] registre des traitements et AIPD", () => {
  it("le registre contient pour chaque traitement les rubriques de l'art. 30(1) a à g", () => {
    const reg = register();
    for (const t of TREATMENTS) {
      const i = reg.blocks.findIndex((b) => "h" in b && b.id === `t-${t.id}`);
      expect(i, t.id).toBeGreaterThan(0);
      const table = reg.blocks[i + 1];
      expect("table" in table).toBe(true);
      const labels = "table" in table ? table.table.rows.map((r) => r[0].slice(0, 3)) : [];
      for (const k of ["(a)", "(b)", "(c)", "(d)", "(e)", "(f)", "(g)"]) expect(labels, `${t.id}:${k}`).toContain(k);
      if ("table" in table) for (const r of table.table.rows) expect(r[1].trim(), `${t.id}:${r[0]}`).not.toBe("");
    }
    expect(headingIds(reg)).toEqual(expect.arrayContaining(["a", "g"]));
  });

  it("l'AIPD contient les 4 éléments de l'art. 35(7) et couvre chaque traitement", () => {
    const d = dpia();
    expect(headingIds(d)).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
    const t = plainText(d);
    for (const tr of TREATMENTS) expect(t, tr.id).toContain(tr.purpose);
    expect(t).toMatch(/mineur/i);
  });
});

/** Indice de lisibilité de Kandel et Moles (adaptation française de Flesch). */
function syllablesFr(word: string): number {
  const w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöûùüÿœæ]/g, "").replace(/(?<=[^aeiouyàâéèêëîïôûùü])e(s|nt)?$/, "");
  return Math.max(1, (w.match(/[aeiouyàâäéèêëîïôöûùüÿœæ]+/g) ?? []).length);
}
function syllablesEn(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "").replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}
function readability(sentences: string[], syl: (w: string) => number, a: number, b: number, c: number) {
  const words = sentences.flatMap((s) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w)));
  const n = sentences.flatMap((s) => s.split(/[.!?]+/).filter((x) => /\p{L}/u.test(x))).length;
  const syllables = words.reduce((t, w) => t + syl(w), 0);
  return a - b * (words.length / n) - c * (syllables / words.length);
}

describe("[T-DSA-05] CGU complètes et « L'essentiel en 10 points »", () => {
  it("les deux versions existent dans chaque langue ; elles couvrent modération, outils automatisés et recours", () => {
    for (const l of LOCALES) {
      const terms = buildDoc("terms", l);
      expect(headingIds(terms), l).toEqual(expect.arrayContaining(["contact", "conduct", "moderation", "notice", "appeal"]));
      const t = plainText(terms);
      for (const art of ["17", "20", "21", "23"]) expect(t, `${l}: DSA ${art}`).toMatch(new RegExp(`DSA [^)]*${art}`));
      const ess = buildDoc("essentials", l);
      const items = ess.blocks.find((b) => "ul" in b);
      expect(items && "ul" in items ? items.ul.length : 0, l).toBe(10);
    }
  });

  it("la version courte française a un score de lisibilité Kandel-Moles ≥ 60 ; l'anglaise un Flesch ≥ 60", () => {
    const items = (l: "fr" | "en") => { const b = buildDoc("essentials", l).blocks.find((x) => "ul" in x)!; return "ul" in b ? b.ul : []; };
    const fr = readability(items("fr"), syllablesFr, 207, 1.015, 73.6);
    const en = readability(items("en"), syllablesEn, 206.835, 1.015, 84.6);
    expect(fr).toBeGreaterThanOrEqual(60);
    expect(en).toBeGreaterThanOrEqual(60);
  });

  it("dans toutes les langues, la version courte garde des phrases courtes (≤ 12 mots en moyenne)", () => {
    for (const l of LOCALES) {
      const b = buildDoc("essentials", l).blocks.find((x) => "ul" in x)!;
      const sentences = ("ul" in b ? b.ul : []).flatMap((s) => s.split(/[.!?]+/).filter((x) => /\p{L}/u.test(x)));
      const avg = sentences.reduce((t, s) => t + s.trim().split(/\s+/).length, 0) / sentences.length;
      expect(avg, l).toBeLessThanOrEqual(12);
    }
  });
});

describe("[T-ACC-03] déclaration d'accessibilité", () => {
  it("chaque langue contient l'état de conformité, les non-conformités, la date et le contact", () => {
    for (const l of LOCALES) {
      const d = buildDoc("accessibility", l);
      expect(headingIds(d), l).toEqual(expect.arrayContaining(["status", "issues", "date", "contact"]));
      const t = plainText(d);
      expect(t, l).toContain("EN 301 549");
      expect(t, l).toContain(PUBLISHER.email);
      expect(t, l).toMatch(/2026/);
    }
  });

  it("la page est liée depuis Paramètres > Aide au jeu", () => {
    const app = read("apps/game/src/ui/App.tsx");
    expect(app).toMatch(/legal-links/);
    expect(app).toMatch(/accessibility/);
  });
});

describe("CGV", () => {
  it("chaque article du catalogue figure avec son prix TTC ; rétractation, abonnement, mineurs, remboursement, médiation", () => {
    for (const l of LOCALES) {
      const d = buildDoc("sales", l);
      expect(headingIds(d), l).toEqual(expect.arrayContaining(["items", "withdrawal", "subscription", "minors", "refund", "mediation"]));
      const items = d.blocks.find((b) => "table" in b);
      expect(items && "table" in items ? items.table.rows.length : 0, l).toBe(CATALOG.length);
      expect(plainText(d), l).toContain("L221-28");
    }
  });
});

describe("[T-STO-01] questionnaire IARC cohérent avec le catalogue et l'inventaire", () => {
  it("achats intégrés : oui ; éléments aléatoires payants : non ; interactions : oui ; position : non", () => {
    const a = Object.fromEntries(iarcAnswers().map((x) => [x.question, x.answer]));
    expect(a["Achats numériques intégrés"]).toBe(CATALOG.length > 0 ? "Oui" : "Non");
    expect(paidRandomItems()).toEqual([]);
    expect(a["Achats d'éléments aléatoires payants (loot boxes)"]).toBe("Non");
    expect(a["Les utilisateurs peuvent interagir ou échanger du contenu"]).toBe("Oui");
    expect(a["Partage de la position de l'utilisateur"]).toBe("Non");
    expect(DATA_TYPES.some((d) => /location/i.test(d.google))).toBe(false);
    expect(read("docs/stores/iarc.md")).toContain("Achats intégrés");
  });
});

describe("[T-STO-02] formulaire « Sécurité des données » généré depuis l'inventaire", () => {
  it("chaque type annoté @collects dans le code est dans l'inventaire, et chaque type « code » de l'inventaire est annoté", () => {
    const annotated = new Set<string>();
    for (const f of SOURCES) for (const m of read(f).matchAll(/^\s*\/\/ @collects ([\w. ]+)$/gm)) for (const id of m[1].trim().split(/\s+/)) annotated.add(id);
    expect(annotated.size).toBeGreaterThan(10);
    for (const id of annotated) expect(DATA_TYPES.some((d) => d.id === id), `@collects ${id} absent de l'inventaire`).toBe(true);
    for (const d of DATA_TYPES.filter((x) => x.by === "code")) expect(annotated.has(d.id), `${d.id} sans annotation @collects`).toBe(true);
  });

  it("le formulaire liste chaque catégorie Google de l'inventaire ; seul l'identifiant publicitaire est partagé", () => {
    const ds = read("docs/stores/data-safety.md");
    for (const d of DATA_TYPES) expect(ds, d.google).toContain(d.google);
    expect(DATA_TYPES.filter((d) => d.shared).map((d) => d.id)).toEqual(["ads.deviceId"]);
  });
});

describe("[T-STO-03] public cible et SDK Familles", () => {
  const cfg = JSON.parse(read("deploy/build.json")) as BuildConfig;
  it("configuration actuelle : public 13 ans et plus, hors Familles ; aucune erreur", () => {
    expect(cfg.targetAudience).toBe("teen");
    expect(checkFamilies(cfg)).toEqual([]);
  });
  it("avec targetAudience=children, un SDK publicitaire non certifié fait échouer la CI", () => {
    const kids: BuildConfig = { ...cfg, targetAudience: "children", nativeSdks: [...cfg.nativeSdks, { id: "com.example:ads-network", kind: "ads", platform: "android" }] };
    expect(checkFamilies(kids)).toEqual([expect.stringContaining("com.example:ads-network")]);
    expect(checkFamilies({ ...cfg, targetAudience: "children" })).toEqual([]);
  });
});

describe("[T-STO-04] paiements par les stores uniquement ; manifeste de confidentialité Apple", () => {
  it("aucune URL ni SDK de paiement externe dans le code et les dépendances", () => {
    const files = SOURCES.map((p) => ({ path: p, text: read(p) })).filter((f) => !f.path.startsWith("packages/legal/"));
    expect(scanForExternalPayments(files)).toEqual([]);
    expect(scanForExternalPayments([{ path: "x.ts", text: 'fetch("https://shop.example/checkout")' }])).toHaveLength(1);
    const pkgs = [".", "apps/game", "apps/server", ...readdirSync(join(ROOT, "packages")).map((p) => `packages/${p}`)];
    for (const p of pkgs) {
      const j = JSON.parse(read(`${p}/package.json`));
      for (const dep of Object.keys({ ...j.dependencies, ...j.devDependencies })) expect(PAYMENT_SDK_DENYLIST, `${p}:${dep}`).not.toContain(dep);
    }
  });

  it("PrivacyInfo.xcprivacy : chaque type Apple de l'inventaire, suivi déclaré avec les hôtes du SDK publicitaire", () => {
    const m = privacyManifest();
    for (const d of DATA_TYPES) if (d.apple) expect(m, d.id).toContain(`NSPrivacyCollectedDataType${d.apple}</string>`);
    expect(m).toMatch(/<key>NSPrivacyTracking<\/key>\s*<true\/>/);
    const adHosts = SUBPROCESSORS.filter((s) => s.afterConsent).flatMap((s) => s.hosts);
    for (const h of TRACKING_DOMAINS) expect(adHosts, h).toContain(h);
    expect(read("docs/stores/PrivacyInfo.xcprivacy")).toBe(m);
  });
});

describe("[T-DSA-06] fiche éditeur des stores = mentions légales", () => {
  it("chaque champ de la fiche reprend la valeur des mentions légales, dans chaque langue", () => {
    const sheet = plainText(traderSheet());
    const f = Object.fromEntries(noticeFields());
    for (const k of ["name", "address", "email", "phone", "registry", "siren", "vat"]) expect(sheet, k).toContain(f[k]);
    for (const l of LOCALES) {
      const n = plainText(buildDoc("notice", l));
      for (const [, v] of noticeFields()) expect(n, `${l}:${v}`).toContain(v);
      expect(n, l).toContain(PUBLISHER.host.name);
    }
  });
});

describe("pages HTML", () => {
  it("chaque page a un titre, une langue, aucun script et des liens explicites", () => {
    for (const d of allPlayerDocs()) {
      const html = read(`apps/game/public/legal/${d.lang}/${d.id}.html`);
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html).not.toMatch(/<script/i);
      expect(html).toMatch(/<h1>/);
    }
  });
});
