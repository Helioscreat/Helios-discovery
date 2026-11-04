import Phaser from "phaser";
import {
  areAdjacent, getHint, needsTarget, type GameEvent, type GameState, type Piece, type Pos, type Special,
} from "@helios/core";
import { FlashLimiter } from "../a11y/flash";
import type { Feedback } from "../feedback";
import type { GameSession } from "../game/session";
import { t } from "../i18n";
import type { SettingsStore } from "../settings";
import { PIECE_COLORS, TOKENS } from "../theme/tokens";
import { PIECE_SHAPES, type Pt } from "./shapes";

export interface BoardDeps {
  session: GameSession;
  settings: SettingsStore;
  feedback: Feedback;
  /** Appelé quand toutes les animations d'un coup sont terminées (HUD, fin de niveau). */
  onSettled: () => void;
  /** Annonce pour les lecteurs d'écran (curseur clavier, sélection). */
  onAnnounce: (text: string) => void;
  /** Horodatage de chaque flash lumineux réellement joué (contrôle WCAG 2.3.1 en test). */
  onFlash?: (now: number) => void;
  cellPx: number;
}

interface View {
  c: Phaser.GameObjects.Container;
  id: number;
  color: number;
  special: Special | null;
}

const hex = (s: string) => parseInt(s.slice(1), 16);
const HINT_DELAY_MS = 5000;

export class BoardScene extends Phaser.Scene {
  private deps!: BoardDeps;
  private views = new Map<Pos, View>();
  private busy = false;
  private selected: Pos | null = null;
  private dragStart: { pos: Pos; x: number; y: number } | null = null;
  private cursor: Pos = 0;
  private keyboardMode = false;
  private selectBox!: Phaser.GameObjects.Rectangle;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private hintTimer: Phaser.Time.TimerEvent | null = null;
  private hintTweens: Phaser.Tweens.Tween[] = [];
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private flash = new FlashLimiter(3, 1000);
  private unsubSettings: (() => void) | null = null;

  constructor() {
    super("board");
  }

  init(deps: BoardDeps): void {
    this.deps = deps;
  }

  private get st(): GameState {
    return this.deps.session.state;
  }
  private get cell(): number {
    return this.deps.cellPx;
  }
  private get speed(): number {
    return this.deps.settings.value.reducedMotion ? 0.35 : 1;
  }

  create(): void {
    this.makeTextures();
    const { width, height } = this.st;
    // Fond dessiné une fois puis figé en texture : un objet Graphics serait retessellé à chaque image.
    const bg = this.make.graphics({}, false);
    bg.fillStyle(hex(TOKENS.boardBg), 1).fillRoundedRect(0, 0, width * this.cell, height * this.cell, this.cell * 0.18);
    bg.fillStyle(hex(TOKENS.cellBg), 1);
    for (let i = 0; i < this.st.cells.length; i++) {
      if (!this.st.mask[i]) continue;
      const [x, y] = this.xy(i);
      bg.fillRoundedRect(x * this.cell + 2, y * this.cell + 2, this.cell - 4, this.cell - 4, this.cell * 0.14);
    }
    const bgKey = `board-bg-${this.st.mask.map((m) => (m ? 1 : 0)).join("")}-${this.cell}`;
    if (!this.textures.exists(bgKey)) bg.generateTexture(bgKey, width * this.cell, height * this.cell);
    bg.destroy();
    this.add.image(0, 0, bgKey).setOrigin(0, 0).setDepth(0);
    this.selectBox = this.add.rectangle(0, 0, this.cell - 4, this.cell - 4).setStrokeStyle(4, 0xffffff).setVisible(false).setDepth(5);
    this.cursorBox = this.add.rectangle(0, 0, this.cell - 2, this.cell - 2).setStrokeStyle(5, hex(TOKENS.focus)).setVisible(false).setDepth(6);
    if (!this.deps.settings.value.reducedMotion) {
      this.emitter = this.add.particles(0, 0, "spark", {
        speed: { min: this.cell * 0.8, max: this.cell * 2.4 },
        lifespan: 380,
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.9, end: 0 },
        emitting: false,
        maxAliveParticles: 300,
      }).setDepth(4);
    }
    this.syncToState(true);
    this.setupInput();
    this.unsubSettings = this.deps.settings.subscribe(() => this.syncToState(true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubSettings?.());
    this.resetHint();
  }

