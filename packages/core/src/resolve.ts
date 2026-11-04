import { colorAt, iceAt, isFixed, isMovable, isPiece, kindOf, neighbors4 } from "./board";
import { areaCells, crossCells } from "./effects";
import { findMatches, type MatchGroup } from "./match";
import { nextInt, pick } from "./rng";
import type { AreaSpecial, GameEvent, GameState, ObstacleKind, Piece, Pos, Special } from "./types";

export const SCORE_PER_PIECE = 10;
export const SCORE_PER_OBSTACLE = 20;
export const SPECIAL_BONUS: Record<Special, number> = { rocketH: 50, rocketV: 50, dragonfly: 50, bomb: 100, prism: 200 };

interface Activation {
  at: Pos;
  piece: Piece;
  /** Effet transporté par une Libellule (combo Libellule + Fusée/Bombe). */
  carry: AreaSpecial | null;
}

/**
 * Une phase de résolution : toutes les destructions déclenchées par un coup ou par une étape
 * de cascade. Chaque case n'est touchée qu'une fois par phase. Une pièce touchée est « condamnée »
 * (supprimée à `finish()`) ; une spéciale touchée est mise en file (FIFO) et s'active à son tour ;
 * un obstacle touché perd une couche ou un PV ; une pièce verrouillée perd son verrou et reste.
 */
export class Phase {
  readonly doomed = new Set<Pos>();
  private readonly touched = new Set<Pos>();
  private readonly queue: Activation[] = [];
  private readonly creates: { at: Pos; piece: Piece }[] = [];
  private readonly destroyed: Record<ObstacleKind, number> = { ice: 0, crate: 0, ivy: 0, chain: 0, cage: 0, bubble: 0, chest: 0 };

  constructor(readonly st: GameState, readonly ev: GameEvent[], readonly cascade: number) {}

  /** Touche une case. Une spéciale touchée s'activera (sauf `trigger = false`). */
  hit(i: Pos, trigger = true): void {
    const st = this.st;
    if (!st.mask[i] || this.touched.has(i)) return;
    this.touched.add(i);
    if (st.ice && st.ice[i] > 0) {
      st.ice[i]--;
      this.ev.push({ type: "damaged", at: i, obstacle: "ice", left: st.ice[i] });
      if (st.ice[i] === 0) this.destroyed.ice++;
    }
    const p = st.cells[i];
    if (p === null) return;
    const k = kindOf(p);
    if (k === "drop" || k === "generator" || k === "chest") return; // indestructibles (le coffre s'ouvre avec une clé)
    if (k === "crate" || k === "ivy" || k === "bubble") {
      p.hp = (p.hp ?? 1) - 1;
      this.ev.push({ type: "damaged", at: i, obstacle: k, left: Math.max(0, p.hp) });
      if (p.hp <= 0) {
        this.doomed.add(i);
        this.destroyed[k]++;
      }
      return;
    }
    if (p.lock) {
      this.ev.push({ type: "damaged", at: i, obstacle: p.lock, left: 0 });
      this.destroyed[p.lock]++;
      p.lock = null;
      return;
    }
    this.doomed.add(i);
    if (trigger && p.special !== null) this.queue.push({ at: i, piece: p, carry: null });
  }

  hitAll(cells: Pos[]): void {
    for (const c of cells) this.hit(c);
  }

  /** Dégât de voisinage d'un alignement : uniquement caisses, lierre et cages. */
  private hitAdjacent(cells: Pos[]): void {
    const inGroup = new Set(cells);
    for (const c of cells)
      for (const n of neighbors4(this.st, c)) {
        if (inGroup.has(n)) continue;
        const p = this.st.cells[n];
        if (p !== null && (p.kind === "crate" || p.kind === "ivy" || p.kind === "bubble" || p.lock === "cage")) this.hit(n);
      }
  }

