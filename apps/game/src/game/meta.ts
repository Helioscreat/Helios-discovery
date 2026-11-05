import type { Booster } from "@helios/core";
import {
  applyVerified, CATALOG, credit, DAY, isProtected, MockStore, MockVerifier, newFreeRewards, newIsland, newSeasonState, newWallet,
  purchaseGate, recordResult, tickLives, type Account, type AgeBand, type Contents, type FreeRewardsState, type IslandState,
  skuById, type Receipt, type SeasonDef, type SeasonState, type Sku, type StoreAdapter, type StoreProduct, type VerifiedPurchase,
} from "@helios/economy";
import type { Profile } from "./profile";

/**
 * État « méta » du joueur : portefeuille (vies, pièces, abonnement), grand livre des achats, saison,
 * récompenses gratuites, île, tranche d'âge. Stocké localement en attendant le serveur (livrable 6),
 * qui deviendra la source de vérité (reçus vérifiés, plafond mineurs, tirages).
 * Les boosters restent dans `Profile.inventory` (une seule réserve).
 */
export interface MetaState {
  account: Account;
  season: SeasonState;
  free: FreeRewardsState;
  island: IslandState;
  /** Tranche d'âge : « unknown » jusqu'à l'écran d'âge (livrable 6), traitée comme protégée. */
  age: AgeBand;
  country: string;
  playerSeed: string;
}

/** Saison courante : 20 jours, découpage régulier à partir d'une date d'origine (config distante au livrable 7). */
export const SEASON_ORIGIN = Date.UTC(2026, 9, 26);
export function currentSeason(now: number): SeasonDef {
  const k = Math.max(0, Math.floor((now - SEASON_ORIGIN) / (20 * DAY)));
  return { id: `s${k + 1}`, startAt: SEASON_ORIGIN + k * 20 * DAY, durationDays: 20 };
}

export function newMeta(now: number): MetaState {
  return {
    account: { wallet: newWallet(now), ledger: [] },
    season: newSeasonState(currentSeason(now)),
    free: newFreeRewards(),
    island: newIsland(),
    age: "unknown",
    country: "FR",
    playerSeed: `p${Math.floor(now % 1e9)}`,
  };
}

const KEY = "helios.meta.v1";

export function loadMeta(now: number): MetaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = { ...newMeta(now), ...(JSON.parse(raw) as Partial<MetaState>) };
      const def = currentSeason(now);
      if (m.season.seasonId !== def.id) m.season = newSeasonState(def); // nouvelle saison (l'ancienne a été clôturée)
      return m;
    }
  } catch {
    /* stockage indisponible */
  }
  return newMeta(now);
}

export function saveMeta(m: MetaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* stockage indisponible */
  }
}

/** Crédite un contenu : boosters dans la réserve du profil, le reste dans le portefeuille. */
export function grant(meta: MetaState, profile: Profile, c: Contents, now: number): void {
  for (const [b, n] of Object.entries(c.boosters ?? {})) profile.inventory[b as Booster] += n ?? 0;
  meta.account = { ...meta.account, wallet: credit(meta.account.wallet, { ...c, boosters: undefined }, now) };
}

export const protectedPlayer = (m: MetaState) => isProtected(m.age);

export type PurchaseResult = { ok: true } | { ok: false; reason: "cancelled" | "pending" | "cap" | "oneTimeOwned" | "invalid" | "offline" | "verifyLater" };

/** Serveur de l'éditeur : autorise l'achat (plafond des mineurs) et vérifie le reçu auprès du store. */
export interface PurchaseRemote {
  /** Identifiant pseudonyme du compte, transmis au store pour lier l'achat au compte. */
  accountId(): string | null;
  authorize(skuId: string): Promise<{ allowed: boolean; reason?: string }>;
  verify(r: Receipt): Promise<VerifiedPurchase>;
}

/**
 * Parcours d'achat complet : autorisation (plafond, achat unique) → flux du store → vérification du reçu
 * → crédit unique. Rien n'est crédité sans reçu vérifié (COM-17).
 */
export class Shop {
  readonly store: StoreAdapter;
  readonly verifier: MockVerifier;
  private prices: Map<string, StoreProduct> = new Map();
  /** Branché par le jeu une fois le compte connu. Obligatoire pour un store réel (Google, Apple). */
  remote: PurchaseRemote | null = null;