  // ───────────────────────── textures (aucun fichier d'image : tout est vectoriel et original) ─────────────────────────
  private makeTextures(): void {
    const s = Math.round(this.cell * 0.84);
    const r = s / 2;
    const toPx = (pts: Pt[], k = 0.92) => pts.map(([x, y]) => new Phaser.Math.Vector2(r + x * r * k, r + y * r * k));
    for (const cb of [false, true]) {
      PIECE_SHAPES.forEach((shape, c) => {
        const key = `piece-${c}${cb ? "-cb" : ""}`;
        if (this.textures.exists(key)) return;
        const g = this.make.graphics({}, false);
        g.fillStyle(hex(PIECE_COLORS[c]), 1).fillPoints(toPx(shape), true);
        g.fillStyle(0xffffff, 0.28).fillPoints(toPx(shape, 0.5).map((p) => p.set(p.x - r * 0.12, p.y - r * 0.14)), true);
        g.lineStyle(cb ? Math.max(4, s * 0.09) : Math.max(2, s * 0.035), cb ? 0x0b0b0b : 0x10233f, 1).strokePoints(toPx(shape), true, true);
        g.generateTexture(key, s, s);
        g.destroy();
      });
    }
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({}, false);
      draw(g);
      g.generateTexture(key, s, s);
      g.destroy();
    };
    const outline = 0x10233f;
    make("ov-rocketH", (g) => {
      g.fillStyle(0xffffff, 1).lineStyle(2, outline, 1);
      g.fillRect(r * 0.35, r * 0.82, r * 1.3, r * 0.36).strokeRect(r * 0.35, r * 0.82, r * 1.3, r * 0.36);
      g.fillTriangle(r * 0.05, r, r * 0.4, r * 0.62, r * 0.4, r * 1.38).fillTriangle(r * 1.95, r, r * 1.6, r * 0.62, r * 1.6, r * 1.38);
    });
    make("ov-rocketV", (g) => {
      g.fillStyle(0xffffff, 1).lineStyle(2, outline, 1);
      g.fillRect(r * 0.82, r * 0.35, r * 0.36, r * 1.3).strokeRect(r * 0.82, r * 0.35, r * 0.36, r * 1.3);
      g.fillTriangle(r, r * 0.05, r * 0.62, r * 0.4, r * 1.38, r * 0.4).fillTriangle(r, r * 1.95, r * 0.62, r * 1.6, r * 1.38, r * 1.6);
    });
    make("ov-bomb", (g) => {
      g.lineStyle(r * 0.16, 0xffffff, 1).strokeCircle(r, r * 1.05, r * 0.5);
      g.lineStyle(2, outline, 1).strokeCircle(r, r * 1.05, r * 0.6);
      g.fillStyle(0xffffff, 1).fillCircle(r * 1.45, r * 0.42, r * 0.14);
    });
    make("ov-dragonfly", (g) => {
      g.fillStyle(0xffffff, 0.92).lineStyle(2, outline, 1);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        g.fillEllipse(r + dx * r * 0.42, r + dy * r * 0.28, r * 0.7, r * 0.34).strokeEllipse(r + dx * r * 0.42, r + dy * r * 0.28, r * 0.7, r * 0.34);
      }
      g.fillStyle(outline, 1).fillRect(r * 0.93, r * 0.45, r * 0.14, r * 1.1);
    });
    make("prism", (g) => {
      const hexPts = Array.from({ length: 6 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / 3;
        return new Phaser.Math.Vector2(r + Math.cos(a) * r * 0.9, r + Math.sin(a) * r * 0.9);
      });
      hexPts.forEach((p, k) => {
        const q = hexPts[(k + 1) % 6];
        g.fillStyle(hex(PIECE_COLORS[k]), 1).fillTriangle(r, r, p.x, p.y, q.x, q.y);
      });
      g.lineStyle(Math.max(3, s * 0.06), 0xffffff, 1).strokePoints(hexPts, true, true);
      g.fillStyle(0xffffff, 1).fillCircle(r, r, r * 0.2);
    });
    if (!this.textures.exists("spark")) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
      g.generateTexture("spark", 16, 16);
      g.destroy();
    }
  }

  // ───────────────────────── vues des pièces ─────────────────────────
  private xy(i: Pos): [number, number] {
    return [i % this.st.width, Math.floor(i / this.st.width)];
  }
  private center(i: Pos): [number, number] {
    const [x, y] = this.xy(i);
    return [x * this.cell + this.cell / 2, y * this.cell + this.cell / 2];
  }
  private posAt(px: number, py: number): Pos | null {
    const x = Math.floor(px / this.cell), y = Math.floor(py / this.cell);
    if (x < 0 || y < 0 || x >= this.st.width || y >= this.st.height) return null;
    const i = y * this.st.width + x;
    return this.st.mask[i] ? i : null;
  }

  private fillView(v: View): void {
    v.c.removeAll(true);
    const cb = this.deps.settings.value.colorblind;
    if (v.special === "prism") v.c.add(this.add.image(0, 0, "prism"));
    else {
      v.c.add(this.add.image(0, 0, `piece-${v.color}${cb ? "-cb" : ""}`));
      if (v.special) v.c.add(this.add.image(0, 0, `ov-${v.special}`));
    }
  }

  private makeView(i: Pos, p: Pick<Piece, "id" | "color" | "special">): View {
    const [cx, cy] = this.center(i);
    const v: View = { c: this.add.container(cx, cy).setDepth(2), id: p.id, color: p.color, special: p.special };
    this.fillView(v);
    return v;
  }

  /** Resynchronise l'affichage après une modification externe de l'état (outils de test, éditeur). */
  resync(): void {
    this.syncToState(true);
  }

  /** Aligne l'affichage sur l'état du moteur (filet de sécurité après chaque animation). */
  private syncToState(forceRedraw = false): void {
    const st = this.st;
    for (let i = 0; i < st.cells.length; i++) {
      const p = st.cells[i];
      const v = this.views.get(i);
      if (!p) {
        if (v) { v.c.destroy(); this.views.delete(i); }
        continue;
      }
      if (!v || v.id !== p.id) {
        v?.c.destroy();
        this.views.set(i, this.makeView(i, p));
      } else {
        if (forceRedraw || v.color !== p.color || v.special !== p.special) {
          v.color = p.color;
          v.special = p.special;
          this.fillView(v);
        }
        const [cx, cy] = this.center(i);
        v.c.setPosition(cx, cy).setScale(1).setAlpha(1);
      }
    }
  }

  // ───────────────────────── entrées : tactile (glisser ou toucher-toucher) et clavier ─────────────────────────
  private setupInput(): void {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.deps.feedback.unlockAudio();
      this.keyboardMode = false;
      this.cursorBox.setVisible(false);
      const pos = this.posAt(p.x, p.y);
      if (pos === null) return;
      this.activate(pos);
      this.dragStart = this.busy ? null : { pos, x: p.x, y: p.y };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragStart || !p.isDown || this.busy || this.deps.session.pendingBooster) return;
      const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < this.cell * 0.35) return;
      const [x, y] = this.xy(this.dragStart.pos);
      const nx = x + (Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0);
      const ny = y + (Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy));
      const from = this.dragStart.pos;
      this.dragStart = null;
      if (nx >= 0 && ny >= 0 && nx < this.st.width && ny < this.st.height) this.tryMove(from, ny * this.st.width + nx);
    });
    this.input.on("pointerup", () => (this.dragStart = null));

    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "application");
    canvas.setAttribute("aria-label", t("a11y.board", { w: this.st.width, h: this.st.height }));
    canvas.addEventListener("keydown", (e) => this.onKey(e));
    canvas.addEventListener("focus", () => {
      this.keyboardMode = true;
      if (!this.st.mask[this.cursor]) this.cursor = this.st.mask.indexOf(true);
      this.drawCursor();
    });
    canvas.addEventListener("blur", () => this.cursorBox.setVisible(false));
  }

  private onKey(e: KeyboardEvent): void {
    const [x, y] = this.xy(this.cursor);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key in moves) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      const nx = Math.min(this.st.width - 1, Math.max(0, x + dx)), ny = Math.min(this.st.height - 1, Math.max(0, y + dy));
      this.cursor = ny * this.st.width + nx;
      this.keyboardMode = true;
      this.drawCursor();
      this.resetHint();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.deps.feedback.unlockAudio();
      if (this.st.mask[this.cursor]) this.activate(this.cursor);
    } else if (e.key === "Escape") {
      this.selected = null;
      this.selectBox.setVisible(false);
      this.deps.session.pendingBooster = null;
      this.deps.onSettled();
    }
  }

  private drawCursor(): void {
    const [cx, cy] = this.center(this.cursor);
    this.cursorBox.setPosition(cx, cy).setVisible(this.keyboardMode);
    const p = this.st.cells[this.cursor];
    const name = !p ? "—" : p.special === "prism" ? t("special.prism") : t(`piece.${p.color}` as never) + (p.special ? `, ${t(`special.${p.special}` as never)}` : "");
    const [x, y] = this.xy(this.cursor);
    this.deps.onAnnounce(t("a11y.cursor", { x: x + 1, y: y + 1, piece: name }));
  }

  /** Toucher ou Entrée sur une case : booster en attente, sélection, ou échange avec la case sélectionnée. */
  private activate(pos: Pos): void {
    if (this.busy || this.st.status !== "playing") return;
    this.resetHint();
    const booster = this.deps.session.pendingBooster;
    if (booster) {
      if (!needsTarget(booster)) return;
      const out = this.deps.session.useBooster(booster, pos);
      if (out) void this.animate(out.events);
      return;
    }
    if (this.selected !== null && this.selected !== pos && areAdjacent(this.st, this.selected, pos)) {
      this.tryMove(this.selected, pos);
      return;
    }
    this.selected = this.selected === pos ? null : pos;
    const [cx, cy] = this.center(pos);
    this.selectBox.setPosition(cx, cy).setVisible(this.selected !== null);
    if (this.selected !== null) this.deps.onAnnounce(t("a11y.selected"));
  }

  private tryMove(from: Pos, to: Pos): void {
    this.selected = null;
    this.selectBox.setVisible(false);
    if (this.busy) return;
    const r = this.deps.session.play({ from, to });
    if ("rejected" in r) {
      for (const e of r.rejected) this.deps.feedback.onEvent(e, 1);
      void this.wiggle(from, to);
      return;
    }
    void this.animate(r.events);
  }

  /** Mélangeur : appelé par la barre de boosters (pas de case visée). */
  useUntargetedBooster(): void {
    const b = this.deps.session.pendingBooster;
    if (!b || needsTarget(b) || this.busy) return;
    const out = this.deps.session.useBooster(b);
    if (out) void this.animate(out.events);
  }

  // ───────────────────────── indice ─────────────────────────
  private resetHint(): void {
    this.hintTimer?.remove();
    this.hintTweens.forEach((tw) => tw.stop());
    this.hintTweens = [];
    for (const v of this.views.values()) v.c.setScale(1);
    if (!this.deps.settings.value.hints) return;
    this.hintTimer = this.time.delayedCall(HINT_DELAY_MS, () => {
      if (this.busy || this.st.status !== "playing") return;
      const m = getHint(this.st);
      if (!m) return;
      for (const p of [m.from, m.to]) {
        const v = this.views.get(p);
        if (v) this.hintTweens.push(this.tweens.add({ targets: v.c, scale: 1.12, duration: 420, yoyo: true, repeat: -1 }));
      }
    });
  }

  // ───────────────────────── animations ─────────────────────────
  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      const duration = Math.max(1, Number(cfg.duration ?? 150) * this.speed);
      this.tweens.add({ ...cfg, duration, onComplete: () => resolve() });
    });
  }

  private async wiggle(a: Pos, b: Pos): Promise<void> {
    const va = this.views.get(a), vb = this.views.get(b);
    if (!va || !vb) return;
    this.busy = true;
    const [ax, ay] = this.center(a), [bx, by] = this.center(b);
    await Promise.all([
      this.tween({ targets: va.c, x: (ax + bx) / 2, y: (ay + by) / 2, duration: 90, yoyo: true }),
      this.tween({ targets: vb.c, x: (ax + bx) / 2, y: (ay + by) / 2, duration: 90, yoyo: true }),
    ]);
    this.busy = false;
    this.resetHint();
  }

  async animate(events: GameEvent[]): Promise<void> {
    this.busy = true;
    this.resetHint();
    let cascade = 1;
    let pending: Promise<void>[] = [];
    const flush = async () => {
      await Promise.all(pending);
      pending = [];
    };
    for (const e of events) {
      this.deps.feedback.onEvent(e, cascade);
      switch (e.type) {
        case "swap": {
          const va = this.views.get(e.from), vb = this.views.get(e.to);
          const [ax, ay] = this.center(e.from), [bx, by] = this.center(e.to);
          await Promise.all([
            va ? this.tween({ targets: va.c, x: bx, y: by, duration: 140 }) : Promise.resolve(),
            vb ? this.tween({ targets: vb.c, x: ax, y: ay, duration: 140 }) : Promise.resolve(),
          ]);
          if (va) this.views.set(e.to, va); else this.views.delete(e.to);
          if (vb) this.views.set(e.from, vb); else this.views.delete(e.from);
          break;
        }
        case "cascade":
          cascade = e.index;
          break;
        case "combo":
          if (!this.deps.settings.value.reducedMotion) this.cameras.main.shake(160, 0.004);
          break;
        case "activated":
          pending.push(this.fxArea(e.cells, e.special));
          break;
        case "dragonflyFlight":
          pending.push(this.fxFlight(e.from, e.to));
          break;
        case "transformed":
          e.cells.forEach((c, k) => {
            const v = this.views.get(c);
            if (!v) return;
            v.special = e.specials[k];
            if (v.special === "prism") v.color = -1;
            this.fillView(v);
          });
          await flush();
          pending.push(this.tween({ targets: [...e.cells].map((c) => this.views.get(c)?.c).filter(Boolean), scale: 1.15, duration: 120, yoyo: true }));
          break;
        case "cleared":
          await flush();
          pending.push(this.fxClear(e.cells));
          break;
        case "specialCreated": {
          await flush();
          const v = this.makeView(e.at, { id: e.id, color: e.color, special: e.special });
          this.views.get(e.at)?.c.destroy();
          this.views.set(e.at, v);
          v.c.setScale(0.2);
          pending.push(this.tween({ targets: v.c, scale: 1, duration: 180, ease: "Back.Out" }));
          break;
        }
        case "gravity":
          await flush();
          pending.push(this.fxGravity(e.moves));
          break;
        case "spawned":
          pending.push(this.fxSpawn(e.pieces));
          await flush();
          break;
        case "shuffle":
          await flush();
          await this.fxShuffle(e.mapping);
          break;
        default:
          break;
      }
    }
    await flush();
    this.syncToState();
    this.busy = false;
    this.resetHint();
    this.deps.onSettled();
  }

  private fxClear(cells: Pos[]): Promise<void> {
    const targets: Phaser.GameObjects.Container[] = [];
    for (const c of cells) {
      const v = this.views.get(c);
      if (!v) continue;
      this.views.delete(c);
      targets.push(v.c);
      if (this.emitter) {
        const [x, y] = this.center(c);
        this.emitter.setParticleTint(v.color >= 0 ? hex(PIECE_COLORS[v.color]) : 0xffffff);
        this.emitter.explode(4, x, y);
      }
    }
    if (targets.length === 0) return Promise.resolve();
    return this.tween({ targets, scale: 0, alpha: 0, duration: 160 }).then(() => targets.forEach((t2) => t2.destroy()));
  }

  /** Effet de zone. Le halo lumineux n'est joué que si le limiteur l'autorise (≤ 3 flashs/s). */
  private fxArea(cells: Pos[], special: Special): Promise<void> {
    if (cells.length === 0) return Promise.resolve();
    const now = this.time.now;
    const bright = this.flash.allow(now);
    if (bright) this.deps.onFlash?.(now);
    const color = bright ? 0xffffff : special === "prism" ? 0xffffff : hex(TOKENS.button);
    const alpha = bright ? 0.42 : 0.18;
    const rects = cells.map((c) => {
      const [cx, cy] = this.center(c);
      return this.add.rectangle(cx, cy, this.cell, this.cell, color, alpha).setDepth(3);
    });
    return this.tween({ targets: rects, alpha: 0, duration: 220 }).then(() => rects.forEach((r) => r.destroy()));
  }

  private fxFlight(from: Pos, to: Pos): Promise<void> {
    const [ax, ay] = this.center(from), [bx, by] = this.center(to);
    const img = this.add.image(ax, ay, "ov-dragonfly").setDepth(6);
    return this.tween({ targets: img, x: bx, y: by, duration: 260, ease: "Sine.InOut" }).then(() => img.destroy());
  }

  private fxGravity(moves: [Pos, Pos][]): Promise<void> {
    const next = new Map(this.views);
    const tws: Promise<void>[] = [];
    for (const [from] of moves) next.delete(from);
    for (const [from, to] of moves) {
      const v = this.views.get(from);
      if (!v) continue;
      next.set(to, v);
      const [, y] = this.center(to);
      const dist = Math.abs(Math.floor(to / this.st.width) - Math.floor(from / this.st.width));
      tws.push(this.tween({ targets: v.c, y, duration: Math.min(320, 70 + dist * 45), ease: "Quad.In" }));
    }
    this.views = next;
    return Promise.all(tws).then(() => undefined);
  }

  private fxSpawn(pieces: { at: Pos; id: number; color: number }[]): Promise<void> {
    const perCol = new Map<number, number>();
    for (const p of pieces) perCol.set(p.at % this.st.width, (perCol.get(p.at % this.st.width) ?? 0) + 1);
    const tws: Promise<void>[] = [];
    for (const p of pieces) {
      const v = this.makeView(p.at, { id: p.id, color: p.color, special: null });
      this.views.get(p.at)?.c.destroy();
      this.views.set(p.at, v);
      const [, y] = this.center(p.at);
      const n = perCol.get(p.at % this.st.width)!;
      v.c.y = y - n * this.cell;
      tws.push(this.tween({ targets: v.c, y, duration: Math.min(320, 80 + n * 45), ease: "Quad.In" }));
    }
    return Promise.all(tws).then(() => undefined);
  }

  private fxShuffle(mapping: [Pos, Pos][]): Promise<void> {
    const next = new Map<Pos, View>();
    const tws: Promise<void>[] = [];
    for (const [from, to] of mapping) {
      const v = this.views.get(from);
      if (!v) continue;
      next.set(to, v);
      const [x, y] = this.center(to);
      tws.push(this.tween({ targets: v.c, x, y, duration: 380, ease: "Sine.InOut" }));
    }
    this.views = next;
    return Promise.all(tws).then(() => undefined);
  }
}
