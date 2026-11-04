import type { RngState } from "./rng";

/** Spéciales. Fusée horizontale = efface sa ligne ; verticale = efface sa colonne. */
export type Special = "rocketH" | "rocketV" | "bomb" | "dragonfly" | "prism";
export type AreaSpecial = "rocketH" | "rocketV" | "bomb";

/** Une pièce. `color` vaut -1 pour un Prisme (il n'a pas de couleur et ne s'aligne pas). */
export interface Piece {
  id: number;
  color: number;
  special: Special | null;
}

export type Goal =
  | { type: "score"; target: number }
  | { type: "collect"; color: number; count: number };

/** Index de case : y * width + x, y = 0 en haut. */
export type Pos = number;

export interface Move {
  from: Pos;
  to: Pos;
}

export interface Board {
  width: number;
  height: number;
  /** true = case jouable. Les cases inactives sont toujours `null`. */
  mask: boolean[];
  cells: (Piece | null)[];
}

/** État complet d'une partie : sérialisable en JSON, aucune référence partagée. */
export interface GameState extends Board {
  version: 1;
  colors: number;
  rng: RngState;
  nextId: number;
  movesLeft: number;
  moveCount: number;
  score: number;
  goals: Goal[];
  /** Avancement par objectif (score atteint ou pièces collectées). */
  progress: number[];
  status: "playing" | "won" | "lost";
}

export type MatchShape = "line3" | "line4" | "line5" | "lt" | "square";

export type ComboKind =
  | "prism+color"
  | "prism+rocket"
  | "prism+bomb"
  | "prism+dragonfly"
  | "prism+prism"
  | "rocket+rocket"
  | "rocket+bomb"
  | "bomb+bomb"
  | "dragonfly+dragonfly"
  | "dragonfly+rocket"
  | "dragonfly+bomb";

/** Événements émis pour le rendu (animations, sons, vibrations). Le rendu ne modifie jamais l'état. */
export type GameEvent =
  | { type: "swap"; from: Pos; to: Pos }
  | { type: "swapRejected"; from: Pos; to: Pos; reason: "notAdjacent" | "empty" | "noMatch" | "notPlaying" }
  | { type: "cascade"; index: number }
  | { type: "match"; cells: Pos[]; color: number; shape: MatchShape }
  | { type: "combo"; kind: ComboKind; at: Pos }
  | { type: "transformed"; cells: Pos[]; specials: Special[] }
  | { type: "activated"; at: Pos; special: Special; cells: Pos[] }
  | { type: "dragonflyFlight"; from: Pos; to: Pos; carry: AreaSpecial | null }
  | { type: "cleared"; cells: Pos[]; cascade: number }
  | { type: "specialCreated"; at: Pos; special: Special; color: number; id: number }
  | { type: "gravity"; moves: [Pos, Pos][] }
  | { type: "spawned"; pieces: { at: Pos; id: number; color: number }[] }
  | { type: "score"; delta: number; total: number }
  | { type: "shuffle"; mapping: [Pos, Pos][] }
  | { type: "bonusStart"; moves: number }
  | { type: "booster"; booster: string; at: Pos }
  | { type: "won" }
  | { type: "lost" };

export interface MoveResult {
  state: GameState;
  events: GameEvent[];
  accepted: boolean;
}