  constructor(private readonly clock: () => number, store?: StoreAdapter) {
    this.store = store ?? new MockStore(CATALOG, typeof navigator !== "undefined" ? navigator.language : "fr-FR", "EUR");
    this.verifier = new MockVerifier(Object.fromEntries(CATALOG.map((s) => [s.id, s.referenceEurCents])), clock);
  }

  async loadPrices(): Promise<void> {
    const list = await this.store.products(CATALOG.map((s) => s.id));
    this.prices = new Map(list.map((p) => [p.id, p]));
  }

  /** Prix affiché : toujours celui du store (COM-10). `null` tant qu'il n'est pas chargé (aucun achat possible). */
  price(id: string): string | null {
    return this.prices.get(id)?.price ?? null;
  }

  async buy(meta: MetaState, profile: Profile, sku: Sku): Promise<PurchaseResult> {
    const now = this.clock();
    const gate = purchaseGate(meta.age, meta.account.ledger, sku, meta.account.wallet.ownedOnce, now);
    if (!gate.allowed) return { ok: false, reason: gate.reason };
    const real = this.store.platform !== "mock";
    if (real) {
      // Store réel : rien sans le serveur (plafond calculé sur les reçus vérifiés, reçu vérifié auprès du store).
      if (!this.remote) return { ok: false, reason: "offline" };
      const auth = await this.remote.authorize(sku.id).catch(() => null);
      if (!auth) return { ok: false, reason: "offline" };
      if (!auth.allowed) return { ok: false, reason: auth.reason === "oneTimeOwned" ? "oneTimeOwned" : auth.reason === "cap" ? "cap" : "invalid" };
    }
    const out = await this.store.purchase(sku.id);
    if (out.kind === "cancelled") return { ok: false, reason: "cancelled" };
    if (out.kind === "pending") return { ok: false, reason: "pending" };
    return this.settle(meta, profile, out.receipt);
  }

  /**
   * Vérifie un reçu (serveur pour un store réel, doublure pour le store simulé), crédite une seule fois,
   * puis clôt la transaction. Si le serveur ne répond pas, la transaction reste ouverte et sera reprise.
   */
  async settle(meta: MetaState, profile: Profile, receipt: Receipt): Promise<PurchaseResult> {
    const now = this.clock();
    let verified: VerifiedPurchase;
    if (receipt.platform === "mock") verified = await this.verifier.verify(receipt);
    else {
      if (!this.remote) return { ok: false, reason: "verifyLater" };
      try {
        verified = await this.remote.verify(receipt);
      } catch {
        return { ok: false, reason: "verifyLater" };
      }
    }
    if (verified.state === "pending") return { ok: false, reason: "pending" };
    const before = meta.account.wallet;
    const r = applyVerified(meta.account, verified, now);
    if (!r.ok) return { ok: false, reason: "invalid" };
    // Crédité (ou déjà crédité) : la transaction peut être clôturée chez le store.
    if (verified.state === "purchased") await this.store.finish?.(receipt).catch(() => undefined);
    // Les boosters crédités passent dans la réserve du profil.
    const gained = r.account.wallet.boosters;
    for (const b of Object.keys(gained) as Booster[]) {
      const delta = gained[b] - before.boosters[b];
      if (delta > 0) profile.inventory[b] += delta;
    }
    meta.account = { ...r.account, wallet: { ...r.account.wallet, boosters: before.boosters } };
    return { ok: true };
  }

  /** Au lancement et à chaque transaction reçue hors parcours : crédite les achats payés mais non clôturés. */
  async recover(meta: MetaState, profile: Profile, list?: Receipt[]): Promise<Sku[]> {
    const pending = list ?? (await this.store.unfinished?.().catch(() => [] as Receipt[])) ?? [];
    const credited: Sku[] = [];
    for (const r of pending) {
      if (!CATALOG.some((s) => s.id === r.skuId)) continue;
      const known = meta.account.ledger.some((e) => e.orderId === r.orderId && e.state === "credited");
      const res = await this.settle(meta, profile, r);
      if (res.ok && !known) credited.push(skuById(r.skuId));
    }
    return credited;
  }
}

/** Fin de niveau côté méta : vie consommée seulement en cas de défaite (ECO-01). */
export function endLevel(meta: MetaState, result: "won" | "lost" | "quitBeforeFirstMove" | "quitAfterMoves", now: number): void {
  meta.account = { ...meta.account, wallet: recordResult(meta.account.wallet, now, result) };
}

export function livesNow(meta: MetaState, now: number): number {
  return tickLives(meta.account.wallet, now).lives;
}
