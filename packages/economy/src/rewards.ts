import { nextInt, seedRng } from "@helios/core";
import { COIN_REWARDS, type Contents } from "./catalog";

/**
 * Sources gratuites (cahier des charges §5) : roue quotidienne GRATUITE, série de connexions sur 7 jours,
 * 3 quêtes quotidiennes, pubs récompensées facultatives (5 par jour au plus, récompense FIXE).
 * Le hasard n'existe que dans la roue gratuite, avec probabilités affichées (RNG-02) ;
 * aucun tour supplémentaire n'est vendu ni échangé contre une pub (RNG-03).
 */
export const dayIndex = (now: number, tzOffsetMin = 0) => Math.floor((now + tzOffsetMin * 60_000) / 86_400_000);

export interface FreeRewardsState {
  lastWheelDay: number;
  streakDay: number;
  lastLoginDay: number;
  adsDay: number;
  adsToday: number;
  questsDay: number;
  quests: Quest[];
}

export function newFreeRewards(): FreeRewardsState {
  return { lastWheelDay: -1, streakDay: 0, lastLoginDay: -1, adsDay: -1, adsToday: 0, questsDay: -1, quests: [] };
}

// ───────────── Roue quotidienne ─────────────
export const WHEEL: { contents: Contents; weight: number; labelKey: string }[] = [
  { contents: { coins: 50 }, weight: 30, labelKey: "wheel.coins50" },
  { contents: { coins: 100 }, weight: 25, labelKey: "wheel.coins100" },
  { contents: { boosters: { hammer: 1 } }, weight: 15, labelKey: "wheel.hammer" },
  { contents: { boosters: { bomb: 1 } }, weight: 12, labelKey: "wheel.bomb" },
  { contents: { unlimitedLivesMin: 15 }, weight: 10, labelKey: "wheel.lives15" },
  { contents: { boosters: { fireCross: 1 } }, weight: 6, labelKey: "wheel.fireCross" },
  { contents: { boosters: { rainbow: 1 } }, weight: 2, labelKey: "wheel.rainbow" },
];

/** Probabilités affichées : la même table que le tirage (somme = 1). */
export function wheelProbabilities(): number[] {
  const total = WHEEL.reduce((a, s) => a + s.weight, 0);
  return WHEEL.map((s) => s.weight / total);
}

export const canSpin = (s: FreeRewardsState, now: number, tz = 0) => s.lastWheelDay !== dayIndex(now, tz);

/** Un tour par jour. Le tirage est seedé (côté serveur au déploiement : graine secrète par joueur et par jour). */
export function spinWheel(s: FreeRewardsState, now: number, seed: string, tz = 0): { state: FreeRewardsState; index: number; contents: Contents } | null {
  if (!canSpin(s, now, tz)) return null;
  const day = dayIndex(now, tz);
  const rng = seedRng(`${seed}:wheel:${day}`);
  let roll = nextInt(rng, WHEEL.reduce((a, x) => a + x.weight, 0));
  let index = 0;
  for (let k = 0; k < WHEEL.length; k++) if ((roll -= WHEEL[k].weight) < 0) { index = k; break; }
  return { state: { ...s, lastWheelDay: day }, index, contents: WHEEL[index].contents };
}

// ───────────── Série de connexions (7 jours) ─────────────
export const STREAK: Contents[] = [{ coins: 50 }, { coins: 75 }, { coins: 100 }, { coins: 125 }, { coins: 150 }, { coins: 200 }, { boosters: { bomb: 1, fireCross: 1 } }];

/**
 * Récompense de connexion. Un jour manqué fait reculer la série d'UN cran (pas de remise à zéro) :
 * pas d'aversion à la perte qui pousse à revenir chaque jour (cohérent avec la correction C du livrable 1).
 */
export function login(s: FreeRewardsState, now: number, tz = 0): { state: FreeRewardsState; reward: Contents | null } {
  const day = dayIndex(now, tz);
  if (s.lastLoginDay === day) return { state: s, reward: null };
  const missed = s.lastLoginDay >= 0 && day - s.lastLoginDay > 1;
  const base = missed ? Math.max(0, s.streakDay - 1) : s.streakDay;
  const reward = STREAK[base % STREAK.length];
  return { state: { ...s, lastLoginDay: day, streakDay: (base + 1) % STREAK.length }, reward };
}

// ───────────── Pubs récompensées ─────────────
export const MAX_ADS_PER_DAY = 5;

export function adsLeft(s: FreeRewardsState, now: number, tz = 0): number {
  return s.adsDay === dayIndex(now, tz) ? Math.max(0, MAX_ADS_PER_DAY - s.adsToday) : MAX_ADS_PER_DAY;
}

/** À appeler APRÈS une pub vue jusqu'au bout, à la demande explicite du joueur. Récompense fixe. */
export function rewardAd(s: FreeRewardsState, now: number, tz = 0): { state: FreeRewardsState; contents: Contents } | null {
  if (adsLeft(s, now, tz) <= 0) return null;
  const day = dayIndex(now, tz);
  return { state: { ...s, adsDay: day, adsToday: (s.adsDay === day ? s.adsToday : 0) + 1 }, contents: { coins: COIN_REWARDS.rewardedAd } };
}

// ───────────── Quêtes quotidiennes ─────────────
export interface Quest {
  id: string;
  kind: "wins" | "collect" | "specials" | "boosters";
  target: number;
  progress: number;
  claimed: boolean;
}

const QUEST_POOL: Omit<Quest, "progress" | "claimed">[] = [
  { id: "wins3", kind: "wins", target: 3 },
  { id: "wins5", kind: "wins", target: 5 },
  { id: "collect80", kind: "collect", target: 80 },
  { id: "collect150", kind: "collect", target: 150 },
  { id: "specials10", kind: "specials", target: 10 },
  { id: "specials20", kind: "specials", target: 20 },
  { id: "boosters1", kind: "boosters", target: 1 },
];

export function dailyQuests(s: FreeRewardsState, now: number, seed: string, tz = 0): FreeRewardsState {
  const day = dayIndex(now, tz);
  if (s.questsDay === day) return s;
  const rng = seedRng(`${seed}:quests:${day}`);
  const pool = QUEST_POOL.slice();
  const quests: Quest[] = [];
  const kinds = new Set<string>();
  while (quests.length < 3 && pool.length) {
    const q = pool.splice(nextInt(rng, pool.length), 1)[0];
    if (kinds.has(q.kind)) continue;
    kinds.add(q.kind);
    quests.push({ ...q, progress: 0, claimed: false });
  }
  return { ...s, questsDay: day, quests };
}

export function progressQuests(s: FreeRewardsState, kind: Quest["kind"], amount: number): FreeRewardsState {
  return { ...s, quests: s.quests.map((q) => (q.kind === kind ? { ...q, progress: Math.min(q.target, q.progress + amount) } : q)) };
}

export function claimQuest(s: FreeRewardsState, id: string): { state: FreeRewardsState; contents: Contents } | null {
  const q = s.quests.find((x) => x.id === id);
  if (!q || q.claimed || q.progress < q.target) return null;
  return { state: { ...s, quests: s.quests.map((x) => (x.id === id ? { ...x, claimed: true } : x)) }, contents: { coins: COIN_REWARDS.dailyQuest } };
}
