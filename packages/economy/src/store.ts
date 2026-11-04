import { skuById, type Sku } from "./catalog";
import { isProtected, type AgeBand } from "./continue";
import type { Receipt } from "./receipts";
import { monthlySpendCents, type LedgerEntry } from "./receipts";

/**
 * Interface avec les systèmes de paiement officiels (Google Play Billing, StoreKit 2 — App Store 3.1.1).
 * Le jeu n'affiche que les prix fournis par le store (devise locale, TTC), jamais un prix codé en dur (COM-10).
 */
export interface StoreProduct {
  id: string;
  /** Prix formaté par le store, ex. « 0,99 € » ou « 10,90 kr ». */
  price: string;
  currency: string;
  priceMicros: number;
}

export type PurchaseOutcome = { kind: "receipt"; receipt: Receipt } | { kind: "cancelled" } | { kind: "pending"; orderId: string };

export interface StoreAdapter {
  platform: "google" | "apple" | "mock";
  products(ids: string[]): Promise<StoreProduct[]>;
  purchase(id: string): Promise<PurchaseOutcome>;
}

/** Liens officiels : gestion / résiliation d'abonnement (COM-14) et remboursement (COM-12). */
export function manageSubscriptionUrl(platform: StoreAdapter["platform"], skuId: string, packageName = "com.helioscreat.heliosdiscovery"): string {
  return platform === "apple"
    ? "https://apps.apple.com/account/subscriptions"
    : `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(skuId)}&package=${encodeURIComponent(packageName)}`;
}

export function refundUrl(platform: StoreAdapter["platform"]): string {
  return platform === "apple" ? "https://reportaproblem.apple.com/" : "https://support.google.com/googleplay/answer/2479637";
}

/** Magasin simulé (version web, tests) : prix formatés comme un store, dans la devise choisie. */
export class MockStore implements StoreAdapter {
  platform = "mock" as const;
  private n = 0;
  constructor(
    private readonly catalog: Sku[],
    private readonly locale = "fr-FR",
    private readonly currency = "EUR",
    /** Taux appliqué aux prix de référence en euros (ex. 11,5 pour des couronnes suédoises). */
    private readonly rate = 1,
    public behaviour: "buy" | "cancel" | "pending" = "buy",
  ) {}
  async products(ids: string[]): Promise<StoreProduct[]> {
    const fmt = new Intl.NumberFormat(this.locale, { style: "currency", currency: this.currency });
    return ids.map((id) => {
      const s = skuById(id, this.catalog);
      const amount = Math.round(s.referenceEurCents * this.rate) / 100;
      return { id, price: fmt.format(amount), currency: this.currency, priceMicros: Math.round(amount * 1e6) };
    });
  }
  async purchase(id: string): Promise<PurchaseOutcome> {
    if (this.behaviour === "cancel") return { kind: "cancelled" };
    const orderId = `MOCK-${++this.n}-${id}`;
    if (this.behaviour === "pending") return { kind: "pending", orderId };
    return { kind: "receipt", receipt: { platform: "mock", orderId, skuId: id, token: `signed:${orderId}:${id}` } };
  }
}

/** Plafond mensuel de dépense des joueurs protégés (config par pays, défaut 20 €) — AGE-07. */
export const DEFAULT_MINOR_CAP_CENTS = 2000;

export type PurchaseGate = { allowed: true } | { allowed: false; reason: "cap" | "oneTimeOwned" };

/**
 * Autorisation demandée au serveur AVANT d'ouvrir le flux de paiement du store.
 * Le cumul vient du grand livre des reçus vérifiés (côté serveur au déploiement).
 */
export function purchaseGate(age: AgeBand, ledger: LedgerEntry[], sku: Sku, ownedOnce: string[], now: number, capCents = DEFAULT_MINOR_CAP_CENTS): PurchaseGate {
  if (sku.kind === "oneTime" && ownedOnce.includes(sku.id)) return { allowed: false, reason: "oneTimeOwned" };
  if (isProtected(age) && monthlySpendCents(ledger, now) + sku.referenceEurCents > capCents) return { allowed: false, reason: "cap" };
  return { allowed: true };
}
