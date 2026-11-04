import { areAdjacent, at, colorAt, isMovable, isPiece, neighbors4 } from "./board";
import { findMatches, hasMatchAt } from "./match";
import { nextInt, shuffleInPlace } from "./rng";
import { goalTarget, type Board, type GameEvent, type GameState, type Goal, type Move, type ObstacleKind, type Piece, type Pos, type Special } from "./types";

const swapCells = (b: Board, a: Pos, c: Pos) => {
  const t = b.cells[a];
  b.cells[a] = b.cells[c];
  b.cells[c] = t;
};

/** Un échange est valide s'il implique un Prisme, deux spéciales, ou s'il crée un alignement. */
export function isValidSwap(b: Board, from: Pos, to: Pos): boolean {
  if (!b.mask[from] || !b.mask[to] || !areAdjacent(b, from, to)) return false;
  const p = b.cells[from], q = b.cells[to];
  if (!isMovable(p) || !isMovable(q)) return false;
  if (p.special === "prism" || q.special === "prism") return true;
  if (p.special !== null && q.special !== null) return true;
  if (p.color === q.color && p.kind === q.kind) return false;
  swapCells(b, from, to);
  const ok = hasMatchAt(b, from) || hasMatchAt(b, to);
  swapCells(b, from, to);
  return ok;
}

/** Tables précalculées d'une grille : couleur alignable, mobilité, type de spéciale (0 aucune, 1 spéciale, 2 Prisme). */
interface Tables {
  col: Int8Array;
  mov: Uint8Array;
  spc: Uint8Array;
}

function tables(b: Board): Tables {
  const n = b.cells.length;
  const col = new Int8Array(n), mov = new Uint8Array(n), spc = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = b.cells[i];
    col[i] = colorAt(b, i);
    if (isMovable(p)) {
      mov[i] = 1;
      spc[i] = p.special === "prism" ? 2 : p.special !== null ? 1 : 0;
    }
  }
  return { col, mov, spc };
}

/** L'échange a↔c crée-t-il un alignement ou un carré ? Simulé sur la table des couleurs, sans modifier la grille. */
function swapMatches(t: Tables, w: number, h: number, a: Pos, c: Pos): boolean {
  const col = t.col;
  const get = (i: number) => (i === a ? col[c] : i === c ? col[a] : col[i]);
  for (const p of [a, c]) {
    const k = get(p);
    if (k < 0) continue;
    const x = p % w, y = (p - x) / w;
    let run = 1;
    for (let xx = x - 1; xx >= 0 && get(p - (x - xx)) === k; xx--) run++;
    for (let xx = x + 1; xx < w && get(p + (xx - x)) === k; xx++) run++;
    if (run >= 3) return true;
    run = 1;
    for (let yy = y - 1; yy >= 0 && get(p - (y - yy) * w) === k; yy--) run++;
    for (let yy = y + 1; yy < h && get(p + (yy - y) * w) === k; yy++) run++;
    if (run >= 3) return true;
    for (let dy = -1; dy <= 0; dy++)
      for (let dx = -1; dx <= 0; dx++) {
        const x0 = x + dx, y0 = y + dy;
        if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) continue;
        const q = y0 * w + x0;
        if (get(q) === k && get(q + 1) === k && get(q + w) === k && get(q + w + 1) === k) return true;
      }
  }
  return false;
}

function validWith(t: Tables, b: Board, a: Pos, c: Pos): boolean {
  if (!t.mov[a] || !t.mov[c]) return false;
  if (t.spc[a] === 2 || t.spc[c] === 2) return true;
  if (t.spc[a] && t.spc[c]) return true;
  if (t.col[a] === t.col[c]) return false;
  return swapMatches(t, b.width, b.height, a, c);
}

/** Tous les coups valides, dans un ordre déterministe (case d'origine, puis droite avant bas). */
export function listValidMoves(b: Board): Move[] {
  const t = tables(b);
  const out: Move[] = [];
  const w = b.width, n = b.cells.length;
  for (let i = 0; i < n; i++) {
    if (!t.mov[i]) continue;
    if (i % w < w - 1 && validWith(t, b, i, i + 1)) out.push({ from: i, to: i + 1 });
    if (i + w < n && validWith(t, b, i, i + w)) out.push({ from: i, to: i + w });
  }
  return out;
}

export function hasValidMove(b: Board): boolean {
  const t = tables(b);
  const w = b.width, n = b.cells.length;
  for (let i = 0; i < n; i++) {
    if (!t.mov[i]) continue;
    if (i % w < w - 1 && validWith(t, b, i, i + 1)) return true;
    if (i + w < n && validWith(t, b, i, i + w)) return true;
  }
  return false;
}

export interface LocalMatch {
  cells: Pos[];
  special: Special | null;
}

/**
 * Alignement passant par la case `i` (lignes, colonne, carrés qui la contiennent).
 * Approximation locale de `findMatches`, en O(taille de grille) au pire, sans allocation de grille :
 * utilisée pour évaluer des milliers de coups candidats (indice, bot).
 */
