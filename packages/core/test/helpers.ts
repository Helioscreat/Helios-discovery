import { fromAscii, type AsciiOptions, type GameEvent, type GameState, type Pos } from "../src";

/**
 * Grille w×h remplie d'un damier c/d (aucun alignement, aucun carré possible),
 * puis jetons placés aux coordonnées données : { "x,y": "a-" }.
 */
export function grid(w: number, h: number, place: Record<string, string>, opts: AsciiOptions = {}): GameState {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const toks: string[] = [];
    for (let x = 0; x < w; x++) toks.push(place[`${x},${y}`] ?? ((x + y) % 2 === 0 ? "c" : "d"));
    rows.push(toks.join(" "));
  }
  return fromAscii(rows, { colors: 6, ...opts });
}

export const P = (st: GameState, x: number, y: number): Pos => y * st.width + x;

/** Cases effacées pendant la première phase (avant la première gravité ou le premier remplissage). */
export function firstCleared(ev: GameEvent[]): Pos[] {
  const out: Pos[] = [];
  for (const e of ev) {
    if (e.type === "gravity" || e.type === "spawned") break;
    if (e.type === "cleared") out.push(...e.cells);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

export const sorted = (xs: Pos[]) => [...new Set(xs)].sort((a, b) => a - b);

export function eventsOf<T extends GameEvent["type"]>(ev: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return ev.filter((e) => e.type === type) as Extract<GameEvent, { type: T }>[];
}

export function assertStable(st: GameState): void {
  for (let i = 0; i < st.cells.length; i++) {
    if (!st.mask[i] && st.cells[i] !== null) throw new Error(`pièce sur case inactive ${i}`);
    if (st.mask[i] && st.cells[i] === null) throw new Error(`case active vide ${i}`);
  }
}
