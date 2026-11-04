import type { RngState } from "./rng";

/** Spéciales. Fusée horizontale = efface sa ligne ; verticale = efface sa colonne. */
export type Special = "rocketH" | "rocketV" | "bomb" | "dragonfly" | "prism";
export type AreaSpecial = "rocketH" | "rocketV" | "bomb";

/**
 * Contenu d'une case.
 *  - kind absent ou "piece" : pièce jouable. `color` vaut -1 pour un Prisme.
 *  - "crate" : Caisse (1 à 3 PV), fixe, abîmée par un alignement voisin ou une explosion.
 *  - "ivy"   : Lierre, fixe, 1 PV ; se propage d'une case si aucun lierre n'est détruit pendant le coup.
 *  - "drop"  : Objet à faire descendre ; indestructible, tombe, sort par le bas.
 * `lock` : Chaîne (la pièce s'aligne mais ne bouge pas ; un alignement qui l'inclut brise la chaîne)
 *          ou Cage (la pièce ne bouge pas et ne s'aligne pas ; libérée par un alignement voisin ou une explosion).
 */
export interface Piece {
  id: number;
  color: number;
  special: Special | null;
  kind?: PieceKind;
  hp?: number;
  lock?: Lock | null;
}

export type PieceKind = "piece" | "crate" | "ivy" | "drop";
export type Lock = "chain" | "cage";
export type ObstacleKind = "ice" | "crate" | "ivy" | "chain" | "cage";

export type Goal =
  | { type: "score"; target: number }
  | { type: "collect"; color: number; count: number }
  | { type: "clear"; target: ObstacleKind; count: number }
  | { type: "drop"; count: number };

export const goalTarget = (g: Goal): number => (g.type === "score" ? g.target : g.count);

/** Apparition des objets à faire descendre. */
export interface DropConfig {
  /** Nombre total d'objets du niveau (ceux posés au départ compris). */
  total: number;
  /** Nombre maximal d'objets présents en même temps sur la grille. */
  maxOnBoard: number;
  /** Objets déjà créés (état). */
  spawned: number;
}

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
  /** Couches de Gel sous chaque case (0 à 3). Absent = aucun gel. */
  ice?: number[];
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
  drops?: DropConfig;
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
  | { type: "spawned"; pieces: { at: Pos; id: number; color: number; kind?: PieceKind }[] }
  | { type: "score"; delta: number; total: number }
  | { type: "shuffle"; mapping: [Pos, Pos][] }
  | { type: "bonusStart"; moves: number }
  | { type: "booster"; booster: string; at: Pos }
  | { type: "damaged"; at: Pos; obstacle: ObstacleKind; left: number }
  | { type: "dropCollected"; at: Pos; id: number }
  | { type: "ivySpread"; at: Pos; id: number }
  | { type: "won" }
  | { type: "lost" };

export interface MoveResult {
  state: GameState;
  events: GameEvent[];
  accepted: boolean;
}
