import { CONSENT_AGE, validateConsentAgeTable } from "@helios/compliance";
import { CATALOG, validateCatalog, type Sku } from "@helios/economy";

/**
 * Configuration distante (cahier des charges §8.9, anticipation du Digital Fairness Act) :
 * tous les paramètres de monétisation sont pilotables par pays, sans nouvelle version de l'application.
 * Une config n'est publiée que si `validateConfig` ne renvoie aucune erreur.
 */
export interface MonetizationParams {
  /** Plafond mensuel de dépense des joueurs protégés, en centimes. */
  minorCapCents: number;
  ads: { enabled: boolean; maxPerDay: number };
  /** Articles mis en avant dans la boutique (jamais en fenêtre automatique). */
  featuredOffers: boolean;
  /** Achat du passe dans les 3 derniers jours : proposé avec avertissement, ou pas du tout. */
  lateSeasonPurchase: "warn" | "hide";
  /** Articles retirés du catalogue dans ce pays. */
  disabledSkus: string[];
}

export interface NotificationParams {
  maxPerDay: number;
  quietStartHour: number;
  quietEndHour: number;
}

export interface Experiment {
  id: string;
  variable: "difficulty" | "ux" | "price";
  variants: string[];
  /** Segments autorisés : pays et tranche de niveaux. Jamais l'âge, la dépense ni les échecs. */
  segment?: { countries?: string[]; levels?: [number, number] } & Record<string, unknown>;
  /** Test de prix : écart annoncé publiquement (obligatoire). */
  publicAnnouncementUrl?: string;
  /** Test de difficulté : exception assumée à « niveau identique pour tous » (affectation au hasard seulement). */
  fairnessAck?: boolean;
  /** Écart de prix maximal, en %. */
  maxPriceDeltaPct?: number;
}

export interface RemoteConfig {
  version: number;
  monetization: MonetizationParams;
  notifications: NotificationParams;
  consentAge: Record<string, number>;
  /** Surcharges par pays (code ISO 3166-1 alpha-2). */
  countries: Record<string, Partial<{ monetization: Partial<MonetizationParams>; notifications: Partial<NotificationParams> }>>;
  experiments: Experiment[];
  sunset?: { announcedAt: number; closesAt: number };
}

export const DEFAULT_CONFIG: RemoteConfig = {
  version: 1,
  monetization: { minorCapCents: 2000, ads: { enabled: true, maxPerDay: 5 }, featuredOffers: true, lateSeasonPurchase: "warn", disabledSkus: [] },
  notifications: { maxPerDay: 2, quietStartHour: 22, quietEndHour: 8 },
  consentAge: CONSENT_AGE,
  countries: {
    // Belgique : prudence accrue (doctrine de la Commission des jeux de hasard sur les mécaniques de jeu).
    BE: { monetization: { featuredOffers: false } },
  },
  experiments: [],
};

export interface ResolvedConfig {
  version: number;
  country: string;
  monetization: MonetizationParams;
  notifications: NotificationParams;
  consentAge: number;
  experiments: Experiment[];
  sunset?: RemoteConfig["sunset"];
}

/** Config effective pour un pays : valeurs par défaut + surcharge du pays. */
export function resolveConfig(cfg: RemoteConfig, country: string): ResolvedConfig {
  const c = country.toUpperCase();
  const o = cfg.countries[c] ?? {};
  const m = { ...cfg.monetization, ...(o.monetization ?? {}), ads: { ...cfg.monetization.ads, ...(o.monetization?.ads ?? {}) } };
  return {
    version: cfg.version,
    country: c,
    monetization: m,
    notifications: { ...cfg.notifications, ...(o.notifications ?? {}) },
    consentAge: cfg.consentAge[c] ?? 16,
    experiments: cfg.experiments.filter((e) => !e.segment?.countries || e.segment.countries.includes(c)),
    ...(cfg.sunset ? { sunset: cfg.sunset } : {}),
  };
}

/** Catalogue servi dans un pays (articles désactivés retirés). */
export function catalogFor(r: ResolvedConfig, catalog: Sku[] = CATALOG): Sku[] {
  return catalog.filter((s) => !r.monetization.disabledSkus.includes(s.id));
}

const FORBIDDEN_SEGMENT_KEYS = /age|minor|spend|revenue|payer|whale|fail|streak|session|churn|vulnerab|frustr/i;

