import { ALL_BOOSTERS, type Booster } from "@helios/core";
import { COIN_PRICES, type Contents, type Sku } from "./catalog";

/**
 * Portefeuille du joueur : vies, pièces, boosters, abonnements, passe.
 * Toutes les fonctions sont pures vis-à-vis du temps : `now` (ms) est passé explicitement.
 * Source de vérité côté serveur au déploiement (le client garde un cache).
 */
export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 30 * 60_000;

export interface Wallet {
  lives: number;
  /** Instant de référence de la recharge (dernière vie comptée). */
  livesAt: number;
  unlimitedUntil: number;
  coins: number;
  boosters: Record<Booster, number>;
  /** Articles à achat unique déjà achetés. */
  ownedOnce: string[];
  subscription: { skuId: string; activeUntil: number; lastPerkDay: number } | null;
}

export function newWallet(now: number): Wallet {
  return {
    lives: MAX_LIVES,
    livesAt: now,
    unlimitedUntil: 0,
    coins: 0,
    boosters: Object.fromEntries(ALL_BOOSTERS.map((b) => [b, 0])) as Record<Booster, number>,
    ownedOnce: [],
    subscription: null,
  };
}

/** Met à jour la recharge : +1 vie toutes les 30 min jusqu'à 5. Les achats n'expirent jamais (COM-16). */
export function tickLives(w: Wallet, now: number): Wallet {
  if (w.lives >= MAX_LIVES) return { ...w, livesAt: now };
  const gained = Math.floor((now - w.livesAt) / LIFE_REGEN_MS);
  if (gained <= 0) return w;
  const lives = Math.min(MAX_LIVES, w.lives + gained);
  return { ...w, lives, livesAt: lives >= MAX_LIVES ? now : w.livesAt + gained * LIFE_REGEN_MS };
}

export const hasUnlimitedLives = (w: Wallet, now: number) => now < w.unlimitedUntil;

/** Peut-on lancer un niveau ? (vies illimitées, ou au moins une vie) */
export function canPlay(w: Wallet, now: number): boolean {
  return hasUnlimitedLives(w, now) || tickLives(w, now).lives > 0;
}

/** Délai avant la prochaine vie (ms), 0 si pleines. */
export function nextLifeIn(w: Wallet, now: number): number {
  const t = tickLives(w, now);
  if (t.lives >= MAX_LIVES) return 0;
  return LIFE_REGEN_MS - (now - t.livesAt);
}

/**
 * Résultat d'un niveau : SEULE une défaite coûte une vie (ECO-01). Une victoire, ou un abandon avant
 * le premier coup, ne coûtent rien. Les vies illimitées dispensent du décompte.
 */
export function recordResult(w: Wallet, now: number, result: "won" | "lost" | "quitBeforeFirstMove" | "quitAfterMoves"): Wallet {
  const t = tickLives(w, now);
  if (result === "won" || result === "quitBeforeFirstMove" || hasUnlimitedLives(t, now)) return t;
  const lives = Math.max(0, t.lives - 1);
  return { ...t, lives, livesAt: t.lives >= MAX_LIVES ? now : t.livesAt };
}

/** Crédite le contenu d'un article (après vérification du reçu) ou d'une récompense. */
export function credit(w: Wallet, c: Contents, now: number): Wallet {
  const boosters = { ...w.boosters };
  for (const [b, n] of Object.entries(c.boosters ?? {})) boosters[b as Booster] += n ?? 0;
  const unlimitedUntil = c.unlimitedLivesMin ? Math.max(now, w.unlimitedUntil) + c.unlimitedLivesMin * 60_000 : w.unlimitedUntil;
  return { ...w, boosters, coins: w.coins + (c.coins ?? 0), unlimitedUntil };
}

/** Retire le contenu non consommé d'un article remboursé (COM-17), sans passer sous zéro. */
export function revoke(w: Wallet, c: Contents): Wallet {
  const boosters = { ...w.boosters };
  for (const [b, n] of Object.entries(c.boosters ?? {})) boosters[b as Booster] = Math.max(0, boosters[b as Booster] - (n ?? 0));
  const unlimitedUntil = c.unlimitedLivesMin ? Math.max(0, w.unlimitedUntil - c.unlimitedLivesMin * 60_000) : w.unlimitedUntil;
  return { ...w, boosters, coins: Math.max(0, w.coins - (c.coins ?? 0)), unlimitedUntil };
}

export function spendCoins(w: Wallet, amount: number): Wallet | null {
  return w.coins >= amount ? { ...w, coins: w.coins - amount } : null;
}

export function buyBoosterWithCoins(w: Wallet, b: Booster): Wallet | null {
  const after = spendCoins(w, COIN_PRICES.boosters[b]);
  return after ? { ...after, boosters: { ...after.boosters, [b]: after.boosters[b] + 1 } } : null;
}

export function refillLivesWithCoins(w: Wallet, now: number): Wallet | null {
  const after = spendCoins(tickLives(w, now), COIN_PRICES.refillLives);
  return after ? { ...after, lives: MAX_LIVES, livesAt: now } : null;
}

/** Abonnement : avantages du jour, une fois par jour calendaire (jour = floor(now / 24 h) dans le fuseau du joueur). */
export function claimSubscriptionPerks(w: Wallet, sku: Sku, now: number, tzOffsetMin = 0): Wallet {
  const day = Math.floor((now + tzOffsetMin * 60_000) / 86_400_000);
  if (!w.subscription || w.subscription.activeUntil <= now || w.subscription.lastPerkDay === day || !sku.dailyPerks) return w;
  return { ...credit(w, sku.dailyPerks, now), subscription: { ...w.subscription, lastPerkDay: day } };
}