  /** Condamne une case et met sa pièce en file d'activation avec un effet éventuel. */
  enqueue(i: Pos, piece: Piece, carry: AreaSpecial | null = null): void {
    this.touched.add(i);
    this.doomed.add(i);
    this.queue.push({ at: i, piece, carry });
  }

  /** Réserve la création d'une spéciale, posée après la suppression des pièces. */
  create(i: Pos, special: Special, color: number): void {
    this.creates.push({ at: i, piece: { id: this.st.nextId++, color: special === "prism" ? -1 : color, special } });
  }

  /** Traite les groupes d'alignement : destruction, dégâts de voisinage, création des spéciales. */
  applyMatches(groups: MatchGroup[], prefer: Pos[] = []): void {
    for (const g of groups) {
      this.ev.push({ type: "match", cells: g.cells, color: g.color, shape: g.shape });
      if (g.special !== null) {
        const spawn = this.spawnCell(g, prefer);
        if (spawn !== null) this.create(spawn, g.special, g.color);
      }
      this.hitAll(g.cells);
      this.hitAdjacent(g.cells);
    }
  }

  /** Case de création : la case jouée si elle est dans le groupe, sinon la plus basse puis la plus à gauche. */
  private spawnCell(g: MatchGroup, prefer: Pos[]): Pos | null {
    const normal = g.cells.filter((c) => {
      const p = this.st.cells[c];
      return p !== null && p.special === null && !p.lock && !this.touched.has(c);
    });
    if (normal.length === 0) return null;
    for (const p of prefer) if (normal.includes(p)) return p;
    const w = this.st.width;
    return normal.reduce((best, c) => {
      const by = Math.floor(best / w), cy = Math.floor(c / w);
      return cy > by || (cy === by && c % w < best % w) ? c : best;
    });
  }

  run(): void {
    while (this.queue.length > 0) this.activate(this.queue.shift()!);
  }

  private activate(a: Activation): void {
    const st = this.st;
    const sp = a.piece.special!;
    let cells: Pos[];
    switch (sp) {
      case "rocketH":
      case "rocketV":
      case "bomb":
        cells = areaCells(st, sp, a.at);
        this.ev.push({ type: "activated", at: a.at, special: sp, cells });
        this.hitAll(cells);
        return;
      case "dragonfly":
        cells = crossCells(st, a.at);
        this.ev.push({ type: "activated", at: a.at, special: sp, cells });
        this.hitAll(cells);
        this.flight(a.at, a.carry);
        return;
      case "prism": {
        const color = this.dominantColor();
        cells = color < 0 ? [] : this.cellsOfColor(color);
        this.ev.push({ type: "activated", at: a.at, special: sp, cells });
        this.hitAll(cells);
        return;
      }
    }
  }

  /** Envol d'une Libellule vers une cible ; applique l'effet transporté à l'arrivée. */
  flight(from: Pos, carry: AreaSpecial | null): void {
    const target = this.pickTarget();
    if (target === null) return;
    this.ev.push({ type: "dragonflyFlight", from, to: target, carry });
    this.hit(target);
    if (carry !== null) this.hitAll(areaCells(this.st, carry, target));
  }

  /**
   * Cible d'une Libellule. Priorité : obstacle d'un objectif inachevé (gel, caisse, lierre, chaîne, cage),
   * puis pièce de la couleur d'un objectif de collecte, puis toute case touchable. Départage au PRNG.
   */
  pickTarget(): Pos | null {
    const st = this.st;
    const wantColor = new Set<number>();
    const wantObstacle = new Set<ObstacleKind>();
    st.goals.forEach((g, k) => {
      if (st.progress[k] >= (g.type === "score" ? g.target : g.count)) return;
      if (g.type === "collect") wantColor.add(g.color);
      if (g.type === "clear") wantObstacle.add(g.target);
    });
    const wantKeys = wantObstacle.has("chest");
    const obstacle: Pos[] = [], colored: Pos[] = [], any: Pos[] = [];
    for (let i = 0; i < st.cells.length; i++) {
      if (!st.mask[i] || this.touched.has(i)) continue;
      const p = st.cells[i];
      const ice = iceAt(st, i) > 0;
      if (p === null && !ice) continue;
      if (p !== null && (p.kind === "drop" || p.kind === "generator" || p.kind === "chest") && !ice) continue;
      any.push(i);
      const k = p ? kindOf(p) : null;
      if ((ice && wantObstacle.has("ice")) || ((k === "crate" || k === "ivy" || k === "bubble") && wantObstacle.has(k)) || (p?.lock && wantObstacle.has(p.lock)) || (wantKeys && p?.key)) obstacle.push(i);
      else if (p && isPiece(p) && wantColor.has(p.color)) colored.push(i);
    }
    const pool = obstacle.length > 0 ? obstacle : colored.length > 0 ? colored : any;
    return pool.length > 0 ? pick(st.rng, pool) : null;
  }

