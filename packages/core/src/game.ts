import { areAdjacent, cloneState, isFreeNormal, isPiece, MAX_SIZE, neighbors4, parseToken } from "./board";
import { crossLines, crossCells, rectCells, squareAround, tripleLines } from "./effects";
import { findMatches } from "./match";
import { ensurePlayable, hasValidMove, isValidSwap, safeColor } from "./moves";
import { cascadeLoop, isSpawner, Phase } from "./resolve";
import { riseBubbles, rotateConveyors, runGenerators } from "./elements";
import { nextInt, pick, seedRng } from "./rng";
import type { AreaSpecial, ComboKind, DropConfig, GameEvent, GameState, Goal, Move, MoveResult, Piece, Pos } from "./types";

export interface LevelSpec {
  width: number;
  height: number;
  /** Lignes de '.' (active) et '#' (inactive). Ignoré si `layout` est fourni. */
  mask?: string[];
  /** Grille case par case (notation de `parseToken`) : obstacles, gel, verrous, couleurs imposées. */
  layout?: string[];
  colors: number;
  moves: number;
  goals: Goal[];
  seed: string;
  drops?: Omit<DropConfig, "spawned">;
  /** Portails [entrée, sortie] et boucles de tapis roulants (index de cases). */
  portals?: [Pos, Pos][];
  conveyors?: Pos[][];
  /**
   * Graine de l'essai. La grille de départ ne dépend que de `seed` (identique pour tous) ;
   * la suite des pièces qui tombent dépend de `seed` + `playSeed`. Absent = suite dérivée de `seed` seul.
   * Le jeu passe un numéro d'essai ; il ne dépend jamais du profil ni des dépenses du joueur (FAIR-01).
   */
  playSeed?: string;
}

export const MAX_FILL_ATTEMPTS = 1000;

/** Crée une partie : grille remplie sans alignement initial, avec au moins un coup jouable. */
export function createGame(spec: LevelSpec): GameState {
  const { width, height } = spec;
  if (width < 3 || height < 3 || width > MAX_SIZE || height > MAX_SIZE) throw new Error("taille de grille hors [3, 9]");
  if (spec.colors < 4 || spec.colors > 6) throw new Error("nombre de couleurs hors [4, 6]");
  const tokens = spec.layout
    ? spec.layout.map((r) => r.trim().split(/\s+/))
    : Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (spec.mask && spec.mask[y]?.[x] !== "." ? "#" : ".")));
  if (tokens.length !== height || tokens.some((r) => r.length !== width)) throw new Error("layout incohérent avec la taille");
  const cellsSpec = tokens.flat().map(parseToken);
  const mask = cellsSpec.map((c) => c.active);
  const ice = cellsSpec.map((c) => c.ice);

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
  if (ice.some((v) => v > 0)) st.ice = ice;
  const initialDrops = cellsSpec.filter((c) => c.content !== null && c.content !== "random" && c.content.kind === "drop").length;
  if (spec.drops) st.drops = { ...spec.drops, spawned: initialDrops };
  if (spec.portals?.length) st.portals = spec.portals.map(([a, b]) => [a, b] as [Pos, Pos]);
  if (spec.conveyors?.length) st.conveyors = spec.conveyors.map((l) => l.slice());
  if (cellsSpec.some((c) => c.content !== null && c.content !== "random" && c.content.kind === "chest")) st.keys = 0;

  for (let attempt = 0; attempt < MAX_FILL_ATTEMPTS; attempt++) {
    st.nextId = 1;
    for (let i = 0; i < st.cells.length; i++) {
      const c = cellsSpec[i];
      st.cells[i] = null;
      if (c.content === null) continue;
      if (c.content === "random") st.cells[i] = { id: st.nextId++, color: safeColor(st, i), special: null };
      else {
        const p: Piece = { id: st.nextId++, ...c.content };
        if (p.color === -2) p.color = safeColor(st, i); // pièce verrouillée de couleur aléatoire
        st.cells[i] = p;
      }
    }
    if (findMatches(st).length === 0 && hasValidMove(st)) {
      if (spec.playSeed !== undefined) st.rng = seedRng(`${spec.seed}|play|${spec.playSeed}`);
      return st;
    }
  }
  throw new Error("aucun remplissage jouable pour ce layout");
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

  const ivyBefore = countIvy(st);
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
  endOfTurn(st, ev, ivyBefore);
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

/** Effets de fin de coup, dans l'ordre : tapis roulants, montée des bulles, générateurs, lierre. */
export function endOfTurn(st: GameState, ev: GameEvent[], ivyBefore: number): void {
  let c = 1;
  if (rotateConveyors(st, ev)) c = cascadeLoop(st, ev, c);
  if (riseBubbles(st, ev)) c = cascadeLoop(st, ev, c);
  runGenerators(st, ev);
  if (ivyBefore > 0 && countIvy(st) >= ivyBefore) spreadIvy(st, ev);
}

export function countIvy(st: GameState): number {
  let n = 0;
  for (const p of st.cells) if (p?.kind === "ivy") n++;
  return n;
}

/** Part minimale de pièces libres que le lierre doit laisser sur la grille. */
export const IVY_MIN_FREE_SHARE = 0.5;

/**
 * Le lierre gagne une case voisine (pièce normale libre, sans gel) si aucun lierre n'a été détruit pendant le coup.
 * Il ne pousse jamais sur une case d'apparition (la grille ne doit pas pouvoir se tarir) et s'arrête
 * quand les pièces libres tomberaient sous la moitié des cases actives.
 */
export function spreadIvy(st: GameState, ev: GameEvent[]): void {
  let active = 0, free = 0;
  for (let i = 0; i < st.cells.length; i++) {
    if (!st.mask[i]) continue;
    active++;
    if (isFreeNormal(st.cells[i])) free++;
  }
  if (free - 1 < active * IVY_MIN_FREE_SHARE) return;
  const candidates = new Set<Pos>();
  for (let i = 0; i < st.cells.length; i++) {
    if (st.cells[i]?.kind !== "ivy") continue;
    for (const nb of neighbors4(st, i))
      if (isFreeNormal(st.cells[nb]) && !st.cells[nb]!.key && !(st.ice && st.ice[nb] > 0) && !isSpawner(st, nb)) candidates.add(nb);
  }
  if (candidates.size === 0) return;
  const target = pick(st.rng, [...candidates].sort((a, b) => a - b));
  const id = st.nextId++;
  st.cells[target] = { id, color: -1, special: null, kind: "ivy", hp: 1 };
  ev.push({ type: "ivySpread", at: target, id });
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
    for (let i = 0; i < st.cells.length; i++) if (isFreeNormal(st.cells[i])) normal.push(i);
    if (normal.length === 0) break;
    const i = pick(st.rng, normal);
    st.cells[i]!.special = nextInt(st.rng, 2) === 0 ? "rocketH" : "rocketV";
    changed.push(i);
  }
  if (changed.length > 0) ev.push({ type: "transformed", cells: changed, specials: changed.map((i) => st.cells[i]!.special!) });

  let cascade = 1;
  for (let round = 0; round < MAX_BONUS_ROUNDS; round++) {
    const specials = rectCells(st, 0, 0, st.width - 1, st.height - 1).filter((i) => {
      const p = st.cells[i];
      return isPiece(p) && p.special !== null && !p.lock;
    });
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