/** ANA-02 : tests de prix annoncés publiquement, écart borné ; aucun ciblage sur un profil vulnérable. */
export function validateExperiments(list: Experiment[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const e of list) {
    if (ids.has(e.id)) errors.push(`expérience ${e.id} : identifiant dupliqué`);
    ids.add(e.id);
    if (e.variants.length < 2) errors.push(`expérience ${e.id} : au moins 2 variantes`);
    for (const k of Object.keys(e.segment ?? {})) if (FORBIDDEN_SEGMENT_KEYS.test(k)) errors.push(`expérience ${e.id} : segment interdit « ${k} »`);
    if (e.variable === "price") {
      if (!e.publicAnnouncementUrl || !/^https:\/\//.test(e.publicAnnouncementUrl)) errors.push(`expérience ${e.id} : test de prix sans annonce publique`);
      if (e.maxPriceDeltaPct === undefined || e.maxPriceDeltaPct > 20) errors.push(`expérience ${e.id} : écart de prix non borné (≤ 20 %)`);
    }
    if (e.variable === "difficulty" && !e.fairnessAck) errors.push(`expérience ${e.id} : test de difficulté sans accord explicite (exception à « niveau identique pour tous »)`);
  }
  return errors;
}

/**
 * Affectation à une variante : uniquement par hachage de (identifiant pseudonyme, expérience).
 * Les joueurs protégés sont toujours exclus des tests de prix (variante de contrôle).
 */
export function assignVariant(e: Experiment, playerId: string, protectedPlayer: boolean): string {
  if (e.variable === "price" && protectedPlayer) return e.variants[0];
  let h = 0x811c9dc5;
  for (const ch of `${e.id}:${playerId}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return e.variants[(h >>> 0) % e.variants.length];
}

const DAY = 86_400_000;

export function validateConfig(cfg: RemoteConfig, now: number): string[] {
  const errors: string[] = [];
  const check = (where: string, m: Partial<MonetizationParams>, n: Partial<NotificationParams>) => {
    if (m.minorCapCents !== undefined && (m.minorCapCents < 0 || m.minorCapCents > 5000)) errors.push(`${where} : plafond mineurs hors [0, 50 €]`);
    if (m.ads?.maxPerDay !== undefined && (m.ads.maxPerDay < 0 || m.ads.maxPerDay > 5)) errors.push(`${where} : pubs par jour hors [0, 5]`);
    if (m.disabledSkus) for (const id of m.disabledSkus) if (!CATALOG.some((s) => s.id === id)) errors.push(`${where} : article inconnu ${id}`);
    if (n.maxPerDay !== undefined && (n.maxPerDay < 0 || n.maxPerDay > 2)) errors.push(`${where} : notifications par jour hors [0, 2]`);
    for (const h of [n.quietStartHour, n.quietEndHour]) if (h !== undefined && (h < 0 || h > 23)) errors.push(`${where} : heure invalide`);
    if (n.quietStartHour !== undefined && n.quietStartHour < 22 && n.quietStartHour > 8) errors.push(`${where} : la plage de silence doit couvrir 22 h – 8 h`);
    if (n.quietEndHour !== undefined && n.quietEndHour < 8) errors.push(`${where} : la plage de silence doit couvrir 22 h – 8 h`);
  };
  check("défaut", cfg.monetization, cfg.notifications);
  for (const [c, o] of Object.entries(cfg.countries)) {
    if (!/^[A-Z]{2}$/.test(c)) errors.push(`pays invalide : ${c}`);
    check(c, o.monetization ?? {}, o.notifications ?? {});
  }
  errors.push(...validateConsentAgeTable(cfg.consentAge));
  errors.push(...validateExperiments(cfg.experiments));
  errors.push(...validateCatalog(CATALOG, { now, priceHistory: [], limitedHistory: [], ...(cfg.sunset ? { sunset: cfg.sunset } : {}) }).filter((e) => !e.startsWith("fermeture annoncée")));
  if (cfg.sunset && cfg.sunset.closesAt - cfg.sunset.announcedAt < 90 * DAY && !errors.some((e) => e.includes("90 jours"))) errors.push("fermeture : préavis inférieur à 90 jours");
  return errors;
}
