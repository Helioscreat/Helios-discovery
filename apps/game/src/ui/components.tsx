import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { PIECE_SHAPES } from "../render/shapes";
import { PIECE_COLORS } from "../theme/tokens";

/**
 * Modale accessible : role="dialog", aria-modal, titre relié, focus piégé, Échap = refus.
 * `name` sert au registre des écrans (tests d'interface COM-04).
 */
export function Modal(props: { name: string; title: string; onEscape?: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = `modal-title-${props.name}`;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select")];
    // Focus sur la boîte elle-même : aucun des deux choix n'est mis en avant par l'anneau de focus.
    el.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.onEscape) {
        e.preventDefault();
        props.onEscape();
      } else if (e.key === "Tab") {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);
  return (
    <div class="backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} data-modal={props.name} ref={ref} tabIndex={-1}>
        <h2 id={titleId}>{props.title}</h2>
        {props.children}
      </div>
    </div>
  );
}

/**
 * Choix binaire imposé à toute modale d'achat, de consentement ou de fin de niveau (COM-04) :
 * les deux boutons ont exactement le même style, la même taille et la même graisse.
 * Le refus est toujours présent et n'utilise qu'un libellé de la liste blanche `decline.*` (COM-06).
 */
export function DualChoice(props: { accept: string; decline: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <div class="dual-choice" data-dual-choice>
      <button type="button" class="btn" data-choice="decline" onClick={props.onDecline}>{props.decline}</button>
      <button type="button" class="btn" data-choice="accept" onClick={props.onAccept}>{props.accept}</button>
    </div>
  );
}

/** Icône de pièce (même silhouette que sur la grille) : la forme porte l'information, pas seulement la couleur. */
export function PieceIcon(props: { color: number; size?: number }) {
  const pts = PIECE_SHAPES[props.color].map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" ");
  const s = props.size ?? 24;
  return (
    <svg width={s} height={s} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden="true" class="piece-icon">
      <polygon points={pts} fill={PIECE_COLORS[props.color]} stroke="#0B0B0B" stroke-width="0.12" stroke-linejoin="round" />
    </svg>
  );
}

const BOOSTER_GLYPHS: Record<string, string> = {
  hammer: "M-0.7 0.7 L0.1 -0.1 M-0.2 -0.6 L0.6 0.2 L0.9 -0.1 L0.1 -0.9 Z",
  bomb: "M0 -0.2 m-0.6 0 a0.6 0.6 0 1 0 1.2 0 a0.6 0.6 0 1 0 -1.2 0 M0.35 -0.65 L0.7 -0.95",
  rainbow: "M-0.9 0.5 A0.9 0.9 0 0 1 0.9 0.5 M-0.6 0.5 A0.6 0.6 0 0 1 0.6 0.5 M-0.3 0.5 A0.3 0.3 0 0 1 0.3 0.5",
  fireCross: "M0 -0.9 L0 0.9 M-0.9 0 L0.9 0",
  shuffler: "M-0.8 -0.4 L0.4 -0.4 L0.4 -0.7 L0.85 -0.3 L0.4 0.1 L0.4 -0.2 L-0.8 -0.2 Z M0.8 0.4 L-0.4 0.4 L-0.4 0.7 L-0.85 0.3 L-0.4 -0.1 L-0.4 0.2 L0.8 0.2 Z",
  starterKit: "M-0.8 -0.4 L0.8 -0.4 L0.8 0.8 L-0.8 0.8 Z M-0.3 -0.4 L-0.3 -0.8 L0.3 -0.8 L0.3 -0.4",
};

export function BoosterGlyph(props: { booster: string }) {
  return (
    <svg width="28" height="28" viewBox="-1 -1 2 2" aria-hidden="true">
      <path d={BOOSTER_GLYPHS[props.booster]} fill="none" stroke="currentColor" stroke-width="0.16" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** Icônes des obstacles et objets (objectifs du HUD) : forme et couleur, jamais la couleur seule. */
export function ObstacleIcon(props: { kind: "ice" | "crate" | "chain" | "cage" | "ivy" | "drop" | "bubble" | "chest" }) {
  const s = 24;
  const shapes: Record<string, preact.JSX.Element> = {
    ice: <g><rect x="-0.85" y="-0.85" width="1.7" height="1.7" rx="0.3" fill="#BFE8FF" stroke="#0B0B0B" stroke-width="0.1" /><path d="M-0.5 -0.2 L0.2 -0.6 M-0.3 0.4 L0.5 -0.1" stroke="#FFFFFF" stroke-width="0.14" /></g>,
    crate: <g><rect x="-0.85" y="-0.85" width="1.7" height="1.7" rx="0.12" fill="#A0652E" stroke="#0B0B0B" stroke-width="0.1" /><path d="M-0.85 -0.85 L0.85 0.85 M-0.85 0 L0.85 0" stroke="#5A3412" stroke-width="0.14" /></g>,
    chain: <g fill="none" stroke="#C8CDD4" stroke-width="0.22"><ellipse cx="-0.4" cy="0" rx="0.45" ry="0.28" /><ellipse cx="0.4" cy="0" rx="0.45" ry="0.28" /></g>,
    cage: <g fill="none" stroke="#E8EDF3" stroke-width="0.16"><rect x="-0.8" y="-0.8" width="1.6" height="1.6" rx="0.1" /><path d="M-0.3 -0.8 V0.8 M0.3 -0.8 V0.8" /></g>,
    ivy: <g><path d="M0 0.9 C-0.2 0.2 0.2 -0.2 0 -0.9" stroke="#2E7D32" stroke-width="0.14" fill="none" /><ellipse cx="-0.35" cy="0.1" rx="0.35" ry="0.2" fill="#43A047" /><ellipse cx="0.35" cy="-0.35" rx="0.35" ry="0.2" fill="#43A047" /></g>,
    bubble: <g><circle r="0.8" fill="#D6F0FF" fill-opacity="0.6" stroke="#FFFFFF" stroke-width="0.12" /><ellipse cx="-0.3" cy="-0.35" rx="0.22" ry="0.12" fill="#FFFFFF" /></g>,
    chest: <g><rect x="-0.85" y="-0.6" width="1.7" height="1.4" rx="0.12" fill="#8D5524" stroke="#3E2410" stroke-width="0.1" /><rect x="-0.85" y="-0.75" width="1.7" height="0.45" rx="0.12" fill="#C68642" /><rect x="-0.18" y="-0.15" width="0.36" height="0.45" rx="0.06" fill="#FFD166" /></g>,
    drop: <g><circle r="0.55" fill="#FFD166" stroke="#0B0B0B" stroke-width="0.1" /><path d="M0 -0.95 V-0.7 M0 0.7 V0.95 M-0.95 0 H-0.7 M0.7 0 H0.95" stroke="#FFD166" stroke-width="0.14" /></g>,
  };
  return <svg width={s} height={s} viewBox="-1 -1 2 2" aria-hidden="true">{shapes[props.kind]}</svg>;
}
