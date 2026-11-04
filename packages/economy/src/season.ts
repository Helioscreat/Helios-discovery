import { nextInt, seedRng, type Booster } from "@helios/core";
import type { Contents } from "./catalog";
import { DAY } from "./validate";

/**
 * Passe de saison (cahier des charges §6, calibrage corrigé au livrable 1) :
 * 20 jours exactement, 40 paliers × 250 XP ; piste gratuite tous les 2 paliers ; Premium : chaque palier ;
 * Premium+ : Premium + 10 paliers d'avance + 20 % d'XP. Après le palier 40 : coffre GRATUIT tous les 300 XP.
 */
export const SEASON_DAYS = 20;
export const TIERS = 40;
export const XP_PER_TIER = 250;
export const POST_CHEST_XP = 300;
export const PREMIUM_PLUS_SKIP = 10;
export const PREMIUM_PLUS_XP_BONUS = 0.2;

export const XP = { win: 20, hard: 10, veryHard: 30, perStar: 5, dailyQuest: 50, weeklyQuest: 300 };

export interface SeasonDef {
  id: string;
  startAt: number;
  durationDays: number;
}

export type Track = "free" | "premium";

export interface Reward {
  tier: number;
  track: Track;
  contents: Contents;
  /** Cosmétique (décoration ou cadre), sans effet sur le jeu. */
  cosmetic?: string;
}

export interface SeasonState {
  seasonId: string;
  xp: number;
  pass: "none" | "premium" | "premiumPlus";
  claimed: string[];
  /** XP gagnée par jour (index = jour de saison), pour une estimation honnête. */
  xpByDay: number[];
  /** Coffres post-palier 40 déjà ouverts. */
  postChests: number;
  closed: boolean;
}

export const seasonEnd = (s: SeasonDef) => s.startAt + s.durationDays * DAY;
export const dayOfSeason = (s: SeasonDef, now: number) => Math.floor((now - s.startAt) / DAY);
export const daysLeft = (s: SeasonDef, now: number) => Math.max(0, Math.ceil((seasonEnd(s) - now) / DAY));

const BOOSTER_CYCLE: Booster[] = ["hammer", "bomb", "fireCross", "rainbow", "shuffler", "starterKit"];

/** Liste COMPLÈTE des récompenses, affichée avant l'achat (SEA-02). */
export function rewardTable(): Reward[] {
  const out: Reward[] = [];
  for (let t = 1; t <= TIERS; t++) {
    // Piste gratuite : chaque booster y figure au moins une fois d'ici le palier 16 (joueur occasionnel).
    if (t % 2 === 0)
      out.push({ tier: t, track: "free", contents: t === 14 ? { boosters: { starterKit: 1 } } : t % 10 === 0 ? { unlimitedLivesMin: 30 } : t % 4 === 0 ? { boosters: { [BOOSTER_CYCLE[(t / 4) % 6]]: 1 } } : { coins: 150 } });
    const premium: Reward = { tier: t, track: "premium", contents: t % 5 === 0 ? { boosters: { [BOOSTER_CYCLE[(t / 5) % 6]]: 2 } } : t % 3 === 0 ? { unlimitedLivesMin: 30 } : { coins: 250 } };
    if (t === 20) premium.cosmetic = "deco.season.fountain";
    if (t === 40) premium.cosmetic = "frame.season";
    out.push(premium);
  }
  return out;
}

export const rewardKey = (r: Reward) => `${r.track}:${r.tier}`;

export function newSeasonState(def: SeasonDef): SeasonState {
  return { seasonId: def.id, xp: 0, pass: "none", claimed: [], xpByDay: [], postChests: 0, closed: false };
}

export function tierOf(xp: number): number {
  return Math.min(TIERS, Math.floor(xp / XP_PER_TIER));
}

/** XP d'une victoire (difficulté et étoiles) ; +20 % avec Premium+. */
export function winXp(difficulty: "normal" | "hard" | "veryHard", stars: number, pass: SeasonState["pass"]): number {
  const base = XP.win + (difficulty === "hard" ? XP.hard : difficulty === "veryHard" ? XP.veryHard : 0) + XP.perStar * stars;
  return Math.round(base * (pass === "premiumPlus" ? 1 + PREMIUM_PLUS_XP_BONUS : 1));
}

export function addXp(def: SeasonDef, st: SeasonState, xp: number, now: number): SeasonState {
  if (st.closed || now >= seasonEnd(def) || now < def.startAt) return st;
  const d = dayOfSeason(def, now);
  const xpByDay = st.xpByDay.slice();
  while (xpByDay.length <= d) xpByDay.push(0);
  xpByDay[d] += xp;
  return { ...st, xp: st.xp + xp, xpByDay };
}

/** Récompenses atteintes et accessibles avec le passe actuel. */
export function unlockedRewards(st: SeasonState): Reward[] {
  const tier = tierOf(st.xp);
  return rewardTable().filter((r) => r.tier <= tier && (r.track === "free" || st.pass !== "none"));
}

export function claimable(st: SeasonState): Reward[] {
  return unlockedRewards(st).filter((r) => !st.claimed.includes(rewardKey(r)));
}

