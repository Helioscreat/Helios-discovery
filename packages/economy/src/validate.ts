import type { Sku } from "./catalog";

export const DAY = 86_400_000;

/** Entrée d'historique des prix réellement pratiqués (directive Omnibus, prix le plus bas sur 30 jours). */
export interface PricePoint {
  skuId: string;
  eurCents: number;
  from: number;
  to: number;
}

/** Historique des articles affichés avec le libellé « limitée » (COM-03). */
export interface LimitedHistory {
  skuId: string;
  at: number;
}

export interface ValidationContext {
  now: number;
  priceHistory: PricePoint[];
  limitedHistory: LimitedHistory[];
  /** Fermeture annoncée du jeu (DIG-02). */
  sunset?: { announcedAt: number; closesAt: number };
}

const FORBIDDEN_FIELDS = ["stock", "remaining", "left", "quantityLeft", "random", "lootTable", "drop", "probabilities"];

/**
 * Valide un catalogue avant publication (config distante). Renvoie la liste des erreurs (vide = valide).
 * Références : 2005/29/CE annexe I pt 7 (fausse urgence), art. 6 (offres en boucle), 98/6/CE art. 6 bis
 * (réductions), loi belge sur les jeux de hasard (contenu aléatoire payant), 2019/770 (fermeture).
 */
export function validateCatalog(catalog: Sku[], ctx: ValidationContext): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of catalog) {
    const where = `article ${s.id}`;
    if (ids.has(s.id)) errors.push(`${where} : identifiant dupliqué`);
    ids.add(s.id);
    if (!(s.referenceEurCents > 0)) errors.push(`${where} : prix de référence manquant`);
    for (const f of FORBIDDEN_FIELDS) if (f in (s as unknown as Record<string, unknown>) || f in (s.contents as Record<string, unknown>)) errors.push(`${where} : champ interdit « ${f} » (rareté ou hasard payant)`);
    // COM-01 : un minuteur ne s'affiche que lié à une date de fin réelle et future.
    if (s.showTimer && (!s.endAt || s.endAt <= ctx.now)) errors.push(`${where} : minuteur sans date de fin réelle`);
    if (s.labelLimited && !s.endAt) errors.push(`${where} : « limitée » sans date de fin`);
    // COM-03 : « limitée » au plus une fois par article sur 12 mois glissants.
    if (s.labelLimited && ctx.limitedHistory.some((h) => h.skuId === s.id && ctx.now - h.at < 365 * DAY)) errors.push(`${where} : déjà présenté comme « limité » dans les 12 derniers mois`);
    // COM-11 : le prix de référence d'une réduction est le plus bas réellement pratiqué sur 30 jours.
    if (s.discountFromCents !== undefined) {
      const recent = ctx.priceHistory.filter((p) => p.skuId === s.id && p.to >= ctx.now - 30 * DAY && p.from <= ctx.now);
      if (recent.length === 0) errors.push(`${where} : réduction sans prix pratiqué dans les 30 derniers jours`);
      else {
        const lowest = Math.min(...recent.map((p) => p.eurCents));
        if (s.discountFromCents !== lowest) errors.push(`${where} : prix de référence ${s.discountFromCents} ≠ prix le plus bas des 30 derniers jours (${lowest})`);
        if (s.referenceEurCents >= s.discountFromCents) errors.push(`${where} : « réduction » qui n'en est pas une`);
      }
    }
    if (s.kind === "subscription" && !s.period) errors.push(`${where} : abonnement sans période`);
  }
  // DIG-02 : préavis de fermeture d'au moins 90 jours ; dès l'annonce, plus rien à vendre.
  if (ctx.sunset) {
    if (ctx.sunset.closesAt - ctx.sunset.announcedAt < 90 * DAY) errors.push("fermeture : préavis inférieur à 90 jours");
    if (ctx.now >= ctx.sunset.announcedAt && catalog.length > 0) errors.push("fermeture annoncée : le catalogue servi doit être vide");
  }
  return errors;
}

/** Catalogue réellement proposé à un instant donné (articles expirés retirés, fermeture annoncée → rien). */
export function servedCatalog(catalog: Sku[], ctx: Pick<ValidationContext, "now" | "sunset">): Sku[] {
  if (ctx.sunset && ctx.now >= ctx.sunset.announcedAt) return [];
  return catalog.filter((s) => !s.endAt || s.endAt > ctx.now);
}

/** Pourcentage de réduction affiché, calculé (jamais saisi à la main). */
export function discountPercent(s: Sku): number | null {
  if (s.discountFromCents === undefined) return null;
  return Math.round((1 - s.referenceEurCents / s.discountFromCents) * 100);
}
