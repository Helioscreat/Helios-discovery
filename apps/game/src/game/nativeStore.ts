/**
 * Paiement natif : Google Play Billing (Android) et StoreKit 2 (iOS), via @capgo/native-purchases.
 * Le plugin ne contacte que les stores ; aucune transaction n'est clôturée avant la vérification par le serveur
 * de l'éditeur (autoFinishTransactions et autoAcknowledgePurchases à false).
 */
import { skuById, storeProduct, type PurchaseOutcome, type Receipt, type StoreAdapter, type StoreProduct } from "@helios/economy";

interface NativeTransaction {
  transactionId: string;
  productIdentifier: string;
  purchaseToken?: string;
  orderId?: string;
  purchaseState?: string;
}

type Plugin = typeof import("@capgo/native-purchases")["NativePurchases"];

export class NativeStore implements StoreAdapter {
  private readonly plugin: Promise<Plugin>;

  constructor(
    readonly platform: "google" | "apple",
    /** Identifiant pseudonyme du compte (UUID) : lie l'achat au compte (obfuscatedAccountId / appAccountToken). */
    private readonly accountId: () => string | null,
    plugin?: Promise<Plugin>,
  ) {
    this.plugin = (plugin ?? import("@capgo/native-purchases").then((m) => m.NativePurchases)).then(async (P) => {
      await P.configure({ autoFinishTransactions: false });
      return P;
    });
  }

  async products(ids: string[]): Promise<StoreProduct[]> {
    const P = await this.plugin;
    const byType = (type: "inapp" | "subs") => ids.filter((id) => storeProduct(skuById(id)).google.type === type);
    const out: StoreProduct[] = [];
    for (const type of ["inapp", "subs"] as const) {
      const list = byType(type);
      if (!list.length) continue;
      const { products } = await P.getProducts({ productIdentifiers: list, productType: type as never });
      for (const p of products) out.push({ id: p.identifier, price: p.priceString, currency: p.currencyCode, priceMicros: Math.round(p.price * 1e6) });
    }
    return out;
  }

  async purchase(id: string): Promise<PurchaseOutcome> {
    const account = this.accountId();
    if (!account) throw new Error("compte requis pour un achat");
    const P = await this.plugin;
    const spec = storeProduct(skuById(id));
    try {
      const t = (await P.purchaseProduct({
        productIdentifier: id,
        productType: spec.google.type as never,
        ...(this.platform === "google" && spec.google.basePlanId ? { planIdentifier: spec.google.basePlanId } : {}),
        appAccountToken: account,
        isConsumable: false, // consommé seulement après crédit (finish)
        autoAcknowledgePurchases: false,
      })) as NativeTransaction;
      if (this.platform === "google" && /^(2|pending)$/i.test(String(t.purchaseState ?? ""))) return { kind: "pending", orderId: t.orderId ?? t.purchaseToken ?? id };
      return { kind: "receipt", receipt: this.receipt(t, id) };
    } catch (e) {
      const msg = String((e as { message?: string; code?: string })?.code ?? "") + " " + String((e as Error)?.message ?? e);
      if (/cancel/i.test(msg)) return { kind: "cancelled" };
      throw e;
    }
  }

  private receipt(t: NativeTransaction, fallbackSku?: string): Receipt {
    const skuId = t.productIdentifier || fallbackSku || "";
    return this.platform === "google"
      ? { platform: "google", orderId: t.orderId || t.purchaseToken || t.transactionId, skuId, token: t.purchaseToken ?? "" }
      : { platform: "apple", orderId: t.transactionId, skuId, token: t.transactionId };
  }

  async finish(r: Receipt): Promise<void> {
    const P = await this.plugin;
    if (this.platform === "apple") return P.finishTransaction({ transactionId: r.token });
    if (storeProduct(skuById(r.skuId)).google.consumable) return P.consumePurchase({ purchaseToken: r.token });
    // Déjà acquitté par le serveur : un second acquittement est sans effet.
    await P.acknowledgePurchase({ purchaseToken: r.token }).catch(() => undefined);
  }

  async unfinished(): Promise<Receipt[]> {
    const P = await this.plugin;
    const { transactions } = await P.getUnfinishedTransactions();
    return (transactions as NativeTransaction[]).filter((t) => t.productIdentifier).map((t) => this.receipt(t));
  }

  onUpdate(cb: (r: Receipt) => void): void {
    void this.plugin.then((P) => P.addListener("transactionUpdated", (t) => cb(this.receipt(t as NativeTransaction))));
  }
}
