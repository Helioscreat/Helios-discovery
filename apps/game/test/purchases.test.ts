import { describe, expect, it } from "vitest";
import { skuById, type PurchaseOutcome, type Receipt, type StoreAdapter, type VerifiedPurchase } from "@helios/economy";
import { newMeta, Shop, type PurchaseRemote } from "../src/game/meta";
import { NativeStore } from "../src/game/nativeStore";
import { newProfile } from "../src/game/profile";

const NOW = Date.UTC(2026, 10, 5, 12);
const ACCOUNT = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";

/** Store réel simulé (comportement de Google Play) : enregistre les appels. */
function fakeStore(outcome: (id: string) => PurchaseOutcome) {
  const log = { purchases: [] as string[], finished: [] as string[] };
  const store: StoreAdapter = {
    platform: "google",
    products: async () => [],
    purchase: async (id) => (log.purchases.push(id), outcome(id)),
    finish: async (r) => void log.finished.push(r.orderId),
    unfinished: async () => [],
  };
  return { store, log };
}
const receipt = (orderId: string, skuId = "boosters_m"): Receipt => ({ platform: "google", orderId, skuId, token: `tok-${orderId}` });
const purchased = (r: Receipt): VerifiedPurchase => ({ orderId: r.orderId, skuId: r.skuId, state: "purchased", eurCents: skuById(r.skuId).referenceEurCents, at: NOW });

function remote(over: Partial<PurchaseRemote> = {}): PurchaseRemote & { verified: string[] } {
  const verified: string[] = [];
  return { verified, accountId: () => ACCOUNT, authorize: async () => ({ allowed: true }), verify: async (r) => (verified.push(r.orderId), purchased(r)), ...over };
}

describe("achats réels : le serveur est l'autorité", () => {
  it("sans serveur : aucun paiement n'est lancé (message « connexion nécessaire »)", async () => {
    const { store, log } = fakeStore((id) => ({ kind: "receipt", receipt: receipt("GPA.1", id) }));
    const shop = new Shop(() => NOW, store);
    expect(await shop.buy(newMeta(NOW), newProfile(), skuById("boosters_m"))).toEqual({ ok: false, reason: "offline" });
    expect(log.purchases).toEqual([]);
  });

  it("plafond refusé par le serveur : aucun paiement lancé", async () => {
    const { store, log } = fakeStore((id) => ({ kind: "receipt", receipt: receipt("GPA.1", id) }));
    const shop = new Shop(() => NOW, store);
    shop.remote = remote({ authorize: async () => ({ allowed: false, reason: "cap" }) });
    expect(await shop.buy(newMeta(NOW), newProfile(), skuById("boosters_m"))).toEqual({ ok: false, reason: "cap" });
    expect(log.purchases).toEqual([]);
  });

  it("reçu vérifié par le serveur → crédit une seule fois → transaction clôturée chez le store", async () => {
    const { store, log } = fakeStore((id) => ({ kind: "receipt", receipt: receipt("GPA.1", id) }));
    const shop = new Shop(() => NOW, store);
    const r = remote();
    shop.remote = r;
    const meta = newMeta(NOW), profile = newProfile();
    expect(await shop.buy(meta, profile, skuById("boosters_m"))).toEqual({ ok: true });
    expect(r.verified).toEqual(["GPA.1"]);
    expect(log.finished).toEqual(["GPA.1"]);
    const hammers = profile.inventory.hammer;
    expect(hammers).toBeGreaterThan(0);
    await shop.settle(meta, profile, receipt("GPA.1"));
    expect(profile.inventory.hammer).toBe(hammers); // pas de double crédit
    expect(meta.account.ledger.filter((e) => e.orderId === "GPA.1")).toHaveLength(1);
  });

  it("serveur injoignable après paiement : rien n'est crédité ni clôturé ; repris au lancement suivant", async () => {
    const { store, log } = fakeStore((id) => ({ kind: "receipt", receipt: receipt("GPA.2", id) }));
    const shop = new Shop(() => NOW, store);
    shop.remote = remote({ verify: async () => { throw new Error("503"); } });
    const meta = newMeta(NOW), profile = newProfile();
    expect(await shop.buy(meta, profile, skuById("boosters_m"))).toEqual({ ok: false, reason: "verifyLater" });
    expect([profile.inventory.hammer, log.finished.length, meta.account.ledger.length]).toEqual([0, 0, 0]);
    shop.remote = remote();
    store.unfinished = async () => [receipt("GPA.2")];
    const credited = await shop.recover(meta, profile);
    expect(credited.map((s) => s.id)).toEqual(["boosters_m"]);
    expect(profile.inventory.hammer).toBeGreaterThan(0);
    expect(log.finished).toEqual(["GPA.2"]);
  });

  it("reçu refusé par le serveur (autre compte, faux reçu) : rien n'est crédité ni clôturé", async () => {
    const { store, log } = fakeStore((id) => ({ kind: "receipt", receipt: receipt("GPA.3", id) }));
    const shop = new Shop(() => NOW, store);
    shop.remote = remote({ verify: async (r) => ({ ...purchased(r), state: "invalid" }) });
    const profile = newProfile();
    expect(await shop.buy(newMeta(NOW), profile, skuById("boosters_m"))).toEqual({ ok: false, reason: "invalid" });
    expect([profile.inventory.hammer, log.finished.length]).toEqual([0, 0]);
  });
});