  cellsOfColor(color: number): Pos[] {
    const out: Pos[] = [];
    for (let i = 0; i < this.st.cells.length; i++) if (!this.touched.has(i) && colorAt(this.st, i) === color) out.push(i);
    return out;
  }

  /** Couleur la plus fréquente parmi les pièces non touchées (égalité : plus petit index). */
  dominantColor(): number {
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < this.st.cells.length; i++) {
      const c = colorAt(this.st, i);
      if (c >= 0 && !this.touched.has(i)) counts[c]++;
    }
    let best = -1;
    for (let c = 0; c < counts.length; c++) if (counts[c] > 0 && (best < 0 || counts[c] > counts[best])) best = c;
    return best;
  }

  /** Transforme toutes les pièces normales d'une couleur en spéciales, puis les met en file. */
  transformColor(color: number, special: "rocket" | "bomb" | "dragonfly"): void {
    const cells = this.cellsOfColor(color);
    const changed: Pos[] = [];
    for (const c of cells) {
      const p = this.st.cells[c]!;
      if (p.special === null && !p.lock) {
        p.special = special === "rocket" ? (nextInt(this.st.rng, 2) === 0 ? "rocketH" : "rocketV") : special;
        changed.push(c);
      }
    }
    this.ev.push({ type: "transformed", cells: changed, specials: changed.map((c) => this.st.cells[c]!.special!) });
    this.hitAll(cells);
  }

  /** Supprime les pièces condamnées, comptabilise score et objectifs, pose les spéciales créées. */
  finish(): void {
    const st = this.st;
    const removed = [...this.doomed].sort((p, q) => p - q);
    const collected = new Array<number>(6).fill(0);
    let pieces = 0;
    for (const i of removed) {
      const p = st.cells[i]!;
      if (isPiece(p)) {
        pieces++;
        if (p.color >= 0) collected[p.color]++;
        if (p.key) {
          st.keys = (st.keys ?? 0) + 1;
          this.ev.push({ type: "keyCollected", at: i, held: st.keys });
        }
      }
      st.cells[i] = null;
    }
    const d = this.destroyed;
    const obstacles = d.ice + d.crate + d.ivy + d.chain + d.cage + d.bubble;
    let delta = (pieces * SCORE_PER_PIECE + obstacles * SCORE_PER_OBSTACLE) * this.cascade;
    if (removed.length > 0) this.ev.push({ type: "cleared", cells: removed, cascade: this.cascade });
    for (const c of this.creates) {
      st.cells[c.at] = c.piece;
      delta += SPECIAL_BONUS[c.piece.special!] * this.cascade;
      this.ev.push({ type: "specialCreated", at: c.at, special: c.piece.special!, color: c.piece.color, id: c.piece.id });
    }
    st.score += delta;
    st.goals.forEach((g, k) => {
      if (g.type === "score") st.progress[k] = st.score;
      else if (g.type === "collect") st.progress[k] += collected[g.color];
      else if (g.type === "clear") st.progress[k] += this.destroyed[g.target];
    });
    if (delta > 0) this.ev.push({ type: "score", delta, total: st.score });
  }
}

