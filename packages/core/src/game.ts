import { areAdjacent, cloneState, MAX_SIZE } from "./board";
import { crossLines, crossCells, rectCells, squareAround, tripleLines } from "./effects";
import { findMatches } from "./match";
import { ensurePlayable, hasValidMove, isValidSwap, safeColor } from "./moves";
import { cascadeLoop, Phase } from "./resolve";
import { nextInt, pick, seedRng } from "./rng";
import type { AreaSpecial, ComboKind, GameEvent, GameState, Goal, Move, MoveResult, Piece, Pos } from "./types";

export interface LevelSpec {
  width: number;
  height: number;
  /** Lignes de '.' (active) et '#' (inactive). Absent = grille pleine. */
  mask?: string[];
  colors: number;
  moves: number;
  goals: Goal[];
  seed: string;
}

export const MAX_FILL_ATTEMPTS = 1000;

/** Crée une partie : grille remplie sans alignement initial, avec au moins un coup jouable. */
export function createGame(spec: LevelSpec): GameState {
  const { width, height } = spec;
  if (width < 3 || height < 3 || width > MAX_SIZE || height > MAX_SIZE) throw new Error("taille de grille hors [3, 9]");
  if (spec.colors < 4 || spec.colors > 6) throw new Error("nombre de couleurs hors [4, 6]");
  const mask: boolean[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) mask.push(spec.mask ? spec.mask[y]?.[x] === "." : true);

  const st: GameState = {
    version: 1,
    width,
    height,
    mask,
    cells: mask.map(() => null),
    colors: spec.colors,
    rng: seedRng(spec.seed),
    nextId: 1,
    movesLeft: spec.moves,
    moveCount: 0,
    score: 0,
    goals: spec.goals.map((g) => ({ ...g })),
    progress: spec.goals.map(() => 0),
    status: "playing",
  };
  for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
    st.nextId = 1;
    for (let i = 0; i < st.cells.length; i++) {
      st.cells[i] = null;
      if (mask[i]) st.cells[i] = { id: st.nextId++, color: safeColor(st, i), special: null };
    }
    if (hasValidMove(st)) return st;
  }
  throw new Error("aucun remplissage jouable pour ce masque");
}

/** Version pure : l'état d'entrée n'est jamais modifié. */
export function applyMove(state: GameState, move: Move): MoveResult {
  const st = cloneState(state);
  const res = applyMoveInPlace(st, move);
  return { state: res.accepted ? st : state, events: res.events, accepted: res.accepted };
}

/** Version en place (bot, simulations) : modifie `st`. */
export function applyMoveInPlace(st: GameState, move: Move): { events: GameEvent[]; accepted: boolean } {
  const ev: GameEvent[] = [];
  const { from, to } = move;
  const reject = (reason: "notAdjacent" | "empty" | "noMatch" | "notPlaying") => {
    ev.push({ type: "swapRejected", from, to, reason });
    return { events: ev, accepted: false };
  };
  if (st.status !== "playing") return reject("notPlaying");
  if (from < 0 || to < 0 || from >= st.cells.length || to >= st.cells.length || !areAdjacent(st, from, to)) return reject("notAdjacent");
  if (!st.mask[from] || !st.mask[to] || st.cells[from] === null || st.cells[to] === null) return reject("empty");
  if (!isValidSwap(st, from, to)) return reject("noMatch");

  // La pièce déplacée arrive en `to` ; les effets de combo sont centrés sur `to`.
  const moved = st.cells[from]!;
  st.cells[from] = st.cells[to];
  st.cells[to] = moved;
  ev.push({ type: "swap", from, to });

  const phase = new Phase(st, ev, 1);
  if (!resolveCombo(phase, to, from)) phase.applyMatches(findMatches(st), [to, from]);
  phase.run();
  phase.finish();
  cascadeLoop(st, ev, 1);

  st.movesLeft--;
  st.moveCount++;
  if (goalsDone(st)) {
    runBonus(st, ev);
    st.status = "won";
    ev.push({ type: "won" });
  } else if (st.movesLeft <= 0) {
    st.status = "lost";
    ev.push({ type: "lost" });
  } else {
    ensurePlayable(st, ev);
  }
  return { events: ev, accepted: true };
}

