import { at, colorAt } from "./board";
import { areaCells, crossCells } from "./effects";
import { findMatches, type MatchGroup } from "./match";
import { nextInt, pick } from "./rng";
import type { AreaSpecial, GameEvent, GameState, Piece, Pos, Special } from "./types";

export const SCORE_PER_PIECE = 10;
export const SPECIAL_BONUS: Record<Special, number> = { rocketH: 50, rocketV: 50, dragonfly: 50, bomb: 100, prism: 200 };

interface Activation {
  at: Pos;
  piece: Piece;
  /** Effet transporté par une Libellule (combo Libellule + Fusée/Bombe). */
  carry: AreaSpecial | null;
}

/**
 * Une phase de résolution : toutes les destructions déclenchées par un coup ou par une étape
 * de cascade. Les cases touchées sont marquées « condamnées » ; les spéciales touchées sont
 * mises en file (FIFO) et s'activent à leur tour. Les pièces ne disparaissent qu'à `finish()`,
 * ce qui rend l'ordre des effets indépendant de l'ordre des suppressions.
 */
export class Phase {
  readonly doomed = new Set<Pos>();
  private readonly queue: Activation[] = [];
  private readonly creates: { at: Pos; piece: Piece }[] = [];

  constructor(readonly st: GameState, readonly ev: GameEvent[], readonly cascade: number) {}

  /** Touche une case. Une spéciale touchée s'activera (sauf `trigger = false`). */
  hit(i: Pos, trigger = true): void {
    if (!this.st.mask[i] || this.doomed.has(i)) return;
    const p = this.st.cells[i];
    if (p === null) return;
    this.doomed.add(i);
    if (trigger && p.special !== null) this.queue.push({ at: i, piece: p, carry: null });
  }

  hitAll(cells: Pos[]): void {
    for (const c of cells) this.hit(c);
  }

  /** Condamne une case et met sa pièce en file d'activation avec un effet éventuel. */
  enqueue(i: Pos, piece: Piece, carry: AreaSpecial | null = null): void {
    this.doomed.add(i);
    this.queue.push({ at: i, piece, carry });
  }

  /** Réserve la création d'une spéciale, posée après la suppression des pièces. */
  create(i: Pos, special: Special, color: number): void {
    this.creates.push({ at: i, piece: { id: this.st.nextId++, color: special === "prism" ? -1 : color, special } });
  }

  /** Traite les groupes d'alignement : destruction + création des spéciales. */
  applyMatches(groups: MatchGroup[], prefer: Pos[] = []): void {
    for (const g of groups) {
      this.ev.push({ type: "match", cells: g.cells, color: g.color, shape: g.shape });
      if (g.special !== null) {
        const spawn = this.spawnCell(g, prefer);
        if (spawn !== null) this.create(spawn, g.special, g.color);
      }
      this.hitAll(g.cells);
    }
  }

  /** Case de création : la case jouée si elle est dans le groupe, sinon la plus basse puis la plus à gauche. */
  private spawnCell(g: MatchGroup, prefer: Pos[]): Pos | null {
    const normal = g.cells.filter((c) => this.st.cells[c]?.special === null && !this.doomed.has(c));
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
        // Prisme déclenché par une explosion : efface la couleur la plus présente.
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
    if (carry === null) this.hit(target);
    else {
      this.hit(target);
      this.hitAll(areaCells(this.st, carry, target));
    }
  }

  /**
   * Cible : pièce non condamnée dont la couleur sert un objectif de collecte inachevé,
   * sinon toute pièce non condamnée. Départage par le PRNG de la partie.
   * (Les obstacles, prioritaires, s'ajouteront au livrable 4.)
   */
  pickTarget(): Pos | null {
    const st = this.st;
    const wanted = new Set<number>();
    st.goals.forEach((g, k) => {
      if (g.type === "collect" && st.progress[k] < g.count) wanted.add(g.color);
    });
    const free: Pos[] = [];
    const prio: Pos[] = [];
    for (let i = 0; i < st.cells.length; i++) {
      const p = st.cells[i];
      if (p === null || this.doomed.has(i)) continue;
      free.push(i);
      if (wanted.has(p.color)) prio.push(i);
    }
    const pool = prio.length > 0 ? prio : free;
    return pool.length > 0 ? pick(st.rng, pool) : null;
  }

