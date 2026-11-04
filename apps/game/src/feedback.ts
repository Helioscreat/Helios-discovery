import type { GameEvent } from "@helios/core";
import { t, type MessageKey } from "./i18n";
import type { SettingsStore } from "./settings";

/** Gamme pentatonique (demi-tons) : la hauteur monte avec la cascade, plafonnée au 8e degré. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

type CaptionListener = (text: string) => void;

/**
 * Sons synthétisés (WebAudio, aucun fichier), vibrations et sous-titres.
 * Chaque son porteur de sens a un sous-titre ; les annonces passent aussi par une région
 * aria-live pour les lecteurs d'écran, que les sous-titres visibles soient activés ou non.
 */
export class Feedback {
  private ctx: AudioContext | null = null;
  private captionListeners = new Set<CaptionListener>();
  private lastCaption = 0;

  constructor(private readonly settings: SettingsStore) {}

  /** À appeler lors d'un geste utilisateur (politique d'autoplay des navigateurs). */
  unlockAudio(): void {
    if (this.ctx || typeof AudioContext === "undefined") return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  onCaption(l: CaptionListener): () => void {
    this.captionListeners.add(l);
    return () => this.captionListeners.delete(l);
  }

  caption(key: MessageKey, params: Record<string, string | number> = {}, now = Date.now()): void {
    // Au plus un sous-titre toutes les 400 ms pour rester lisible.
    if (now - this.lastCaption < 400 && key !== "caption.win" && key !== "caption.fail") return;
    this.lastCaption = now;
    const text = t(key, params);
    for (const l of this.captionListeners) l(text);
  }

  tone(degree: number, duration = 0.12, type: OscillatorType = "sine", gain = 0.08): void {
    if (!this.settings.value.sound || !this.ctx) return;
    const ctx = this.ctx;
    const semis = PENTATONIC[Math.min(degree, PENTATONIC.length - 1)];
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = 392 * 2 ** (semis / 12);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  vibrate(ms: number): void {
    if (!this.settings.value.vibration) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* non pris en charge */
    }
  }

  /** Réaction sonore, haptique et sous-titrée à un événement du moteur. */
  onEvent(e: GameEvent, cascade: number): void {
    switch (e.type) {
      case "match":
        this.tone(cascade - 1);
        if (cascade <= 1) this.caption("caption.match");
        break;
      case "cascade":
        this.caption("caption.cascade", { n: e.index });
        break;
      case "combo":
        this.tone(6, 0.3, "triangle", 0.1);
        this.vibrate(40);
        this.caption("caption.combo");
        break;
      case "activated":
        this.vibrate(15);
        if (e.special === "bomb") { this.tone(0, 0.25, "triangle"); this.caption("caption.bomb"); }
        else if (e.special === "prism") { this.tone(7, 0.3, "sine", 0.1); this.caption("caption.prism"); }
        else if (e.special === "dragonfly") this.caption("caption.dragonfly");
        else { this.tone(4, 0.15, "sawtooth", 0.04); this.caption("caption.rocket"); }
        break;
      case "shuffle":
        this.caption("caption.shuffle");
        break;
      case "swapRejected":
        this.tone(0, 0.08, "square", 0.03);
        this.caption("caption.invalid");
        break;
      case "won":
        [0, 2, 4, 7].forEach((d, k) => setTimeout(() => this.tone(d + 3, 0.2), k * 120));
        this.vibrate(60);
        this.caption("caption.win");
        break;
      case "lost":
        this.tone(0, 0.4, "sine", 0.06);
        this.caption("caption.fail");
        break;
      default:
        break;
    }
  }
}
