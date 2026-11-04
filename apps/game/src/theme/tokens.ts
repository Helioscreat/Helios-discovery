/** Jetons de couleur de l'interface. Toute paire texte/fond utilisée doit figurer dans CONTRAST_PAIRS. */
export const TOKENS = {
  bg: "#0F2440",
  surface: "#1B3358",
  surfaceRaised: "#25426E",
  text: "#F4F7FB",
  textMuted: "#C3D0E2",
  button: "#FFD166",
  buttonText: "#1A1405",
  buttonDisabled: "#56657C",
  buttonDisabledText: "#F4F7FB",
  focus: "#7FDBFF",
  boardBg: "#183A63",
  cellBg: "#21497A",
  badge: "#C2410C",
  badgeText: "#FFFFFF",
} as const;

export type Token = keyof typeof TOKENS;

/** [texte, fond, ratio minimal] — 4,5:1 pour le texte courant, 3:1 pour les composants et grands textes (WCAG 2.1 AA). */
export const CONTRAST_PAIRS: [Token, Token, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text", "surfaceRaised", 4.5],
  ["textMuted", "bg", 4.5],
  ["textMuted", "surface", 4.5],
  ["buttonText", "button", 4.5],
  ["buttonDisabledText", "buttonDisabled", 4.5],
  ["badgeText", "badge", 4.5],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
  ["button", "surface", 3],
];

/** Pièces : couleur + forme (cf. GDD §2). Les formes portent l'information ; la couleur la renforce. */
export const PIECE_COLORS = ["#D7263D", "#F4C430", "#2E9E4F", "#1B6CD1", "#7B3FA0", "#F5B8C9"] as const;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function applyTokens(root: HTMLElement): void {
  for (const [k, v] of Object.entries(TOKENS)) root.style.setProperty(`--${k}`, v);
}