describe("NativeStore (@capgo/native-purchases)", () => {
  function fakePlugin(tx: Record<string, unknown> | Error) {
    const calls: { m: string; o?: Record<string, unknown> }[] = [];
    const rec = (m: string) => async (o?: Record<string, unknown>) => {
      calls.push({ m, o });
      if (m === "purchaseProduct") {
        if (tx instanceof Error) throw tx;
        return tx;
      }
      if (m === "getProducts") return { products: (o!.productIdentifiers as string[]).map((id) => ({ identifier: id, priceString: "9,99 €", currencyCode: "EUR", price: 9.99 })) };
      if (m === "getUnfinishedTransactions") return { transactions: [] };
      return undefined;
    };
    // « then » non défini : sinon await prendrait le faux plugin pour une promesse.
    const P = new Proxy({}, { get: (_t, m: string) => (m === "then" ? undefined : rec(m)) });
    return { plugin: Promise.resolve(P as never), calls };
  }

  it("Android : achat lié au compte, jamais acquitté ni consommé avant crédit ; forfait de base pour l'abonnement", async () => {
    const f = fakePlugin({ transactionId: "t", productIdentifier: "gardener_monthly", purchaseToken: "ptok", orderId: "GPA.7" });
    const s = new NativeStore("google", () => ACCOUNT, f.plugin);
    const out = await s.purchase("gardener_monthly");
    expect(out).toEqual({ kind: "receipt", receipt: { platform: "google", orderId: "GPA.7", skuId: "gardener_monthly", token: "ptok" } });
    expect(f.calls[0]).toEqual({ m: "configure", o: { autoFinishTransactions: false } });
    expect(f.calls.find((c) => c.m === "purchaseProduct")!.o).toMatchObject({ productIdentifier: "gardener_monthly", productType: "subs", planIdentifier: "mensuel", appAccountToken: ACCOUNT, isConsumable: false, autoAcknowledgePurchases: false });
  });

  it("clôture : consommable consommé, achat unique acquitté (Android) ; finishTransaction (iOS)", async () => {
    const f = fakePlugin({});
    const g = new NativeStore("google", () => ACCOUNT, f.plugin);
    await g.finish(receipt("GPA.1", "boosters_m"));
    await g.finish(receipt("GPA.2", "starter_pack"));
    expect(f.calls.filter((c) => c.m !== "configure").map((c) => [c.m, c.o?.purchaseToken])).toEqual([["consumePurchase", "tok-GPA.1"], ["acknowledgePurchase", "tok-GPA.2"]]);
    const a = fakePlugin({});
    await new NativeStore("apple", () => ACCOUNT, a.plugin).finish({ platform: "apple", orderId: "200", skuId: "boosters_m", token: "200" });
    expect(a.calls.at(-1)).toEqual({ m: "finishTransaction", o: { transactionId: "200" } });
  });

  it("annulation par le joueur : « annulé », aucune erreur ; prix lus dans le store par type de produit", async () => {
    const f = fakePlugin(Object.assign(new Error("User cancelled the purchase"), { code: "USER_CANCELLED" }));
    const s = new NativeStore("google", () => ACCOUNT, f.plugin);
    expect(await s.purchase("boosters_m")).toEqual({ kind: "cancelled" });
    const prices = await s.products(["boosters_m", "gardener_monthly"]);
    expect(prices.map((p) => p.id)).toEqual(["boosters_m", "gardener_monthly"]);
    expect(f.calls.filter((c) => c.m === "getProducts").map((c) => c.o?.productType)).toEqual(["inapp", "subs"]);
  });

  it("sans compte : aucun achat lancé", async () => {
    const f = fakePlugin({});
    await expect(new NativeStore("apple", () => null, f.plugin).purchase("boosters_m")).rejects.toThrow(/compte/);
    expect(f.calls.some((c) => c.m === "purchaseProduct")).toBe(false);
  });
});
