import { areAdjacent, at, colorAt } from "./board";
import { findMatches, hasMatchAt } from "./match";
import { nextInt, shuffleInPlace } from "./rng";
import type { Board, GameEvent, GameState, Move, Piece, Pos } from "./types";

const swapCells = (b: Board, a: Pos, c: Pos) => {
  const t = b.cells[a];
  b.cells[a] = b.cells[c];
  b.cells[c] = t;
};

/** Un échange est valide s'il implique un Prisme, deux spéciales, ou s'il crée un alignement. */
export function isValidSwap(b: Board, from: Pos, to: Pos): boolean {
  if (!b.mask[from] || !b.mask[to] || !areAdjacent(b, from, to)) return false;
  const p = b.cells[from], q = b.cells[to];
  if (p === null || q === null) return false;
  if (p.special === "prism" || q.special === "prism") return true;
  if (p.special !== null && q.special !== null) return true;
  if (p.color === q.color) return false;
  swapCells(b, from, to);
  const ok = hasMatchAt(b, from) || hasMatchAt(b, to);
  swapCells(b, from, to);
  return ok;
}

/** Tous les coups valides, dans un ordre déterministe (case d'origine, puis droite avant bas). */
export function listValidMoves(b: Board): Move[] {
  const out: Move[] = [];
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const i = at(b, x, y);
      if (x + 1 < b.width && isValidSwap(b, i, i + 1)) out.push({ from: i, to: i + 1 });
      if (y + 1 < b.height && isValidSwap(b, i, i + b.width)) out.push({ from: i, to: i + b.width });
    }
  return out;
}

export function hasValidMove(b: Board): boolean {
  for (let i = 0; i < b.cells.length; i++) {
    const x = i % b.width;
    if (x + 1 < b.width && isValidSwap(b, i, i + 1)) return true;
    if (i + b.width < b.cells.length && isValidSwap(b, i, i + b.width)) return true;
  }
  return false;
}

/** Valeur heuristique d'un coup (indice, bot glouton) : combos d'abord, puis taille et spéciales. */
export function moveValue(b: Board, m: Move): number {
  const p = b.cells[m.from]!, q = b.cells[m.to]!;
  if (p.special === "prism" && q.special === "prism") return 1000;
  if (p.special === "prism" || q.special === "prism") return 500 + (p.special !== null && q.special !== null ? 200 : 0);
  if (p.special !== null && q.special !== null) return 400;
  swapCells(b, m.from, m.to);
  let v = 0;
  for (const g of findMatches(b)) {
    v += g.cells.length * 10;
    if (g.special === "prism") v += 150;
    else if (g.special === "bomb") v += 80;
    else if (g.special !== null) v += 50;
    for (const c of g.cells) if (b.cells[c]!.special !== null) v += 30;
  }
  swapCells(b, m.from, m.to);
  return v;
}

/** Meilleur coup selon `moveValue` (égalité : premier dans l'ordre de `listValidMoves`). */
export function getHint(b: Board): Move | null {
  let best: Move | null = null;
  let bestV = -1;
  for (const m of listValidMoves(b)) {
    const v = moveValue(b, m);
    if (v > bestV) [best, bestV] = [m, v];
  }
  return best;
}

/** Couleur tirée au hasard qui ne crée ni alignement ni carré avec les voisins déjà posés (gauche, haut). */
export function safeColor(st: GameState, i: Pos): number {
  const w = st.width, x = i % w, y = Math.floor(i / w);
  const banned = new Set<number>();
  if (x >= 2 && colorAt(st, i - 1) >= 0 && colorAt(st, i - 1) === colorAt(st, i - 2)) banned.add(colorAt(st, i - 1));
  if (y >= 2 && colorAt(st, i - w) >= 0 && colorAt(st, i - w) === colorAt(st, i - 2 * w)) banned.add(colorAt(st, i - w));
  if (x >= 1 && y >= 1) {
    const l = colorAt(st, i - 1);
    if (l >= 0 && l === colorAt(st, i - w) && l === colorAt(st, i - w - 1)) banned.add(l);
  }
  const allowed: number[] = [];
  for (let c = 0; c < st.colors; c++) if (!banned.has(c)) allowed.push(c);
  return allowed[nextInt(st.rng, allowed.length)];
}

export const SHUFFLE_ATTEMPTS = 100;

/**
 * Garantit qu'un coup est jouable. Si aucun : mélange les pièces (les spéciales comprises) ;
 * après SHUFFLE_ATTEMPTS échecs, recolore les pièces normales. Ne consomme aucun coup.
 */
export function ensurePlayable(st: GameState, ev: GameEvent[]): void {
  if (hasValidMove(st)) return;
  const positions: Pos[] = [];
  for (let i = 0; i < st.cells.length; i++) if (st.mask[i] && st.cells[i] !== null) positions.push(i);
  const original = positions.map((i) => st.cells[i] as Piece);

  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    const order = shuffleInPlace(st.rng, positions.map((_, k) => k));
    positions.forEach((pos, k) => (st.cells[pos] = original[order[k]]));
    if (findMatches(st).length === 0 && hasValidMove(st)) {
      ev.push({ type: "shuffle", mapping: positions.map((pos, k) => [positions[order[k]], pos] as [Pos, Pos]) });
      return;
    }
  }
  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    positions.forEach((pos, k) => (st.cells[pos] = original[k]));
    for (const pos of positions) {
      const p = st.cells[pos]!;
      if (p.special === null) p.color = -1;
    }
    for (const pos of positions) {
      const p = st.cells[pos]!;
      if (p.special === null) p.color = safeColor(st, pos);
    }
    if (findMatches(st).length === 0 && hasValidMove(st)) {
      ev.push({ type: "shuffle", mapping: positions.map((pos) => [pos, pos] as [Pos, Pos]) });
      return;
    }
  }
  throw new Error("grille injouable : aucun mélange ne produit de coup valide");
}
