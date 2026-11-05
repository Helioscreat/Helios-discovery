import type { Sku } from "./catalog";

/**
 * Déclaration de chaque article dans les consoles des stores (Play Console, App Store Connect).
 * L'identifiant de produit est l'identifiant de l'article (`sku.id`), identique sur les deux stores.
 *
 *  - Google Play : « inapp » (produit intégré) ou « subs » (abonnement, avec un forfait de base).
 *    Un produit « consommable » est consommé après crédit pour pouvoir être racheté.
 *  - App Store : consommable, non consommable ou abonnement renouvelable automatiquement.
 *
 * Le passe de saison est consommable : il se rachète à chaque saison (un passe non consommable ne pourrait
 * être acheté qu'une fois par compte de store).
 */
export interface StoreProductSpec {
  productId: string;
  google: { type: "inapp" | "subs"; consumable: boolean; basePlanId?: string };
  apple: { type: "consumable" | "nonConsumable" | "autoRenewable"; subscriptionGroup?: string };
}

export const GOOGLE_BASE_PLAN = "mensuel";
export const APPLE_SUBSCRIPTION_GROUP = "jardinier";

export function storeProduct(sku: Sku): StoreProductSpec {
  switch (sku.kind) {
    case "subscription":
      return { productId: sku.id, google: { type: "subs", consumable: false, basePlanId: GOOGLE_BASE_PLAN }, apple: { type: "autoRenewable", subscriptionGroup: APPLE_SUBSCRIPTION_GROUP } };
    case "oneTime":
      return { productId: sku.id, google: { type: "inapp", consumable: false }, apple: { type: "nonConsumable" } };
    case "consumable":
    case "timed":
    case "seasonPass":
      return { productId: sku.id, google: { type: "inapp", consumable: true }, apple: { type: "consumable" } };
  }
}
