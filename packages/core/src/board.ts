import { seedRng } from "./rng";
import type { Board, DropConfig, GameState, Goal, Piece, Pos, Special } from "./types";


export const MAX_SIZE = 9;

export const xOf = (b: Board, i: Pos) => i % b.width;
export const yOf = (b: Board, i: Pos) => Math.floor(i / b.width);
export const at = (b: Board, x: number, y: number): Pos => y * b.width + x;
export const inBounds = (b: Board, x: number, y: number) => x >= 0 && y >= 0 && x < b.width && y < b.height;
export const isActive = (b: Board, x: number, y: number) => inBounds(b, x, y) && b.mask[at(b, x, y)];

export const kindOf = (p: Piece) => p.kind ?? "piece";
export const isPiece = (p: Piece | null): p is Piece => p !== null && (p.kind === undefined || p.kind === "piece");
/** Pièce normale libre : ni spéciale, ni verrouillée, ni obstacle. */
export const isFreeNormal = (p: Piece | null) => isPiece(p) && p.special === null && !p.lock;
/** Peut tomber et être échangée : pièce non verrouillée, ou objet à faire descendre. */
export const isMovable = (p: Piece | null): p is Piece => p !== null && !p.lock && (p.kind === undefined || p.kind === "piece" || p.kind === "drop");
/** Bloque la gravité : caisse, lierre, pièce verrouillée. */
export const isFixed = (p: Piece | null) => p !== null && !isMovable(p);

/** Couleur « alignable » d'une case : -1 si vide, inactive, obstacle, Prisme ou pièce en cage. */
export function colorAt(b: Board, i: Pos): number {
  const p = b.cells[i];
  if (p === null || p.special === "prism" || p.lock === "cage") return -1;
  if (p.kind !== undefined && p.kind !== "piece") return -1;
  return p.color;
}

export const iceAt = (b: Board, i: Pos) => (b.ice ? b.ice[i] : 0);

export function areAdjacent(b: Board, a: Pos, c: Pos): boolean {
  const dx = Math.abs(xOf(b, a) - xOf(b, c));
  const dy = Math.abs(yOf(b, a) - yOf(b, c));
  return dx + dy === 1;
}

export function neighbors4(b: Board, i: Pos): Pos[] {
  const x = xOf(b, i), y = yOf(b, i), out: Pos[] = [];
  if (y > 0 && b.mask[i - b.width]) out.push(i - b.width);
  if (x > 0 && b.mask[i - 1]) out.push(i - 1);
  if (x < b.width - 1 && b.mask[i + 1]) out.push(i + 1);
  if (y < b.height - 1 && b.mask[i + b.width]) out.push(i + b.width);
  return out;
}

const clonePiece = (p: Piece): Piece => {
  const q: Piece = { id: p.id, color: p.color, special: p.special };
  if (p.kind !== undefined) q.kind = p.kind;
  if (p.hp !== undefined) q.hp = p.hp;
  if (p.lock) q.lock = p.lock;
  if (p.key) q.key = true;
  if (p.product) { q.product = p.product; q.every = p.every; }
  return q;
};

export function cloneState(s: GameState): GameState {
  const out: GameState = {
    ...s,
    mask: s.mask.slice(),
    cells: s.cells.map((p) => (p === null ? null : clonePiece(p))),
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]],
    goals: s.goals.map((g) => ({ ...g })),
    progress: s.progress.slice(),
  };
  if (s.ice) out.ice = s.ice.slice();
  if (s.drops) out.drops = { ...s.drops };
  return out;
}

/** Empreinte FNV-1a 32 bits de l'état (tests de déterminisme, détection de désynchronisation). */
export function hashState(s: GameState): string {
  return hashString(JSON.stringify(s));
}

export function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ───────────── Notation des cases (tests, niveaux faits main, générateur) ─────────────
// Un jeton par case, séparés par des espaces : [préfixes]* base
//   préfixes : i1 | i2 | i3  Gel (couches)    k  Chaîne    g  Cage    y  pièce porteuse d'une clé
//   base     : .  pièce au hasard     a..f  couleur 0..5, suivie éventuellement d'un suffixe de spéciale
//              -  Fusée horizontale  |  Fusée verticale  *  Bombe  ^  Libellule
//              P  Prisme   _  case vide   #  case inactive
//              X1..X3  Caisse (PV)   V  Lierre   D  objet à faire descendre
//              B  Bulle   G  Générateur de bulles   H  Générateur de caisses   C | C2  Coffre (1 ou 2 serrures)
// Exemples : "i2."  gel 2 sous une pièce au hasard ; "kb" pièce b enchaînée ; "i1X2" caisse 2 PV sur gel.
const SUFFIX: Record<string, Special> = { "-": "rocketH", "|": "rocketV", "*": "bomb", "^": "dragonfly" };
const SUFFIX_OF: Partial<Record<Special, string>> = { rocketH: "-", rocketV: "|", bomb: "*", dragonfly: "^" };

export interface CellToken {
  active: boolean;
  ice: number;
  /** null = case vide ; "random" = pièce normale à tirer. */
  content: Omit<Piece, "id"> | "random" | null;
}

