import type { Sku } from "./catalog";

/**
 * Moteur d'offres (COM-07). Signature volontairement fermée : il ne reçoit QUE le pays, la progression
 * et le catalogue. Il n'a accès ni aux échecs, ni à la dépense, ni à la durée de session, ni à l'âge
 * (les joueurs protégés ne reçoivent de toute façon aucune offre mise en avant : voir `featuredOffers`).
 */
export interface OfferInputs {
  country: string;
  levelReached: number;
  catalog: Sku[];
  ownedOnce: string[];
}

/** Articles mis en avant dans la boutique (jamais en fenêtre automatique). */
export function selectOffers(inp: OfferInputs): Sku[] {
  const out: Sku[] = [];
  const starter = inp.catalog.find((s) => s.id === "starter_pack");
  if (starter && !inp.ownedOnce.includes(starter.id) && inp.levelReached >= 8) out.push(starter);
  const boosters = inp.catalog.filter((s) => s.id.startsWith("boosters_"));
  if (inp.levelReached >= 20) out.push(...boosters.slice(0, 2));
  return out;
}

/** Offres mises en avant pour un joueur : aucune pour un joueur protégé (< 18 ans ou âge inconnu). */
export function featuredOffers(inp: OfferInputs, protectedPlayer: boolean): Sku[] {
  return protectedPlayer ? [] : selectOffers(inp);
}
