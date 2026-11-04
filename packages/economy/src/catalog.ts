import type { Booster } from "@helios/core";

/**
 * Catalogue de la boutique. Règles (vérifiées par `validateCatalog`) :
 *  - aucun contenu aléatoire dans un article payant (RNG-01) ;
 *  - aucune monnaie premium : tout se vend directement en euros via le store (COM-15) ;
 *  - aucun champ de stock ni de rareté (COM-02) ; un minuteur exige une date de fin réelle (COM-01) ;
 *  - le libellé « limitée » au plus une fois par article sur 12 mois (COM-03) ;
 *  - une réduction n'est affichée que par rapport à un prix réellement pratiqué (COM-11).
 * Le prix affiché vient TOUJOURS du store (devise et TTC locaux) ; `referenceEurCents` sert aux
 * contrôles, aux tests et au plafond de dépense des mineurs, jamais à l'affichage (COM-10).
 */
export type SkuKind = "consumable" | "oneTime" | "timed" | "subscription" | "seasonPass";

export interface Contents {
  boosters?: Partial<Record<Booster, number>>;
  /** Vies illimitées, en minutes. */
  unlimitedLivesMin?: number;
  coins?: number;
  /** +5 coups (utilisé immédiatement). */
  extraMoves?: number;
}

export interface Sku {
  id: string;
  kind: SkuKind;
  /** Clé de texte du nom et de la description complète. */
  nameKey: string;
  contents: Contents;
  /** Prix de référence TTC en centimes d'euro (contrôles, plafond mineurs) ; l'affichage utilise le prix du store. */
  referenceEurCents: number;
  /** Abonnement : période de renouvellement. */
  period?: "P1M";
  /** Avantages quotidiens de l'abonnement. */
  dailyPerks?: Contents;
  /** Passe de saison : niveau d'accès. */
  passTier?: "premium" | "premiumPlus";
  /** Affichage : un article « limité » doit avoir une fin réelle. */
  labelLimited?: boolean;
  showTimer?: boolean;
  endAt?: number;
  /** Prix barré : identifiant d'une entrée d'historique de prix réellement pratiqué. */
  discountFromCents?: number;
  /** Interdit : tout contenu aléatoire (le validateur le refuse). */
  random?: unknown;
}

export const CATALOG: Sku[] = [
  { id: "starter_pack", kind: "oneTime", nameKey: "sku.starter_pack", referenceEurCents: 99, contents: { boosters: { hammer: 3, bomb: 2, starterKit: 1 }, unlimitedLivesMin: 60 } },
  { id: "extra_moves", kind: "consumable", nameKey: "sku.extra_moves", referenceEurCents: 99, contents: { extraMoves: 5 } },
  { id: "lives_1h", kind: "timed", nameKey: "sku.lives_1h", referenceEurCents: 99, contents: { unlimitedLivesMin: 60 } },
  { id: "lives_3h", kind: "timed", nameKey: "sku.lives_3h", referenceEurCents: 199, contents: { unlimitedLivesMin: 180 } },
  { id: "lives_24h", kind: "timed", nameKey: "sku.lives_24h", referenceEurCents: 499, contents: { unlimitedLivesMin: 1440 } },
  { id: "boosters_s", kind: "consumable", nameKey: "sku.boosters_s", referenceEurCents: 499, contents: { boosters: { hammer: 3, bomb: 3, rainbow: 1, fireCross: 2, shuffler: 1 } } },
  { id: "boosters_m", kind: "consumable", nameKey: "sku.boosters_m", referenceEurCents: 999, contents: { boosters: { hammer: 6, bomb: 6, rainbow: 3, fireCross: 4, shuffler: 3, starterKit: 2 } } },
  { id: "boosters_l", kind: "consumable", nameKey: "sku.boosters_l", referenceEurCents: 1999, contents: { boosters: { hammer: 12, bomb: 12, rainbow: 7, fireCross: 8, shuffler: 6, starterKit: 5 }, unlimitedLivesMin: 180 } },
  { id: "boosters_xl", kind: "consumable", nameKey: "sku.boosters_xl", referenceEurCents: 4999, contents: { boosters: { hammer: 30, bomb: 30, rainbow: 18, fireCross: 20, shuffler: 15, starterKit: 12 }, unlimitedLivesMin: 1440 } },
  { id: "gardener_monthly", kind: "subscription", nameKey: "sku.gardener_monthly", referenceEurCents: 499, period: "P1M", contents: {}, dailyPerks: { boosters: { hammer: 1 }, unlimitedLivesMin: 30 } },
  { id: "pass_premium", kind: "seasonPass", nameKey: "sku.pass_premium", referenceEurCents: 499, passTier: "premium", contents: {} },
  { id: "pass_premium_plus", kind: "seasonPass", nameKey: "sku.pass_premium_plus", referenceEurCents: 999, passTier: "premiumPlus", contents: {} },
];

export const skuById = (id: string, catalog: Sku[] = CATALOG): Sku => {
  const s = catalog.find((x) => x.id === id);
  if (!s) throw new Error(`article inconnu : ${id}`);
  return s;
};

/** Prix en pièces (monnaie gagnée en jouant, jamais achetable). */
export const COIN_PRICES = {
  extraMoves: 900,
  refillLives: 600,
  boosters: { hammer: 300, bomb: 500, rainbow: 900, fireCross: 600, shuffler: 400, starterKit: 800 } as Record<Booster, number>,
};

/** Gains en pièces. */
export const COIN_REWARDS = { winBase: 20, perStar: 10, dailyQuest: 100, rewardedAd: 50 };