export function parseToken(tok: string): CellToken {
  let ice = 0;
  let lock: Piece["lock"] = null;
  let key = false;
  let rest = tok;
  for (;;) {
    const m = /^i([1-3])/.exec(rest);
    if (m) { ice = Number(m[1]); rest = rest.slice(2); continue; }
    if (rest.startsWith("k") && rest.length > 1) { lock = "chain"; rest = rest.slice(1); continue; }
    if (rest.startsWith("g") && rest.length > 1) { lock = "cage"; rest = rest.slice(1); continue; }
    if (rest.startsWith("y") && rest.length > 1) { key = true; rest = rest.slice(1); continue; }
    break;
  }
  const withLock = (c: Omit<Piece, "id">): Omit<Piece, "id"> => {
    let out = lock ? { ...c, lock } : c;
    if (key) out = { ...out, key: true };
    return out;
  };
  if (rest === "#") {
    if (ice || lock) throw new Error(`jeton invalide « ${tok} »`);
    return { active: false, ice: 0, content: null };
  }
  if (rest === "_") return { active: true, ice, content: null };
  if (rest === ".") return { active: true, ice, content: lock || key ? withLock({ color: -2, special: null }) : "random" };
  if (rest === "B") return { active: true, ice, content: { color: -1, special: null, kind: "bubble", hp: 1 } };
  if (rest === "G") return { active: true, ice, content: { color: -1, special: null, kind: "generator", product: "bubble", every: 3 } };
  if (rest === "H") return { active: true, ice, content: { color: -1, special: null, kind: "generator", product: "crate", every: 4 } };
  const chest = /^C([12]?)$/.exec(rest);
  if (chest) return { active: true, ice, content: { color: -1, special: null, kind: "chest", hp: chest[1] ? Number(chest[1]) : 1 } };
  if (rest === "P") return { active: true, ice, content: withLock({ color: -1, special: "prism" }) };
  if (rest === "V") return { active: true, ice, content: { color: -1, special: null, kind: "ivy", hp: 1 } };
  if (rest === "D") return { active: true, ice, content: { color: -1, special: null, kind: "drop" } };
  const crate = /^X([1-3])$/.exec(rest);
  if (crate) return { active: true, ice, content: { color: -1, special: null, kind: "crate", hp: Number(crate[1]) } };
  const color = rest.charCodeAt(0) - 97;
  if (color < 0 || color > 5) throw new Error(`jeton inconnu « ${tok} »`);
  const special = rest.length > 1 ? SUFFIX[rest.slice(1)] : null;
  if (special === undefined) throw new Error(`suffixe inconnu « ${tok} »`);
  return { active: true, ice, content: withLock({ color, special }) };
}

export function tokenOf(b: Board, i: Pos): string {
  if (!b.mask[i]) return "#";
  const p = b.cells[i];
  const ice = iceAt(b, i) > 0 ? `i${iceAt(b, i)}` : "";
  if (p === null) return `${ice}_`;
  const lock = (p.lock === "chain" ? "k" : p.lock === "cage" ? "g" : "") + (p.key ? "y" : "");
  const k = kindOf(p);
  if (k === "crate") return `${ice}X${p.hp ?? 1}`;
  if (k === "ivy") return `${ice}V`;
  if (k === "drop") return `${ice}D`;
  if (k === "bubble") return `${ice}B`;
  if (k === "generator") return `${ice}${p.product === "crate" ? "H" : "G"}`;
  if (k === "chest") return `${ice}C${(p.hp ?? 1) > 1 ? p.hp : ""}`;
  if (p.special === "prism") return `${ice}${lock}P`;
  return `${ice}${lock}${String.fromCharCode(97 + p.color)}${p.special ? SUFFIX_OF[p.special] : ""}`;
}

export interface AsciiOptions {
  colors?: number;
  moves?: number;
  goals?: Goal[];
  seed?: string;
  drops?: Omit<DropConfig, "spawned">;
  portals?: [Pos, Pos][];
  conveyors?: Pos[][];
}

/** Grille entièrement spécifiée (tests). Les jetons « . » reçoivent la couleur 0 : à éviter ici. */
export function fromAscii(rows: string[], opts: AsciiOptions = {}): GameState {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width === 0 || width > MAX_SIZE || height > MAX_SIZE) throw new Error(`grille invalide ${width}x${height}`);
  const mask: boolean[] = [];
  const cells: (Piece | null)[] = [];
  const ice: number[] = [];
  let nextId = 1;
  let maxColor = 0;
  let drops = 0;
  for (const row of grid) {
    if (row.length !== width) throw new Error("lignes de longueurs différentes");
    for (const tok of row) {
      const c = parseToken(tok);
      mask.push(c.active);
      ice.push(c.ice);
      if (c.content === null) cells.push(null);
      else {
        const content = c.content === "random" ? { color: 0, special: null } : c.content;
        if (content.color === -2) content.color = 0;
        if (content.color >= 0) maxColor = Math.max(maxColor, content.color);
        if (content.kind === "drop") drops++;
        cells.push({ id: nextId++, ...content });
      }
    }
  }
  const goals = opts.goals ?? [{ type: "score", target: 1e9 }];
  const st: GameState = {
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
  if (ice.some((v) => v > 0)) st.ice = ice;
  if (opts.drops) st.drops = { ...opts.drops, spawned: drops };
  if (opts.portals) st.portals = opts.portals;
  if (opts.conveyors) st.conveyors = opts.conveyors;
  return st;
}

export function toAscii(b: Board): string[] {
  const rows: string[] = [];
  for (let y = 0; y < b.height; y++) {
    const toks: string[] = [];
    for (let x = 0; x < b.width; x++) toks.push(tokenOf(b, at(b, x, y)));
    rows.push(toks.join(" "));
  }
  return rows;
}
