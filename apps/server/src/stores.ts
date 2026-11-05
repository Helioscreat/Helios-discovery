/**
 * Vérification des achats auprès des stores (COM-17) : le crédit n'est accordé qu'après une réponse du store.
 *  - Google Play Developer API (androidpublisher v3), authentifiée par un compte de service (JWT RS256 → OAuth 2) ;
 *  - App Store Server API, authentifiée par une clé d'achats intégrés (JWT ES256).
 * Aucune dépendance tierce : signature avec node:crypto, appels avec fetch (injectable pour les tests).
 *
 * Liaison au compte : le jeu transmet l'identifiant pseudonyme du compte au store à l'achat
 * (obfuscatedAccountId chez Google, appAccountToken chez Apple). Un reçu d'un autre compte est refusé.
 */
import { createSign } from "node:crypto";
import { skuById, type Receipt, type ReceiptVerifier, type VerifiedPurchase, type VerifyContext } from "@helios/economy";

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** JWT signé (RS256 pour Google, ES256 pour Apple). */
export function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string): string {
  const alg = header.alg as "RS256" | "ES256";
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(data);
  const sig = signer.sign(alg === "ES256" ? { key: privateKeyPem, dsaEncoding: "ieee-p1363" } : privateKeyPem);
  return `${data}.${b64url(sig)}`;
}

/** Charge utile d'un JWS (sans vérifier sa signature : réservé aux réponses obtenues directement de l'API d'Apple, en TLS). */
export const jwsPayload = <T>(jws: string): T => JSON.parse(fromB64url(jws.split(".")[1] ?? "").toString("utf8")) as T;

class StoreHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// ───────────────────────── Google Play ─────────────────────────
export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GoogleConfig {
  packageName: string;
  serviceAccount: GoogleServiceAccount;
  fetch?: Fetch;
  clock?: () => number;
}

interface ProductPurchase {
  purchaseState?: number; // 0 acheté, 1 annulé, 2 en attente
  orderId?: string;
  purchaseTimeMillis?: string;
  acknowledgementState?: number;
  obfuscatedExternalAccountId?: string;
  productId?: string;
}
interface SubscriptionPurchaseV2 {
  subscriptionState?: string;
  latestOrderId?: string;
  startTime?: string;
  lineItems?: { productId?: string; expiryTime?: string; latestSuccessfulOrderId?: string }[];
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
}

export class GooglePlayVerifier implements ReceiptVerifier {
  private token: { value: string; exp: number } | null = null;
  private readonly fetch: Fetch;
  private readonly clock: () => number;
  static readonly SCOPE = "https://www.googleapis.com/auth/androidpublisher";
  static readonly API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