export function goalsDone(st: GameState): boolean {
  return st.goals.every((g, k) => st.progress[k] >= (g.type === "score" ? g.target : g.count));
}

const kindOf = (p: Piece) => (p.special === "rocketH" || p.special === "rocketV" ? "rocket" : p.special);

/** Résout un échange de spéciales (ou impliquant un Prisme). Renvoie false si ce n'est pas un combo. */
function resolveCombo(phase: Phase, to: Pos, from: Pos): boolean {
  const st = phase.st;
  const a = st.cells[to]!, b = st.cells[from]!;
  const combo = (kind: ComboKind) => phase.ev.push({ type: "combo", kind, at: to });

  if (a.special === "prism" || b.special === "prism") {
    phase.hit(to, false);
    phase.hit(from, false);
    if (a.special === "prism" && b.special === "prism") {
      combo("prism+prism");
      for (let i = 0; i < st.cells.length; i++) phase.hit(i, false); // grille vidée, sans réaction en chaîne
      return true;
    }
    const other = a.special === "prism" ? b : a;
    const otherPos = other === a ? to : from;
    const k = kindOf(other);
    if (k === null) {
      combo("prism+color");
      phase.hitAll(phase.cellsOfColor(other.color));
    } else if (k === "prism") {
      return true; // inatteignable
    } else {
      combo(`prism+${k}`);
      phase.transformColor(other.color, k);
      phase.enqueue(otherPos, other);
    }
    return true;
  }
  if (a.special === null || b.special === null) return false;

  const ka = kindOf(a)!, kb = kindOf(b)!;
  const has = (k: string) => ka === k || kb === k;
  phase.hit(to, false);
  phase.hit(from, false);
  if (ka === "dragonfly" && kb === "dragonfly") {
    combo("dragonfly+dragonfly");
    phase.hitAll(crossCells(st, to));
    for (let n = 0; n < 3; n++) phase.flight(to, null);
  } else if (has("dragonfly")) {
    const carrier = ka === "dragonfly" ? b : a;
    combo(kindOf(carrier) === "bomb" ? "dragonfly+bomb" : "dragonfly+rocket");
    phase.hitAll(crossCells(st, to));
    phase.flight(to, carrier.special as AreaSpecial);
  } else if (ka === "rocket" && kb === "rocket") {
    combo("rocket+rocket");
    phase.hitAll(crossLines(st, to));
  } else if (has("rocket")) {
    combo("rocket+bomb");
    phase.hitAll(tripleLines(st, to));
  } else {
    combo("bomb+bomb");
    phase.hitAll(squareAround(st, to, 2));
  }
  return true;
}

export const MAX_BONUS_ROUNDS = 50;

/**
 * Fin de niveau : chaque coup restant devient une Fusée sur une pièce normale au hasard,
 * puis toutes les spéciales de la grille se déclenchent, cascades comprises.
 */
export function runBonus(st: GameState, ev: GameEvent[]): void {
  const n = st.movesLeft;
  ev.push({ type: "bonusStart", moves: n });
  st.movesLeft = 0;
  const changed: Pos[] = [];
  for (let k = 0; k < n; k++) {
    const normal: Pos[] = [];
    for (let i = 0; i < st.cells.length; i++) if (st.cells[i]?.special === null) normal.push(i);
    if (normal.length === 0) break;
    const i = pick(st.rng, normal);
    st.cells[i]!.special = nextInt(st.rng, 2) === 0 ? "rocketH" : "rocketV";
    changed.push(i);
  }
  if (changed.length > 0) ev.push({ type: "transformed", cells: changed, specials: changed.map((i) => st.cells[i]!.special!) });

  let cascade = 1;
  for (let round = 0; round < MAX_BONUS_ROUNDS; round++) {
    const specials = rectCells(st, 0, 0, st.width - 1, st.height - 1).filter((i) => st.cells[i]?.special != null);
    if (specials.length === 0) return;
    const phase = new Phase(st, ev, cascade);
    phase.hitAll(specials);
    phase.run();
    phase.finish();
    cascade = cascadeLoop(st, ev, cascade) + 1;
  }
}

/** Résout une grille qui contient déjà des alignements (tests, éditeur de niveaux). */
export function stabilize(st: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  cascadeLoop(st, ev, 0);
  return ev;
}