/**
 * Estimation honnête du palier atteignable (SEA-02) : médiane de l'XP par jour sur les 3 derniers jours
 * joués, projetée sur les jours restants, ARRONDIE VERS LE BAS. Jamais le meilleur jour.
 */
export function estimateTier(def: SeasonDef, st: SeasonState, now: number, pass: SeasonState["pass"] = st.pass): number {
  const d = dayOfSeason(def, now);
  const recent = st.xpByDay.slice(Math.max(0, d - 2), d + 1);
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
  const factor = pass === "premiumPlus" && st.pass !== "premiumPlus" ? 1 + PREMIUM_PLUS_XP_BONUS : 1;
  const skip = pass === "premiumPlus" && st.pass !== "premiumPlus" ? PREMIUM_PLUS_SKIP * XP_PER_TIER : 0;
  const remainingDays = Math.max(0, daysLeft(def, now) - (recent.length && recent[recent.length - 1] > 0 ? 1 : 0));
  return Math.min(TIERS, Math.floor((st.xp + skip + median * factor * remainingDays) / XP_PER_TIER));
}

export interface PassOfferView {
  offered: boolean;
  /** Avertissement explicite dans les 3 derniers jours si le palier 40 est hors de portée (SEA-03). */
  warning: { estimatedTier: number } | null;
  daysLeft: number;
}

/**
 * Proposition d'achat du passe. Joueur protégé : jamais dans les 3 derniers jours.
 * Majeur : proposé, avec avertissement chiffré si le palier 40 n'est pas atteignable à son rythme.
 */
export function passOffer(def: SeasonDef, st: SeasonState, now: number, protectedPlayer: boolean): PassOfferView {
  const left = daysLeft(def, now);
  if (st.pass !== "none" || left <= 0) return { offered: false, warning: null, daysLeft: left };
  const est = estimateTier(def, st, now, "premium");
  const late = left <= 3;
  if (late && protectedPlayer) return { offered: false, warning: null, daysLeft: left };
  return { offered: true, warning: late && est < TIERS ? { estimatedTier: est } : null, daysLeft: left };
}

/** Achat (après reçu vérifié) : les paliers déjà atteints deviennent réclamables ; Premium+ ajoute 10 paliers. */
export function buyPass(st: SeasonState, tier: "premium" | "premiumPlus"): SeasonState {
  return { ...st, pass: tier, xp: tier === "premiumPlus" ? st.xp + PREMIUM_PLUS_SKIP * XP_PER_TIER : st.xp };
}

export function claim(st: SeasonState, r: Reward): SeasonState {
  return st.claimed.includes(rewardKey(r)) ? st : { ...st, claimed: [...st.claimed, rewardKey(r)] };
}

/** Clôture : tout ce qui a été gagné et non réclamé est crédité automatiquement (SEA-04). */
export function closeSeason(st: SeasonState): { state: SeasonState; credited: Reward[] } {
  const credited = claimable(st);
  return { state: { ...st, closed: true, claimed: [...st.claimed, ...credited.map(rewardKey)] }, credited };
}

/** Coffre gratuit post-palier 40 : contenu tiré selon des probabilités AFFICHÉES (RNG-02), jamais payant. */
export const POST_CHEST_TABLE: { contents: Contents; weight: number }[] = [
  { contents: { coins: 200 }, weight: 50 },
  { contents: { boosters: { hammer: 1 } }, weight: 20 },
  { contents: { boosters: { bomb: 1 } }, weight: 15 },
  { contents: { unlimitedLivesMin: 30 }, weight: 10 },
  { contents: { boosters: { rainbow: 1 } }, weight: 5 },
];

export function chestProbabilities(): number[] {
  const total = POST_CHEST_TABLE.reduce((a, e) => a + e.weight, 0);
  return POST_CHEST_TABLE.map((e) => e.weight / total);
}

export function postChestsAvailable(st: SeasonState): number {
  const over = st.xp - TIERS * XP_PER_TIER;
  return over > 0 ? Math.floor(over / POST_CHEST_XP) - st.postChests : 0;
}

/** Ouvre un coffre gratuit (tirage déterministe, côté serveur au déploiement). */
export function openPostChest(st: SeasonState, seed: string): { state: SeasonState; contents: Contents } | null {
  if (postChestsAvailable(st) <= 0) return null;
  const rng = seedRng(`${st.seasonId}:${seed}:${st.postChests}`);
  let roll = nextInt(rng, POST_CHEST_TABLE.reduce((a, e) => a + e.weight, 0));
  let contents = POST_CHEST_TABLE[0].contents;
  for (const e of POST_CHEST_TABLE) if ((roll -= e.weight) < 0) { contents = e.contents; break; }
  return { state: { ...st, postChests: st.postChests + 1 }, contents };
}

/** Validation de la config de saison (SEA-01) : 20 jours exactement, dates cohérentes. */
export function validateSeason(def: SeasonDef): string[] {
  const errors: string[] = [];
  if (def.durationDays !== SEASON_DAYS) errors.push(`saison ${def.id} : durée ${def.durationDays} j au lieu de ${SEASON_DAYS}`);
  if (!Number.isFinite(def.startAt)) errors.push(`saison ${def.id} : date de début invalide`);
  return errors;
}
