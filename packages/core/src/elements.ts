import { isFreeNormal, isPiece, neighbors4 } from "./board";
import { isSpawner } from "./resolve";
import { pick } from "./rng";
import type { GameEvent, GameState, Pos } from "./types";

/** Plafonds de production des Générateurs (la grille ne doit jamais se boucher). */
export const MAX_GENERATED: Record<"bubble" | "crate", number> = { bubble: 6, crate: 8 };

/**
 * Tapis roulants : après chaque coup, le contenu de chaque boucle avance d'une case (cellule i → i+1).
 * Le gel reste attaché à sa case. Une boucle contenant un Générateur ou un Coffre ne bouge pas.
 */
export function rotateConveyors(st: GameState, ev: GameEvent[]): boolean {
  if (!st.conveyors) return false;
  const moves: [Pos, Pos][] = [];
  for (const loop of st.conveyors) {
    if (loop.some((i) => st.cells[i]?.kind === "generator" || st.cells[i]?.kind === "chest")) continue;
    const contents = loop.map((i) => st.cells[i]);
    loop.forEach((i, k) => {
      const to = loop[(k + 1) % loop.length];
      st.cells[to] = contents[k];
      if (contents[k]) moves.push([i, to]);
    });
  }
  if (moves.length > 0) ev.push({ type: "conveyor", moves });
  return moves.length > 0;
}

/** Bulles : chacune monte d'une case en échangeant sa place avec la pièce libre au-dessus (de haut en bas). */
export function riseBubbles(st: GameState, ev: GameEvent[]): boolean {
  const w = st.width;
  const moves: [Pos, Pos][] = [];
  for (let i = w; i < st.cells.length; i++) {
    if (st.cells[i]?.kind !== "bubble") continue;
    const up = i - w;
    const p = st.cells[up];
    if (!st.mask[up] || !isFreeNormal(p) || p!.key) continue;
    st.cells[up] = st.cells[i];
    st.cells[i] = p;
    moves.push([i, up], [up, i]);
  }
  if (moves.length > 0) ev.push({ type: "bubbleRise", moves });
  return moves.length > 0;
}

/** Générateurs : tous les `every` coups, produisent une bulle ou une caisse sur une case voisine libre. */
export function runGenerators(st: GameState, ev: GameEvent[]): void {
  for (let g = 0; g < st.cells.length; g++) {
    const gen = st.cells[g];
    if (gen?.kind !== "generator" || !gen.product || st.moveCount % (gen.every ?? 3) !== 0) continue;
    const product = gen.product;
    const existing = st.cells.filter((p) => p?.kind === product).length;
    if (existing >= MAX_GENERATED[product]) continue;
    const spots = neighbors4(st, g).filter((n) => {
      const p = st.cells[n];
      return isFreeNormal(p) && isPiece(p) && !p.key && !(st.ice && st.ice[n] > 0) && (product === "bubble" || !isSpawner(st, n));
    });
    if (spots.length === 0) continue;
    const at = pick(st.rng, spots);
    const id = st.nextId++;
    st.cells[at] = product === "bubble" ? { id, color: -1, special: null, kind: "bubble", hp: 1 } : { id, color: -1, special: null, kind: "crate", hp: 1 };
    ev.push({ type: "generated", at, id, product, from: g });
  }
}