export function localMatch(b: Board, i: Pos): LocalMatch | null {
  const c = colorAt(b, i);
  if (c < 0) return null;
  const w = b.width, h = b.height, x = i % w, y = (i - x) / w;
  let l = x, r = x, t = y, d = y;
  while (l > 0 && colorAt(b, i - (x - l) - 1) === c) l--;
  while (r < w - 1 && colorAt(b, i + (r - x) + 1) === c) r++;
  while (t > 0 && colorAt(b, i - (y - t + 1) * w) === c) t--;
  while (d < h - 1 && colorAt(b, i + (d - y + 1) * w) === c) d++;
  const hLen = r - l + 1, vLen = d - t + 1;
  const cells: Pos[] = [];
  if (hLen >= 3) for (let k = l; k <= r; k++) cells.push(y * w + k);
  if (vLen >= 3) for (let k = t; k <= d; k++) if (k !== y || hLen < 3) cells.push(k * w + x);
  let square = false;
  for (let dy = -1; dy <= 0; dy++)
    for (let dx = -1; dx <= 0; dx++) {
      const x0 = x + dx, y0 = y + dy;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) continue;
      const a = y0 * w + x0;
      if (colorAt(b, a) === c && colorAt(b, a + 1) === c && colorAt(b, a + w) === c && colorAt(b, a + w + 1) === c) {
        square = true;
        for (const q of [a, a + 1, a + w, a + w + 1]) if (!cells.includes(q)) cells.push(q);
      }
    }
  if (cells.length === 0) return null;
  const special: Special | null =
    hLen >= 5 || vLen >= 5 ? "prism" : hLen >= 3 && vLen >= 3 ? "bomb" : hLen === 4 ? "rocketV" : vLen === 4 ? "rocketH" : square ? "dragonfly" : null;
  return { cells, special };
}

/** Ce que les objectifs inachevés demandent : sert à orienter l'indice et le bot. */
export interface GoalContext {
  colors: Set<number>;
  obstacles: Set<ObstacleKind>;
  drops: boolean;
}

export function goalContext(st: Board & { goals?: Goal[]; progress?: number[] }): GoalContext {
  const ctx: GoalContext = { colors: new Set(), obstacles: new Set(), drops: false };
  st.goals?.forEach((g, k) => {
    if ((st.progress?.[k] ?? 0) >= goalTarget(g)) return;
    if (g.type === "collect") ctx.colors.add(g.color);
    else if (g.type === "clear") ctx.obstacles.add(g.target);
    else if (g.type === "drop") ctx.drops = true;
  });
  return ctx;
}

const SPECIAL_VALUE: Record<Special, number> = { rocketH: 50, rocketV: 50, dragonfly: 45, bomb: 80, prism: 150 };

/**
 * Valeur heuristique d'un coup (indice, bot glouton) : combos d'abord, puis taille de l'alignement,
 * spéciale créée, et contribution aux objectifs (couleur demandée, gel, verrous, obstacles voisins, objets au-dessus).
 */
export function moveValue(b: Board, m: Move, ctx: GoalContext = { colors: new Set(), obstacles: new Set(), drops: false }): number {
  const p = b.cells[m.from]!, q = b.cells[m.to]!;
  if (p.special === "prism" && q.special === "prism") return 1000;
  if (p.special === "prism" || q.special === "prism") return 500 + (p.special !== null && q.special !== null ? 200 : 0);
  if (p.special !== null && q.special !== null) return 400;
  swapCells(b, m.from, m.to);
  let v = 0;
  const seen = new Set<Pos>();
  const w = b.width;
  for (const pos of [m.to, m.from]) {
    if (seen.has(pos)) continue;
    const g = localMatch(b, pos);
    if (!g) continue;
    v += g.cells.length * 10 + (g.special ? SPECIAL_VALUE[g.special] : 0);
    const dropCols = new Set<number>();
    for (const c of g.cells) {
      seen.add(c);
      const piece = b.cells[c]!;
      if (piece.special !== null) v += 30;
      if (ctx.colors.has(piece.color)) v += 25;
      if (ctx.obstacles.has("ice") && b.ice && b.ice[c] > 0) v += 35;
      if (piece.lock === "chain" && ctx.obstacles.has("chain")) v += 35;
      for (const n of neighbors4(b, c)) {
        const nb = b.cells[n];
        if (!nb || seen.has(n)) continue;
        if ((nb.kind === "crate" && ctx.obstacles.has("crate")) || (nb.kind === "ivy" && ctx.obstacles.has("ivy")) || (nb.lock === "cage" && ctx.obstacles.has("cage"))) v += 35;
      }
      if (ctx.drops && !dropCols.has(c % w)) {
        for (let k = c - w; k >= 0; k -= w) if (b.cells[k]?.kind === "drop") { v += 20; dropCols.add(c % w); break; }
      }
    }
  }
  swapCells(b, m.from, m.to);
  return v;
}

/** Meilleur coup selon `moveValue` (égalité : premier dans l'ordre de `listValidMoves`). */
export function getHint(b: Board & { goals?: Goal[]; progress?: number[] }): Move | null {
  const ctx = goalContext(b);
  let best: Move | null = null;
  let bestV = -1;
  for (const m of listValidMoves(b)) {
    const v = moveValue(b, m, ctx);
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
  if (!hasValidMove(st)) forceShuffle(st, ev);
}

/** Mélange inconditionnel (booster Mélangeur, ou grille bloquée) : sans alignement, avec un coup jouable. */
export function forceShuffle(st: GameState, ev: GameEvent[]): void {
  // Seules les pièces libres sont mélangées : obstacles, objets et pièces verrouillées restent en place.
  const positions: Pos[] = [];
  for (let i = 0; i < st.cells.length; i++) {
    const p = st.cells[i];
    if (st.mask[i] && isPiece(p) && !p.lock) positions.push(i);
  }
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