/** Case d'apparition : active, dont la case au-dessus est hors grille ou inactive, et qui n'est pas une sortie de portail. */
export function isSpawner(st: GameState, i: Pos): boolean {
  if (!st.mask[i] || !(i < st.width || !st.mask[i - st.width])) return false;
  if (st.portals) for (const [, out] of st.portals) if (out === i) return false;
  return true;
}

/** Case de sortie des objets à faire descendre : active, sous laquelle il n'y a rien (ni case ni portail). */
export function isExit(st: GameState, i: Pos): boolean {
  if (!st.mask[i] || !(i + st.width >= st.cells.length || !st.mask[i + st.width])) return false;
  if (st.portals) for (const [inp] of st.portals) if (inp === i) return false;
  return true;
}

/** Clés encore nécessaires : serrures restantes − clés en main − clés déjà sur la grille. */
function keysNeeded(st: GameState): number {
  let locks = 0, onBoard = 0;
  for (const p of st.cells) {
    if (p?.kind === "chest") locks += p.hp ?? 1;
    else if (p?.key) onBoard++;
  }
  return locks - (st.keys ?? 0) - onBoard;
}

function newPiece(st: GameState): Piece {
  if (st.keys !== undefined && keysNeeded(st) > 0 && nextInt(st.rng, 6) === 0) {
    return { id: st.nextId++, color: nextInt(st.rng, st.colors), special: null, key: true };
  }
  const d = st.drops;
  if (d && d.spawned < d.total) {
    let onBoard = 0;
    for (const p of st.cells) if (p?.kind === "drop") onBoard++;
    if (onBoard < d.maxOnBoard && nextInt(st.rng, 4) === 0) {
      d.spawned++;
      return { id: st.nextId++, color: -1, special: null, kind: "drop" };
    }
  }
  return { id: st.nextId++, color: nextInt(st.rng, st.colors), special: null };
}

/**
 * Gravité, apparition et glissement en diagonale, jusqu'à stabilité.
 *  1. chute verticale d'une case (pièces mobiles) ;
 *  2. sinon, apparition dans les cases d'apparition vides ;
 *  3. sinon, une case vide bloquée par au-dessus (caisse, lierre, pièce verrouillée) prend
 *     la pièce mobile en haut à gauche, puis en haut à droite.
 * Une poche fermée par des obstacles reste vide jusqu'à leur destruction.
 * Émet un événement `gravity` (origine → arrivée de chaque pièce déplacée) puis `spawned`.
 */