  constructor(private readonly cfg: GoogleConfig) {
    this.fetch = cfg.fetch ?? (globalThis.fetch as unknown as Fetch);
    this.clock = cfg.clock ?? Date.now;
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(this.clock() / 1000);
    if (this.token && this.token.exp - 60 > now) return this.token.value;
    const uri = this.cfg.serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token";
    const assertion = signJwt({ alg: "RS256", typ: "JWT" }, { iss: this.cfg.serviceAccount.client_email, scope: GooglePlayVerifier.SCOPE, aud: uri, iat: now, exp: now + 3600 }, this.cfg.serviceAccount.private_key);
    const res = await this.fetch(uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
    });
    if (!res.ok) throw new StoreHttpError(res.status, `Google OAuth : ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: now + j.expires_in };
    return j.access_token;
  }

  private async call<T>(path: string, method = "GET"): Promise<T> {
    const res = await this.fetch(`${GooglePlayVerifier.API}/${encodeURIComponent(this.cfg.packageName)}/${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    if (!res.ok) throw new StoreHttpError(res.status, `Google Play API : ${res.status}`);
    return (method === "POST" ? {} : await res.json()) as T;
  }

  async verify(r: Receipt, ctx?: VerifyContext): Promise<VerifiedPurchase> {
    const sku = skuById(r.skuId);
    const invalid = (): VerifiedPurchase => ({ orderId: r.orderId, skuId: r.skuId, state: "invalid", eurCents: sku.referenceEurCents, at: this.clock() });
    try {
      if (sku.kind === "subscription") {
        const s = await this.call<SubscriptionPurchaseV2>(`purchases/subscriptionsv2/tokens/${encodeURIComponent(r.token)}`);
        const line = s.lineItems?.find((l) => l.productId === r.skuId);
        if (!line) return invalid();
        if (ctx && s.externalAccountIdentifiers?.obfuscatedExternalAccountId !== ctx.accountId) return invalid();
        const orderId = line.latestSuccessfulOrderId ?? s.latestOrderId ?? r.orderId;
        const state: VerifiedPurchase["state"] =
          s.subscriptionState === "SUBSCRIPTION_STATE_PENDING" ? "pending" : ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"].includes(s.subscriptionState ?? "") ? "purchased" : "invalid";
        const expiresAt = line.expiryTime ? Date.parse(line.expiryTime) : undefined;
        // Résilié mais encore payé : actif jusqu'à la fin de la période ; période écoulée : rien à créditer.
        if (state === "purchased" && expiresAt !== undefined && expiresAt <= this.clock()) return { ...invalid(), orderId };
        return { orderId, skuId: r.skuId, state, eurCents: sku.referenceEurCents, at: this.clock(), ...(expiresAt ? { expiresAt } : {}) };
      }
      const p = await this.call<ProductPurchase>(`purchases/products/${encodeURIComponent(r.skuId)}/tokens/${encodeURIComponent(r.token)}`);
      if (ctx && p.obfuscatedExternalAccountId !== ctx.accountId) return invalid();
      const state: VerifiedPurchase["state"] = p.purchaseState === 0 ? "purchased" : p.purchaseState === 2 ? "pending" : p.purchaseState === 1 ? "refunded" : "invalid";
      return { orderId: p.orderId ?? r.orderId, skuId: r.skuId, state, eurCents: sku.referenceEurCents, at: this.clock() };
    } catch (e) {
      // 404/410 : jeton inconnu ou expiré → reçu invalide ; toute autre erreur remonte (le jeu réessaiera, rien n'est crédité).
      if (e instanceof StoreHttpError && (e.status === 400 || e.status === 404 || e.status === 410)) return invalid();
      throw e;
    }
  }

  /**
   * Remboursements et annulations depuis `startMs` (API des achats annulés : produits et abonnements).
   * Interrogée périodiquement par le serveur, sans dépendre des notifications Pub/Sub.
   */
  async voidedSince(startMs: number): Promise<{ orderId: string; purchaseToken: string; voidedAt: number }[]> {
    const out: { orderId: string; purchaseToken: string; voidedAt: number }[] = [];
    let page: string | undefined;
    do {
      const q = `purchases/voidedpurchases?type=1&startTime=${Math.floor(startMs)}${page ? `&token=${encodeURIComponent(page)}` : ""}`;
      const r = await this.call<{ voidedPurchases?: { orderId?: string; purchaseToken?: string; voidedTimeMillis?: string }[]; tokenPagination?: { nextPageToken?: string } }>(q);
      for (const v of r.voidedPurchases ?? []) if (v.orderId) out.push({ orderId: v.orderId, purchaseToken: v.purchaseToken ?? "", voidedAt: Number(v.voidedTimeMillis ?? 0) });
      page = r.tokenPagination?.nextPageToken;
    } while (page);
    return out;
  }

  /** Acquittement côté serveur juste après le crédit : protège contre le remboursement automatique à 3 jours. */
  async acknowledge(r: Receipt): Promise<void> {
    const sku = skuById(r.skuId);
    const path = sku.kind === "subscription"
      ? `purchases/subscriptions/${encodeURIComponent(r.skuId)}/tokens/${encodeURIComponent(r.token)}:acknowledge`
      : `purchases/products/${encodeURIComponent(r.skuId)}/tokens/${encodeURIComponent(r.token)}:acknowledge`;
    try {
      await this.call(path, "POST");
    } catch (e) {
      // 400 : déjà acquitté (ou consommé par le jeu) → rien à faire.
      if (!(e instanceof StoreHttpError && e.status === 400)) throw e;
    }
  }
}

// ───────────────────────── App Store ─────────────────────────
export interface AppleConfig {
  issuerId: string;
  keyId: string;
  /** Clé d'achats intégrés (.p8, PEM). */
  privateKey: string;
  bundleId: string;
  fetch?: Fetch;
  clock?: () => number;
}

interface JWSTransaction {
  transactionId: string;
  originalTransactionId?: string;
  productId: string;
  bundleId: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment?: string;
}

export class AppStoreVerifier implements ReceiptVerifier {
  private readonly fetch: Fetch;
  private readonly clock: () => number;
  static readonly PRODUCTION = "https://api.storekit.itunes.apple.com";
  static readonly SANDBOX = "https://api.storekit-sandbox.itunes.apple.com";

  constructor(private readonly cfg: AppleConfig) {
    this.fetch = cfg.fetch ?? (globalThis.fetch as unknown as Fetch);
    this.clock = cfg.clock ?? Date.now;
  }

