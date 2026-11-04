import type { DropConfig, Goal, LevelSpec, ObstacleKind } from "@helios/core";

export const CONTENT_VERSION = 2;

export type Difficulty = "relax" | "easy" | "medium" | "hard" | "veryHard";

/** Taux de réussite visés (bot glouton, 1 essai, sans booster). */
export const TARGET_RATE: Record<Difficulty, number> = { relax: 0.9, easy: 0.85, medium: 0.6, hard: 0.35, veryHard: 0.2 };

/** Tolérance autour de la cible (cahier des charges : ±10 points). */
export const TOLERANCE = 0.1;

/**
 * Dents de scie par bloc de 10 : 1 détente, 2–3 faciles, 4–6 moyens, 7 Difficile (badge),
 * 8–9 moyens, 10 Très difficile (badge).
 */
export function difficultyOf(n: number): Difficulty {
  const k = ((n - 1) % 10) + 1;
  if (k === 1) return "relax";
  if (k <= 3) return "easy";
  if (k === 7) return "hard";
  if (k === 10) return "veryHard";
  return "medium";
}

/** Fond de difficulté logarithmique, plafonné à N = 2000 (valeur dans [0, 1]). */
export function background(n: number): number {
  return Math.min(1, Math.log(1 + n / 40) / Math.log(1 + 2000 / 40));
}

/** Niveau d'introduction de chaque élément (tutoriel dédié dans les niveaux faits main). */
export const ELEMENT_UNLOCK: Record<ObstacleKind | "drop" | "portal" | "conveyor" | "generator", number> = {
  ice: 13, crate: 33, chain: 52, drop: 71, cage: 92, ivy: 112,
  bubble: 131, portal: 152, conveyor: 172, generator: 191, chest: 212,
};

/** Variantes présentées comme nouveautés (avec tutoriel) pour tenir le rythme jusqu'au niveau 300. */
export const VARIANT_UNLOCK = { chest2: 233, crateGenerator: 254, portalConveyor: 275 } as const;

/** Niveau tutoriel d'un élément ou d'une variante → clé de tutoriel (textes du jeu). */
export function introAt(n: number): string | null {
  for (const [k, v] of Object.entries(ELEMENT_UNLOCK)) if (v === n) return k;
  for (const [k, v] of Object.entries(VARIANT_UNLOCK)) if (v === n) return k;
  return null;
}

export type LevelStatus = "ok" | "out_of_range";

/** Fichier de niveau (JSON). */
export interface LevelFile {
  n: number;
  version: number;
  source: "handmade" | "generated";
  difficulty: Difficulty;
  targetRate: number;
  width: number;
  height: number;
  layout: string[];
  colors: number;
  moves: number;
  goals: Goal[];
  drops?: Omit<DropConfig, "spawned">;
  portals?: [number, number][];
  conveyors?: number[][];
  seed: string;
  /** Paramètres de génération (niveaux générés) : tentative retenue et échelle des objectifs. */
  attempt?: number;
  scale?: number;
  title?: string;
  tutorial?: string;
  validation: {
    runs: number;
    botRate: number;
    avgMovesLeft: number;
    status: LevelStatus;
    /** Taux mesuré sur des parties neuves (audit hors échantillon), si effectué. */
    auditRate?: number;
  };
}

export function toSpec(l: Pick<LevelFile, "width" | "height" | "layout" | "colors" | "moves" | "goals" | "drops" | "seed" | "portals" | "conveyors">): LevelSpec {
  return { width: l.width, height: l.height, layout: l.layout, colors: l.colors, moves: l.moves, goals: l.goals, drops: l.drops, seed: l.seed, portals: l.portals, conveyors: l.conveyors };
}