export function settle(st: GameState, ev: GameEvent[]): void {
  const w = st.width, n = st.cells.length;
  const origin = new Map<number, Pos>(); // id → position d'origine
  const spawnedIds = new Set<number>();
  const move = (from: Pos, to: Pos) => {
    const p = st.cells[from]!;
    if (!origin.has(p.id) && !spawnedIds.has(p.id)) origin.set(p.id, from);
    st.cells[to] = p;
    st.cells[from] = null;
  };
  const h = st.height;
  for (let guard = 0; guard < 10000; guard++) {
    let changed = false;
    // 1. Chute verticale : chaque segment de colonne est tassé en une passe.
    for (let x = 0; x < w; x++) {
      let write = -1; // plus basse case vide du segment courant, -1 si aucune
      for (let y = h - 1; y >= 0; y--) {
        const i = y * w + x;
        const p = st.cells[i];
        if (!st.mask[i] || (p !== null && !isMovable(p))) { write = -1; continue; }
        if (p === null) { if (write < 0) write = y; continue; }
        if (write >= 0) {
          move(i, write * w + x);
          write--;
          changed = true;
        }
      }
    }
    // Portails : une pièce mobile sur l'entrée tombe dans la sortie vide.
    if (st.portals)
      for (const [inp, out] of st.portals)
        if (st.cells[out] === null && isMovable(st.cells[inp])) {
          move(inp, out);
          changed = true;
        }
    // 2. Apparition : remplit d'un coup la suite de cases vides sous chaque case d'apparition.
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        if (st.cells[i] !== null || !isSpawner(st, i)) continue;
        let bottom = y;
        while (bottom + 1 < h && st.mask[(bottom + 1) * w + x] && st.cells[(bottom + 1) * w + x] === null) bottom++;
        for (let k = bottom; k >= y; k--) {
          const p = newPiece(st);
          st.cells[k * w + x] = p;
          spawnedIds.add(p.id);
        }
        changed = true;
      }
    if (changed) continue;
    // 3. Glissement en diagonale sous un obstacle fixe.
    for (let i = n - 1; i >= w && !changed; i--) {
      if (st.cells[i] !== null || !st.mask[i] || isSpawner(st, i)) continue;
      const above = st.cells[i - w];
      if (above === null || !isFixed(above)) continue;
      const x = i % w;
      for (const dx of [-1, 1]) {
        if (x + dx < 0 || x + dx >= w) continue;
        const src = i - w + dx;
        if (isMovable(st.cells[src])) {
          move(src, i);
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  const moves: [Pos, Pos][] = [];
  const pieces: { at: Pos; id: number; color: number; kind?: Piece["kind"] }[] = [];
  for (let i = 0; i < n; i++) {
    const p = st.cells[i];
    if (!p) continue;
    if (spawnedIds.has(p.id)) pieces.push(p.kind ? { at: i, id: p.id, color: p.color, kind: p.kind } : { at: i, id: p.id, color: p.color });
    else if (origin.has(p.id) && origin.get(p.id) !== i) moves.push([origin.get(p.id)!, i]);
  }
  if (moves.length > 0) ev.push({ type: "gravity", moves });
  if (pieces.length > 0) ev.push({ type: "spawned", pieces });
}

/** Retire les objets arrivés sur une case de sortie. Renvoie le nombre d'objets collectés. */
export function collectDrops(st: GameState, ev: GameEvent[]): number {
  let n = 0;
  for (let i = 0; i < st.cells.length; i++) {
    const p = st.cells[i];
    if (p?.kind === "drop" && isExit(st, i)) {
      ev.push({ type: "dropCollected", at: i, id: p.id });
      st.cells[i] = null;
      n++;
    }
  }
  if (n > 0) st.goals.forEach((g, k) => { if (g.type === "drop") st.progress[k] += n; });
  return n;
}

export const MAX_CASCADES = 200;

/** Gravité → sortie des objets → alignements, jusqu'à stabilité. Renvoie le dernier indice de cascade. */
/** Ouvre des coffres avec les clés en main (coffre de plus petit index d'abord). */
export function openChests(st: GameState, ev: GameEvent[]): boolean {
  let opened = false;
  while ((st.keys ?? 0) > 0) {
    const i = st.cells.findIndex((p) => p?.kind === "chest");
    if (i < 0) break;
    const chest = st.cells[i]!;
    st.keys!--;
    chest.hp = (chest.hp ?? 1) - 1;
    ev.push({ type: "chestOpened", at: i, locksLeft: Math.max(0, chest.hp) });
    if (chest.hp <= 0) {
      st.cells[i] = null;
      st.goals.forEach((g, k) => { if (g.type === "clear" && g.target === "chest") st.progress[k]++; });
      opened = true;
    }
  }
  return opened;
}

export function cascadeLoop(st: GameState, ev: GameEvent[], cascade: number): number {
  for (let guard = 0; guard < MAX_CASCADES; guard++) {
    settle(st, ev);
    if (collectDrops(st, ev) > 0) continue;
    if (openChests(st, ev)) continue;
    const groups = findMatches(st);
    if (groups.length === 0) return cascade;
    cascade++;
    ev.push({ type: "cascade", index: cascade });
    const phase = new Phase(st, ev, cascade);
    phase.applyMatches(groups);
    phase.run();
    phase.finish();
  }
  throw new Error("cascade non terminée (garde-fou)");
}
