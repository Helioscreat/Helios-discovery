import { skuById, type Sku } from "./catalog";
import { credit, revoke, type Wallet } from "./wallet";

/**
 * Vérification des achats (COM-17). Le crédit n'est accordé qu'après vérification serveur du reçu
 * (Google Play Developer API / App Store Server API) ; chaque commande n'est créditée qu'une fois ;
 * un remboursement retire le contenu non consommé.
 *
 * `ReceiptVerifier` est l'interface que le serveur implémente pour chaque store. Les implémentations réelles
 * exigent les identifiants de l'éditeur (compte de service Google, clé App Store Connect) : elles seront
 * branchées au déploiement ; ici, un vérificateur simulé reproduit leurs réponses pour les tests.
 */
export interface Receipt {
  platform: "google" | "apple" | "mock";
  orderId: string;
  skuId: string;
  token: string;
}

export interface VerifiedPurchase {
  orderId: string;
  skuId: string;
  state: "purchased" | "pending" | "refunded" | "invalid";
  eurCents: number;
  at: number;
}

export interface ReceiptVerifier {
  verify(r: Receipt): Promise<VerifiedPurchase>;
}

export interface LedgerEntry {
  orderId: string;
  skuId: string;
  eurCents: number;
  at: number;
  state: "credited" | "refunded";
}

export interface Account {
  wallet: Wallet;
  ledger: LedgerEntry[];
}

export type ApplyResult = { ok: true; account: Account; credited: boolean; reason?: string } | { ok: false; account: Account; reason: string };

/**
 * Applique un achat vérifié. Idempotent : un orderId déjà crédité ne l'est pas deux fois.
 * Les achats en attente (contrôle parental, « Demander l'autorisation ») ne créditent rien (AGE-08).
 */
export function applyVerified(acc: Account, v: VerifiedPurchase, now: number, catalog?: Sku[]): ApplyResult {
  if (v.state === "invalid") return { ok: false, account: acc, reason: "reçu invalide" };
  if (v.state === "pending") return { ok: true, account: acc, credited: false, reason: "en attente d'approbation" };
  const existing = acc.ledger.find((e) => e.orderId === v.orderId);
  const sku = skuById(v.skuId, catalog);
  if (v.state === "refunded") {
    if (!existing || existing.state === "refunded") return { ok: true, account: acc, credited: false, reason: "rien à rembourser" };
    return {
      ok: true,
      credited: false,
      account: {
        wallet: revoke(acc.wallet, sku.contents),
        ledger: acc.ledger.map((e) => (e.orderId === v.orderId ? { ...e, state: "refunded" } : e)),
      },
    };
  }
  if (existing) return { ok: true, account: acc, credited: false, reason: "déjà crédité" };
  if (sku.kind === "oneTime" && acc.wallet.ownedOnce.includes(sku.id)) return { ok: false, account: acc, reason: "achat unique déjà effectué" };
  let wallet = credit(acc.wallet, sku.contents, now);
  if (sku.kind === "oneTime") wallet = { ...wallet, ownedOnce: [...wallet.ownedOnce, sku.id] };
  if (sku.kind === "subscription") wallet = { ...wallet, subscription: { skuId: sku.id, activeUntil: now + 30 * 86_400_000, lastPerkDay: -1 } };
  return {
    ok: true,
    credited: true,
    account: { wallet, ledger: [...acc.ledger, { orderId: v.orderId, skuId: v.skuId, eurCents: v.eurCents, at: v.at, state: "credited" }] },
  };
}

/** Dépense du mois civil (UTC) à partir du grand livre (reçus vérifiés, remboursements exclus) — WELL-01, AGE-07. */
export function monthlySpendCents(ledger: LedgerEntry[], now: number): number {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return ledger.filter((e) => e.state === "credited" && e.at >= start && e.at <= now).reduce((a, e) => a + e.eurCents, 0);
}

/** Récapitulatif mensuel des dépenses (Paramètres > Achats). */
export function spendRecap(ledger: LedgerEntry[]): { month: string; eurCents: number; purchases: number }[] {
  const by = new Map<string, { eurCents: number; purchases: number }>();
  for (const e of ledger) {
    if (e.state !== "credited") continue;
    const d = new Date(e.at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = by.get(key) ?? { eurCents: 0, purchases: 0 };
    by.set(key, { eurCents: cur.eurCents + e.eurCents, purchases: cur.purchases + 1 });
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v }));
}

/** Vérificateur simulé (tests, version web) : reproduit les états renvoyés par les stores. */
export class MockVerifier implements ReceiptVerifier {
  private states = new Map<string, VerifiedPurchase["state"]>();
  constructor(private readonly prices: Record<string, number>, private readonly clock: () => number) {}
  setState(orderId: string, s: VerifiedPurchase["state"]): void {
    this.states.set(orderId, s);
  }
  async verify(r: Receipt): Promise<VerifiedPurchase> {
    const valid = r.token === `signed:${r.orderId}:${r.skuId}`;
    return {
      orderId: r.orderId,
      skuId: r.skuId,
      state: valid ? (this.states.get(r.orderId) ?? "purchased") : "invalid",
      eurCents: this.prices[r.skuId] ?? 0,
      at: this.clock(),
    };
  }
}