  cellsOfColor(color: number): Pos[] {
    const out: Pos[] = [];
    for (let i = 0; i < this.st.cells.length; i++) if (!this.doomed.has(i) && colorAt(this.st, i) === color) out.push(i);
    return out;
  }

  /** Couleur la plus fréquente parmi les pièces non condamnées (égalité : plus petit index). */
  dominantColor(): number {
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < this.st.cells.length; i++) {
      const c = colorAt(this.st, i);
      if (c >= 0 && !this.doomed.has(i)) counts[c]++;
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
      if (p.special === null) {
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
    for (const i of removed) {
      const p = st.cells[i]!;
      if (p.color >= 0) collected[p.color]++;
      st.cells[i] = null;
    }
    let delta = removed.length * SCORE_PER_PIECE * this.cascade;
    if (removed.length > 0) this.ev.push({ type: "cleared", cells: removed, cascade: this.cascade });
    for (const c of this.creates) {
      st.cells[c.at] = c.piece;
      delta += SPECIAL_BONUS[c.piece.special!] * this.cascade;
      this.ev.push({ type: "specialCreated", at: c.at, special: c.piece.special!, color: c.piece.color, id: c.piece.id });
    }
    st.score += delta;
    st.goals.forEach((g, k) => {
      st.progress[k] = g.type === "score" ? st.score : st.progress[k] + collected[g.color];
    });
    if (delta > 0) this.ev.push({ type: "score", delta, total: st.score });
  }
}

/**
 * Gravité par segment de colonne : une case inactive coupe la colonne en segments indépendants,
 * chacun alimenté par sa case la plus haute.
 */
export function applyGravity(st: GameState, ev: GameEvent[]): void {
  const moves: [Pos, Pos][] = [];
  for (let x = 0; x < st.width; x++) {
    let y = st.height - 1;
    while (y >= 0) {
      if (!st.mask[at(st, x, y)]) { y--; continue; }
      let write = y;
      while (y >= 0 && st.mask[at(st, x, y)]) {
        const i = at(st, x, y);
        const p = st.cells[i];
        if (p !== null) {
          if (y !== write) {
            const j = at(st, x, write);
            st.cells[j] = p;
            st.cells[i] = null;
            moves.push([i, j]);
          }
          write--;
        }
        y--;
      }
    }
  }
  if (moves.length > 0) ev.push({ type: "gravity", moves });
}

/** Remplit les cases vides avec des pièces normales tirées au PRNG (colonnes de gauche à droite, haut en bas). */
export function refill(st: GameState, ev: GameEvent[]): void {
  const pieces: { at: Pos; id: number; color: number }[] = [];
  for (let x = 0; x < st.width; x++) {
    for (let y = 0; y < st.height; y++) {
      const i = at(st, x, y);
      if (st.mask[i] && st.cells[i] === null) {
        const piece = { id: st.nextId++, color: nextInt(st.rng, st.colors), special: null };
        st.cells[i] = piece;
        pieces.push({ at: i, id: piece.id, color: piece.color });
      }
    }
  }
  if (pieces.length > 0) ev.push({ type: "spawned", pieces });
}

export const MAX_CASCADES = 200;

/** Gravité → remplissage → alignements, jusqu'à stabilité. Renvoie le dernier indice de cascade. */
export function cascadeLoop(st: GameState, ev: GameEvent[], cascade: number): number {
  for (let guard = 0; guard < MAX_CASCADES; guard++) {
    applyGravity(st, ev);
    refill(st, ev);
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
