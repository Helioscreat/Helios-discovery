import { cloneState } from "./board";
import { crossLines, squareAround } from "./effects";
import { forceShuffle } from "./moves";
import { cascadeLoop, Phase } from "./resolve";
import { pick } from "./rng";
import { ensurePlayable } from "./moves";
import { goalsDone, runBonus } from "./game";
import type { GameEvent, GameState, Pos } from "./types";

/** Boosters en jeu (5) et booster d'avant-niveau (Kit de départ). */
export type InGameBooster = "hammer" | "bomb" | "rainbow" | "fireCross" | "shuffler";
export type Booster = InGameBooster | "starterKit";

export const IN_GAME_BOOSTERS: readonly InGameBooster[] = ["hammer", "bomb", "rainbow", "fireCross", "shuffler"];
export const ALL_BOOSTERS: readonly Booster[] = [...IN_GAME_BOOSTERS, "starterKit"];

/** Niveau de déblocage (cahier des charges §3) et exemplaires offerts au déblocage. */
export const BOOSTER_UNLOCK_LEVEL: Record<Booster, number> = {
  hammer: 8, bomb: 12, rainbow: 18, fireCross: 25, shuffler: 32, starterKit: 40,
};
export const FREE_ON_UNLOCK = 3;

/** Le booster vise-t-il une case ? (Le Mélangeur et le Kit de départ non.) */
export const needsTarget = (b: Booster): boolean => b === "hammer" || b === "bomb" || b === "rainbow" || b === "fireCross";

export function unlockedBoosters(level: number): Booster[] {
  return ALL_BOOSTERS.filter((b) => level >= BOOSTER_UNLOCK_LEVEL[b]);
}

/** Boosters débloqués exactement en atteignant `level` (tutoriel + 3 exemplaires offerts). */
export function boostersUnlockedAt(level: number): Booster[] {
  return ALL_BOOSTERS.filter((b) => BOOSTER_UNLOCK_LEVEL[b] === level);
}

export interface BoosterResult {
  state: GameState;
  events: GameEvent[];
  accepted: boolean;
}

/**
 * Applique un booster en jeu. Ne consomme AUCUN coup.
 * La gestion de l'inventaire (décompte, achat, gains) est hors du moteur : c'est l'appelant qui vérifie la possession.
 */
export function applyBooster(state: GameState, booster: InGameBooster, target?: Pos): BoosterResult {
  const st = cloneState(state);
  const ev: GameEvent[] = [];
  const reject = () => ({ state, events: ev, accepted: false });
  if (st.status !== "playing") return reject();
  if (needsTarget(booster)) {
    if (target === undefined || target < 0 || target >= st.cells.length || !st.mask[target] || st.cells[target] === null) return reject();
  }

  ev.push({ type: "booster", booster, at: target ?? -1 });
  if (booster === "shuffler") {
    forceShuffle(st, ev);
    return { state: st, events: ev, accepted: true };
  }

  const phase = new Phase(st, ev, 1);
  const t = target!;
  switch (booster) {
    case "hammer":
      phase.hit(t);
      break;
    case "bomb":
      phase.hitAll(squareAround(st, t, 1));
      break;
    case "fireCross":
      phase.hitAll(crossLines(st, t));
      break;
    case "rainbow": {
      const p = st.cells[t]!;
      // Sur un Prisme (sans couleur) : la couleur la plus présente.
      const color = p.special === "prism" ? phase.dominantColor() : p.color;
      phase.hit(t);
      if (color >= 0) phase.hitAll(phase.cellsOfColor(color));
      break;
    }
  }
  phase.run();
  phase.finish();
  cascadeLoop(st, ev, 1);
  if (goalsDone(st)) {
    runBonus(st, ev);
    st.status = "won";
    ev.push({ type: "won" });
  } else {
    ensurePlayable(st, ev);
  }
  return { state: st, events: ev, accepted: true };
}

/**
 * Kit de départ : place une Fusée, une Bombe et un Prisme sur trois pièces normales distinctes,
 * tirées au PRNG de la partie. À appeler avant le premier coup. Ne crée aucun alignement
 * (les couleurs sont conservées ; le Prisme n'a pas de couleur).
 */
export function applyStarterKit(state: GameState): BoosterResult {
  const st = cloneState(state);
  const ev: GameEvent[] = [];
  if (st.status !== "playing" || st.moveCount > 0) return { state, events: ev, accepted: false };
  const placed: Pos[] = [];
  const specials = ["rocketH", "bomb", "prism"] as const;
  for (const sp of specials) {
    const normal: Pos[] = [];
    for (let i = 0; i < st.cells.length; i++) if (st.cells[i]?.special === null) normal.push(i);
    if (normal.length === 0) break;
    const i = pick(st.rng, normal);
    const p = st.cells[i]!;
    p.special = sp;
    if (sp === "prism") p.color = -1;
    placed.push(i);
  }
  ev.push({ type: "booster", booster: "starterKit", at: -1 });
  ev.push({ type: "transformed", cells: placed, specials: placed.map((i) => st.cells[i]!.special!) });
  ensurePlayable(st, ev);
  return { state: st, events: ev, accepted: true };
}
