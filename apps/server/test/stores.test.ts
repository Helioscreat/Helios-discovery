import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Receipt, ReceiptVerifier, VerifiedPurchase } from "@helios/economy";
import { openDb, Service } from "../src";
import { AppStoreVerifier, GooglePlayVerifier, jwsPayload, storeVerifiersFromEnv } from "../src/stores";

const NOW = Date.UTC(2026, 10, 5, 12);
const ACCOUNT = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };
function fakeFetch(routes: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const c = { url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body };
    calls.push(c);
    const r = routes(c);
    return { ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { fetch, calls };
}

/** Vérifie la signature d'un JWT avec la clé publique. */
function verifyJwt(jwt: string, publicKey: string, alg: "RS256" | "ES256") {
  const [h, p, s] = jwt.split(".");
  const v = createVerify("SHA256");
  v.update(`${h}.${p}`);
  return { ok: v.verify(alg === "ES256" ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey, fromB64url(s)), header: JSON.parse(fromB64url(h).toString()), payload: JSON.parse(fromB64url(p).toString()) };
}

describe("Google Play Developer API", () => {
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const sa = { client_email: "verif@helios.iam.gserviceaccount.com", private_key: rsa.privateKey };
  const product = (purchase: Record<string, unknown>) =>
    fakeFetch((c) => {
      if (c.url === "https://oauth2.googleapis.com/token") return { status: 200, body: { access_token: "AT", expires_in: 3600 } };
      if (c.url.includes("/purchases/products/") && c.method === "GET") return { status: 200, body: purchase };
      if (c.url.endsWith(":acknowledge")) return { status: 204 };
      return { status: 404 };
    });
  const receipt: Receipt = { platform: "google", orderId: "GPA.1111-2222", skuId: "boosters_m", token: "tok-123" };

  it("authentification par compte de service : JWT RS256 signé, portée androidpublisher, jeton réutilisé", async () => {
    const f = product({ purchaseState: 0, orderId: "GPA.1111-2222", obfuscatedExternalAccountId: ACCOUNT });
    const v = new GooglePlayVerifier({ packageName: "com.helioscreat.heliosdiscovery", serviceAccount: sa, fetch: f.fetch, clock: () => NOW });
    await v.verify(receipt, { accountId: ACCOUNT });
    await v.verify(receipt, { accountId: ACCOUNT });
    const oauth = f.calls.filter((c) => c.url.includes("oauth2"));
    expect(oauth).toHaveLength(1);
    const assertion = new URLSearchParams(oauth[0].body).get("assertion")!;
    const j = verifyJwt(assertion, rsa.publicKey, "RS256");
    expect(j.ok).toBe(true);
    expect(j.payload).toMatchObject({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token" });
    const api = f.calls.find((c) => c.url.includes("androidpublisher"))!;
    expect(api.url).toBe("https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.helioscreat.heliosdiscovery/purchases/products/boosters_m/tokens/tok-123");
    expect(api.headers.authorization).toBe("Bearer AT");
  });

  it("états : acheté, en attente, annulé ; reçu d'un autre compte ou jeton inconnu : invalide", async () => {
    const run = async (p: Record<string, unknown>, account = ACCOUNT) =>
      (await new GooglePlayVerifier({ packageName: "p", serviceAccount: sa, fetch: product(p).fetch, clock: () => NOW }).verify(receipt, { accountId: account })).state;
    expect(await run({ purchaseState: 0, obfuscatedExternalAccountId: ACCOUNT })).toBe("purchased");
    expect(await run({ purchaseState: 2, obfuscatedExternalAccountId: ACCOUNT })).toBe("pending");
    expect(await run({ purchaseState: 1, obfuscatedExternalAccountId: ACCOUNT })).toBe("refunded");
    expect(await run({ purchaseState: 0, obfuscatedExternalAccountId: "autre-compte" })).toBe("invalid");
    const unknown = fakeFetch((c) => (c.url.includes("oauth2") ? { status: 200, body: { access_token: "AT", expires_in: 3600 } } : { status: 410 }));
    expect((await new GooglePlayVerifier({ packageName: "p", serviceAccount: sa, fetch: unknown.fetch, clock: () => NOW }).verify(receipt)).state).toBe("invalid");
  });

  it("panne de Google : erreur remontée (rien n'est crédité), pas de faux « invalide »", async () => {
    const down = fakeFetch((c) => (c.url.includes("oauth2") ? { status: 200, body: { access_token: "AT", expires_in: 3600 } } : { status: 503 }));
    await expect(new GooglePlayVerifier({ packageName: "p", serviceAccount: sa, fetch: down.fetch, clock: () => NOW }).verify(receipt)).rejects.toThrow(/503/);
  });

  it("abonnement : API subscriptionsv2, fin de période reprise ; acquittement côté serveur", async () => {
    const f = fakeFetch((c) => {
      if (c.url.includes("oauth2")) return { status: 200, body: { access_token: "AT", expires_in: 3600 } };
      if (c.url.includes("subscriptionsv2")) return { status: 200, body: { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [{ productId: "gardener_monthly", expiryTime: "2026-12-05T12:00:00Z", latestSuccessfulOrderId: "GPA.9..0" }], externalAccountIdentifiers: { obfuscatedExternalAccountId: ACCOUNT } } };
      if (c.url.endsWith(":acknowledge")) return { status: 204 };
      return { status: 404 };
    });
    const v = new GooglePlayVerifier({ packageName: "p", serviceAccount: sa, fetch: f.fetch, clock: () => NOW });
    const sub: Receipt = { platform: "google", orderId: "GPA.9..0", skuId: "gardener_monthly", token: "sub-tok" };
    expect(await v.verify(sub, { accountId: ACCOUNT })).toMatchObject({ state: "purchased", orderId: "GPA.9..0", expiresAt: Date.parse("2026-12-05T12:00:00Z") });
    await v.acknowledge(sub);
    expect(f.calls.at(-1)).toMatchObject({ method: "POST", url: "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/p/purchases/subscriptions/gardener_monthly/tokens/sub-tok:acknowledge" });
  });
});

describe("App Store Server API", () => {
  const ec = generateKeyPairSync("ec", { namedCurve: "P-256", publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const cfg = { issuerId: "57246542-96fe-1a63-e053-0824d011072a", keyId: "2X9R4HXF34", privateKey: ec.privateKey, bundleId: "com.helioscreat.heliosdiscovery" };
  const jws = (t: Record<string, unknown>) => `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(t)).toString("base64url")}.sig`;
  const tx = { transactionId: "2000000123", productId: "boosters_m", bundleId: cfg.bundleId, appAccountToken: ACCOUNT, purchaseDate: NOW };
  const receipt: Receipt = { platform: "apple", orderId: "2000000123", skuId: "boosters_m", token: "2000000123" };

  it("JWT ES256 conforme (kid, iss, aud appstoreconnect-v1, bid, durée ≤ 60 min) ; signature vérifiable", () => {
    const v = new AppStoreVerifier({ ...cfg, clock: () => NOW });
    const j = verifyJwt(v.jwt(), ec.publicKey, "ES256");
    expect(j.ok).toBe(true);
    expect(j.header).toEqual({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
    expect(j.payload).toMatchObject({ iss: cfg.issuerId, aud: "appstoreconnect-v1", bid: cfg.bundleId });
    expect(j.payload.exp - j.payload.iat).toBeLessThanOrEqual(3600);
  });

  it("transaction de production, puis repli sur le bac à sable (TestFlight) ; liaison au compte ; remboursement", async () => {
    const f = fakeFetch((c) => (c.url.startsWith(AppStoreVerifier.SANDBOX) ? { status: 200, body: { signedTransactionInfo: jws(tx) } } : { status: 404 }));
    const v = new AppStoreVerifier({ ...cfg, fetch: f.fetch, clock: () => NOW });
    expect(await v.verify(receipt, { accountId: ACCOUNT })).toMatchObject({ state: "purchased", orderId: "2000000123" });
    expect(f.calls.map((c) => c.url)).toEqual([`${AppStoreVerifier.PRODUCTION}/inApps/v1/transactions/2000000123`, `${AppStoreVerifier.SANDBOX}/inApps/v1/transactions/2000000123`]);
    expect(await v.verify(receipt, { accountId: "7a1c2d3e-0000-4c7d-8e9f-0a1b2c3d4e5f" })).toMatchObject({ state: "invalid" });
    const refunded = fakeFetch(() => ({ status: 200, body: { signedTransactionInfo: jws({ ...tx, revocationDate: NOW }) } }));
    expect((await new AppStoreVerifier({ ...cfg, fetch: refunded.fetch, clock: () => NOW }).verify(receipt, { accountId: ACCOUNT })).state).toBe("refunded");
    const otherApp = fakeFetch(() => ({ status: 200, body: { signedTransactionInfo: jws({ ...tx, bundleId: "com.autre.app" }) } }));
    expect((await new AppStoreVerifier({ ...cfg, fetch: otherApp.fetch, clock: () => NOW }).verify(receipt, { accountId: ACCOUNT })).state).toBe("invalid");
    expect(jwsPayload<{ productId: string }>(jws(tx)).productId).toBe("boosters_m");
  });
});

describe("configuration et service", () => {
  const mock: ReceiptVerifier = { verify: async () => ({ orderId: "x", skuId: "boosters_m", state: "invalid", eurCents: 0, at: 0 }) };
  it("production : reçus simulés refusés ; ALLOW_MOCK_RECEIPTS=1 interdit", () => {
    expect(storeVerifiersFromEnv({ NODE_ENV: "production" }, () => "", mock).platforms).toEqual([]);
    expect(() => storeVerifiersFromEnv({ NODE_ENV: "production", ALLOW_MOCK_RECEIPTS: "1" }, () => "", mock)).toThrow(/interdit/);
    expect(storeVerifiersFromEnv({}, () => "", mock).platforms).toEqual(["mock"]);
  });

  it("le service lie le reçu au compte, acquitte après crédit, renvoie l'achat vérifié ; store en panne → 503 sans crédit", async () => {
    const seen: { accountId?: string; acked: string[] } = { acked: [] };
    let fail = false;
    const verifier: ReceiptVerifier = {
      verify: async (r, ctx): Promise<VerifiedPurchase> => {
        if (fail) throw new Error("Google Play API : 503");
        seen.accountId = ctx?.accountId;
        return { orderId: r.orderId, skuId: r.skuId, state: "purchased", eurCents: 999, at: NOW };
      },
      acknowledge: async (r) => void seen.acked.push(r.orderId),
    };
    const db = openDb();
    const svc = new Service(db, { clock: () => NOW, deletionDelayMs: 1, moderators: [], contact: { email: "c@x.eu", languages: ["fr"] }, minorCapCents: 2000, adminKeys: [], verifier });
    const p = svc.authenticate(svc.createAccount("FR").token);
    const out = await svc.verifyPurchase(p, { platform: "google", orderId: "GPA.1", skuId: "boosters_m", token: "t" });
    expect(out).toMatchObject({ credited: true, state: "purchased", purchase: { orderId: "GPA.1", eurCents: 999 } });
    expect(seen).toEqual({ accountId: p.id, acked: ["GPA.1"] });
    expect((await svc.verifyPurchase(p, { platform: "google", orderId: "GPA.1", skuId: "boosters_m", token: "t" })).credited).toBe(false); // une seule fois
    fail = true;
    await expect(svc.verifyPurchase(p, { platform: "google", orderId: "GPA.2", skuId: "boosters_m", token: "t" })).rejects.toMatchObject({ status: 503, code: "storeUnavailable" });
    expect((db.prepare("SELECT COUNT(*) n FROM ledger WHERE order_id = 'GPA.2'").get() as { n: number }).n).toBe(0);
  });
});