  jwt(): string {
    const now = Math.floor(this.clock() / 1000);
    return signJwt({ alg: "ES256", kid: this.cfg.keyId, typ: "JWT" }, { iss: this.cfg.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1", bid: this.cfg.bundleId }, this.cfg.privateKey);
  }

  /** Production d'abord ; une transaction de test (TestFlight, Xcode) n'existe que dans le bac à sable. */
  private async transaction(id: string): Promise<JWSTransaction | null> {
    for (const base of [AppStoreVerifier.PRODUCTION, AppStoreVerifier.SANDBOX]) {
      const res = await this.fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${this.jwt()}` } });
      if (res.status === 404) continue;
      if (!res.ok) throw new StoreHttpError(res.status, `App Store Server API : ${res.status}`);
      const { signedTransactionInfo } = (await res.json()) as { signedTransactionInfo: string };
      return jwsPayload<JWSTransaction>(signedTransactionInfo);
    }
    return null;
  }

  /**
   * Notification du serveur App Store (V2). Son contenu n'est pas cru sur parole : seul l'identifiant de transaction
   * en est extrait, puis la transaction est relue auprès de l'API d'Apple (authentifiée). Renvoie la commande remboursée.
   */
  async refundFromNotification(signedPayload: string): Promise<{ orderId: string } | null> {
    let id: string | undefined;
    try {
      const n = jwsPayload<{ notificationType?: string; data?: { signedTransactionInfo?: string; bundleId?: string } }>(signedPayload);
      if (!n.data?.signedTransactionInfo) return null;
      id = jwsPayload<{ transactionId?: string }>(n.data.signedTransactionInfo).transactionId;
    } catch {
      return null;
    }
    if (!id) return null;
    const t = await this.transaction(id);
    return t && t.bundleId === this.cfg.bundleId && t.revocationDate ? { orderId: t.transactionId } : null;
  }

  async verify(r: Receipt, ctx?: VerifyContext): Promise<VerifiedPurchase> {
    const sku = skuById(r.skuId);
    const base = { skuId: r.skuId, eurCents: sku.referenceEurCents, at: this.clock() };
    const t = await this.transaction(r.token);
    if (!t || t.bundleId !== this.cfg.bundleId || t.productId !== r.skuId) return { ...base, orderId: r.orderId, state: "invalid" };
    if (ctx && t.appAccountToken?.toLowerCase() !== ctx.accountId.toLowerCase()) return { ...base, orderId: t.transactionId, state: "invalid" };
    if (t.revocationDate) return { ...base, orderId: t.transactionId, state: "refunded" };
    if (t.expiresDate && t.expiresDate <= this.clock()) return { ...base, orderId: t.transactionId, state: "invalid" };
    return { ...base, orderId: t.transactionId, state: "purchased", ...(t.expiresDate ? { expiresAt: t.expiresDate } : {}) };
  }
}

/** Aiguillage par plateforme. Le store simulé n'est accepté que hors production. */
export class StoreVerifiers implements ReceiptVerifier {
  constructor(readonly by: Partial<Record<Receipt["platform"], ReceiptVerifier>>) {}
  private pick(r: Receipt): ReceiptVerifier {
    const v = this.by[r.platform];
    if (!v) throw Object.assign(new Error(`aucun vérificateur pour ${r.platform}`), { status: 503 });
    return v;
  }
  verify(r: Receipt, ctx?: VerifyContext) {
    return this.pick(r).verify(r, ctx);
  }
  async acknowledge(r: Receipt) {
    await this.pick(r).acknowledge?.(r);
  }
}

/**
 * Configuration par variables d'environnement (secrets à placer dans un coffre, jamais dans le dépôt) :
 *  - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON : contenu JSON du compte de service (ou GOOGLE_PLAY_SERVICE_ACCOUNT_FILE : chemin) ;
 *    GOOGLE_PLAY_PACKAGE (défaut : identifiant de l'app) ;
 *  - APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (PEM) ou APPLE_PRIVATE_KEY_FILE ; APPLE_BUNDLE_ID (défaut : identifiant de l'app) ;
 *  - ALLOW_MOCK_RECEIPTS=1 : accepte les reçus simulés (développement, tests). Refusé si NODE_ENV=production.
 */
export function storeVerifiersFromEnv(env: Record<string, string | undefined>, readFile: (p: string) => string, mock: ReceiptVerifier): { verifier: StoreVerifiers; platforms: string[] } {
  const appId = "com.helioscreat.heliosdiscovery";
  const by: Partial<Record<Receipt["platform"], ReceiptVerifier>> = {};
  const sa = env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? (env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE ? readFile(env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE) : undefined);
  if (sa) by.google = new GooglePlayVerifier({ packageName: env.GOOGLE_PLAY_PACKAGE ?? appId, serviceAccount: JSON.parse(sa) as GoogleServiceAccount });
  const key = env.APPLE_PRIVATE_KEY ?? (env.APPLE_PRIVATE_KEY_FILE ? readFile(env.APPLE_PRIVATE_KEY_FILE) : undefined);
  if (env.APPLE_ISSUER_ID && env.APPLE_KEY_ID && key) by.apple = new AppStoreVerifier({ issuerId: env.APPLE_ISSUER_ID, keyId: env.APPLE_KEY_ID, privateKey: key, bundleId: env.APPLE_BUNDLE_ID ?? appId });
  const production = env.NODE_ENV === "production";
  if (production && env.ALLOW_MOCK_RECEIPTS === "1") throw new Error("ALLOW_MOCK_RECEIPTS est interdit en production");
  if (!production && env.ALLOW_MOCK_RECEIPTS !== "0") by.mock = mock;
  return { verifier: new StoreVerifiers(by), platforms: Object.keys(by) };
}
