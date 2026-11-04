import { seedRng } from "./rng";
import type { Board, GameState, Goal, Piece, Pos, Special } from "./types";

export const MAX_SIZE = 9;

export const xOf = (b: Board, i: Pos) => i % b.width;
export const yOf = (b: Board, i: Pos) => Math.floor(i / b.width);
export const at = (b: Board, x: number, y: number): Pos => y * b.width + x;
export const inBounds = (b: Board, x: number, y: number) => x >= 0 && y >= 0 && x < b.width && y < b.height;
export const isActive = (b: Board, x: number, y: number) => inBounds(b, x, y) && b.mask[at(b, x, y)];

/** Couleur « alignable » d'une case : -1 si vide, inactive ou Prisme. */
export function colorAt(b: Board, i: Pos): number {
  const p = b.cells[i];
  return p !== null && p.special !== "prism" ? p.color : -1;
}

export function areAdjacent(b: Board, a: Pos, c: Pos): boolean {
  const dx = Math.abs(xOf(b, a) - xOf(b, c));
  const dy = Math.abs(yOf(b, a) - yOf(b, c));
  return dx + dy === 1;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    mask: s.mask.slice(),
    cells: s.cells.map((p) => (p === null ? null : { id: p.id, color: p.color, special: p.special })),
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]],
    goals: s.goals.map((g) => ({ ...g })),
    progress: s.progress.slice(),
  };
}

/** Empreinte FNV-1a 32 bits de l'état (tests de déterminisme, détection de désynchronisation). */
export function hashState(s: GameState): string {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ───────────── Notation ASCII (tests, conception des niveaux à la main) ─────────────
// Jetons séparés par des espaces :
//   a..f  pièce normale de couleur 0..5
//   suffixe  -  Fusée horizontale | | Fusée verticale | * Bombe | ^ Libellule
//   P  Prisme      _  case active vide      #  case inactive
const SUFFIX: Record<string, Special> = { "-": "rocketH", "|": "rocketV", "*": "bomb", "^": "dragonfly" };
const SUFFIX_OF: Partial<Record<Special, string>> = { rocketH: "-", rocketV: "|", bomb: "*", dragonfly: "^" };

export interface AsciiOptions {
  colors?: number;
  moves?: number;
  goals?: Goal[];
  seed?: string;
}

export function fromAscii(rows: string[], opts: AsciiOptions = {}): GameState {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width === 0 || width > MAX_SIZE || height > MAX_SIZE) throw new Error(`grille invalide ${width}x${height}`);
  const mask: boolean[] = [];
  const cells: (Piece | null)[] = [];
  let nextId = 1;
  let maxColor = 0;
  for (const row of grid) {
    if (row.length !== width) throw new Error("lignes de longueurs différentes");
    for (const tok of row) {
      if (tok === "#") {
        mask.push(false);
        cells.push(null);
      } else if (tok === "_") {
        mask.push(true);
        cells.push(null);
      } else if (tok === "P") {
        mask.push(true);
        cells.push({ id: nextId++, color: -1, special: "prism" });
      } else {
        const color = tok.charCodeAt(0) - 97;
        if (color < 0 || color > 5) throw new Error(`jeton inconnu « ${tok} »`);
        const special = tok.length > 1 ? SUFFIX[tok.slice(1)] : null;
        if (special === undefined) throw new Error(`suffixe inconnu « ${tok} »`);
        maxColor = Math.max(maxColor, color);
        mask.push(true);
        cells.push({ id: nextId++, color, special });
      }
    }
  }
  const goals = opts.goals ?? [{ type: "score", target: 1e9 }];
  return {
    version: 1,
    width,
    height,
    mask,
    cells,
    colors: opts.colors ?? Math.max(4, maxColor + 1),
    rng: seedRng(opts.seed ?? "ascii"),
    nextId,
    movesLeft: opts.moves ?? 30,
    moveCount: 0,
    score: 0,
    goals,
    progress: goals.map(() => 0),
    status: "playing",
  };
}

export function toAscii(b: Board): string[] {
  const rows: string[] = [];
  for (let y = 0; y < b.height; y++) {
    const toks: string[] = [];
    for (let x = 0; x < b.width; x++) {
      const i = at(b, x, y);
      const p = b.cells[i];
      if (!b.mask[i]) toks.push("#");
      else if (p === null) toks.push("_");
      else if (p.special === "prism") toks.push("P");
      else toks.push(String.fromCharCode(97 + p.color) + (p.special ? SUFFIX_OF[p.special] : ""));
    }
    rows.push(toks.join(" "));
  }
  return rows;
}
