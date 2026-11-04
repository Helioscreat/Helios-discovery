import { at, isActive, xOf, yOf } from "./board";
import type { AreaSpecial, Board, Pos } from "./types";

/** Cases actives du rectangle [x0..x1] × [y0..y1] (bornes incluses, tronqué à la grille). */
export function rectCells(b: Board, x0: number, y0: number, x1: number, y1: number): Pos[] {
  const out: Pos[] = [];
  for (let y = Math.max(0, y0); y <= Math.min(b.height - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(b.width - 1, x1); x++)
      if (b.mask[at(b, x, y)]) out.push(at(b, x, y));
  return out;
}

export const rowCells = (b: Board, y: number) => rectCells(b, 0, y, b.width - 1, y);
export const colCells = (b: Board, x: number) => rectCells(b, x, 0, x, b.height - 1);
export const squareAround = (b: Board, i: Pos, r: number) =>
  rectCells(b, xOf(b, i) - r, yOf(b, i) - r, xOf(b, i) + r, yOf(b, i) + r);

/** Case + ses 4 voisines actives (impact de la Libellule au décollage). */
export function crossCells(b: Board, i: Pos): Pos[] {
  const x = xOf(b, i), y = yOf(b, i);
  const out: Pos[] = [i];
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const)
    if (isActive(b, x + dx, y + dy)) out.push(at(b, x + dx, y + dy));
  return out;
}

/** Zone d'effet d'une spéciale « de zone », centrée sur `i`. */
export function areaCells(b: Board, special: AreaSpecial, i: Pos): Pos[] {
  switch (special) {
    case "rocketH": return rowCells(b, yOf(b, i));
    case "rocketV": return colCells(b, xOf(b, i));
    case "bomb": return squareAround(b, i, 1);
  }
}

const union = (...lists: Pos[][]): Pos[] => [...new Set(lists.flat())].sort((p, q) => p - q);

/** Fusée + Fusée : ligne + colonne. */
export const crossLines = (b: Board, i: Pos) => union(rowCells(b, yOf(b, i)), colCells(b, xOf(b, i)));

/** Fusée + Bombe : 3 lignes + 3 colonnes centrées. */
export function tripleLines(b: Board, i: Pos): Pos[] {
  const x = xOf(b, i), y = yOf(b, i);
  return union(
    rectCells(b, 0, y - 1, b.width - 1, y + 1),
    rectCells(b, x - 1, 0, x + 1, b.height - 1),
  );
}
