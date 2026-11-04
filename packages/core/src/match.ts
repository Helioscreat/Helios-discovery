import { at, colorAt, xOf, yOf } from "./board";
import type { Board, MatchShape, Pos, Special } from "./types";

export interface MatchGroup {
  cells: Pos[];
  color: number;
  shape: MatchShape;
  /** Spéciale créée par ce groupe, ou null pour un alignement simple de 3. */
  special: Special | null;
}

/**
 * Détecte tous les groupes d'alignement de la grille.
 * Les alignements (≥ 3 en ligne ou en colonne) et carrés 2x2 de même couleur qui partagent
 * une case forment un seul groupe, classé par priorité : 5 en ligne > L/T > 4 en ligne > carré > 3.
 * Résultat trié par plus petit index de case : ordre déterministe.
 */
export function findMatches(b: Board): MatchGroup[] {
  const w = b.width, h = b.height, n = w * h;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, c: number) => {
    const ra = find(a), rc = find(c);
    if (ra !== rc) parent[Math.max(ra, rc)] = Math.min(ra, rc);
  };

  const runs: { cells: Pos[]; dir: "h" | "v" }[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = colorAt(b, at(b, x, y));
      let e = x + 1;
      if (c >= 0) while (e < w && colorAt(b, at(b, e, y)) === c) e++;
      if (c >= 0 && e - x >= 3) {
        const cells: Pos[] = [];
        for (let k = x; k < e; k++) cells.push(at(b, k, y));
        runs.push({ cells, dir: "h" });
      }
      x = e;
    }
  }
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      const c = colorAt(b, at(b, x, y));
      let e = y + 1;
      if (c >= 0) while (e < h && colorAt(b, at(b, x, e)) === c) e++;
      if (c >= 0 && e - y >= 3) {
        const cells: Pos[] = [];
        for (let k = y; k < e; k++) cells.push(at(b, x, k));
        runs.push({ cells, dir: "v" });
      }
      y = e;
    }
  }
  const squares: Pos[][] = [];
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = at(b, x, y);
      const c = colorAt(b, a);
      if (c >= 0 && colorAt(b, a + 1) === c && colorAt(b, a + w) === c && colorAt(b, a + w + 1) === c) {
        squares.push([a, a + 1, a + w, a + w + 1]);
      }
    }
  }
  if (runs.length === 0 && squares.length === 0) return [];

  const inMatch = new Uint8Array(n);
  for (const r of runs) for (let k = 0; k < r.cells.length; k++) {
    inMatch[r.cells[k]] = 1;
    if (k > 0) union(r.cells[0], r.cells[k]);
  }
  for (const s of squares) for (let k = 0; k < 4; k++) {
    inMatch[s[k]] = 1;
    if (k > 0) union(s[0], s[k]);
  }

  interface Stats { cells: Pos[]; maxH: number; maxV: number; squares: number }
  const groups = new Map<number, Stats>();
  const stats = (root: number): Stats => {
    let g = groups.get(root);
    if (!g) groups.set(root, (g = { cells: [], maxH: 0, maxV: 0, squares: 0 }));
    return g;
  };
  for (let i = 0; i < n; i++) if (inMatch[i]) stats(find(i)).cells.push(i);
  for (const r of runs) {
    const g = stats(find(r.cells[0]));
    if (r.dir === "h") g.maxH = Math.max(g.maxH, r.cells.length);
    else g.maxV = Math.max(g.maxV, r.cells.length);
  }
  for (const s of squares) stats(find(s[0])).squares++;

  const out: MatchGroup[] = [];
  for (const g of groups.values()) {
    const color = colorAt(b, g.cells[0]);
    let shape: MatchShape;
    let special: Special | null;
    if (g.maxH >= 5 || g.maxV >= 5) [shape, special] = ["line5", "prism"];
    else if (g.maxH >= 3 && g.maxV >= 3) [shape, special] = ["lt", "bomb"];
    // Fusée perpendiculaire à l'alignement : 4 horizontaux → Fusée verticale.
    else if (g.maxH === 4) [shape, special] = ["line4", "rocketV"];
    else if (g.maxV === 4) [shape, special] = ["line4", "rocketH"];
    else if (g.squares > 0) [shape, special] = ["square", "dragonfly"];
    else [shape, special] = ["line3", null];
    out.push({ cells: g.cells, color, shape, special });
  }
  out.sort((p, q) => p.cells[0] - q.cells[0]);
  return out;
}

/** Vrai si la case `i` fait partie d'un alignement ou d'un carré (test local, rapide). */
export function hasMatchAt(b: Board, i: Pos): boolean {
  const c = colorAt(b, i);
  if (c < 0) return false;
  const x = xOf(b, i), y = yOf(b, i), w = b.width, h = b.height;
  let l = x, r = x;
  while (l > 0 && colorAt(b, at(b, l - 1, y)) === c) l--;
  while (r < w - 1 && colorAt(b, at(b, r + 1, y)) === c) r++;
  if (r - l >= 2) return true;
  let t = y, d = y;
  while (t > 0 && colorAt(b, at(b, x, t - 1)) === c) t--;
  while (d < h - 1 && colorAt(b, at(b, x, d + 1)) === c) d++;
  if (d - t >= 2) return true;
  for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
    const x0 = x + dx, y0 = y + dy;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) continue;
    const a = at(b, x0, y0);
    if (colorAt(b, a) === c && colorAt(b, a + 1) === c && colorAt(b, a + w) === c && colorAt(b, a + w + 1) === c) return true;
  }
  return false;
}
