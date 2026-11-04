import { COIN_PRICES } from "./catalog";

export type AgeBand = "unknown" | "minor" | "adult";

/** Âge des protections commerciales : < 18 ans (DSA art. 28, 2005/29/CE annexe I pt 28). Âge inconnu = protégé. */
export const isProtected = (age: AgeBand) => age !== "adult";

export interface ContinueOffer {
  /** Option gratuite en pièces, si le joueur en a assez. */
  coins: number | null;
  /** Option payante (article du store) : jamais proposée à un joueur protégé (AGE-06). */
  skuId: string | null;
  extraMoves: number;
}

/**
 * Offre « +5 coups » à l'échec (COM-13) : prix FIXE, identique à chaque tentative et pour tous —
 * le numéro de tentative, la série d'échecs et l'historique de dépense ne sont pas des paramètres.
 */
export function continueOffer(age: AgeBand, coinsOwned: number): ContinueOffer {
  return {
    coins: coinsOwned >= COIN_PRICES.extraMoves ? COIN_PRICES.extraMoves : null,
    skuId: isProtected(age) ? null : "extra_moves",
    extraMoves: 5,
  };
}
