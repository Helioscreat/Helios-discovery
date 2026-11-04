/**
 * Silhouettes des 6 pièces, en coordonnées unitaires [-1, 1] (y vers le bas).
 * Une seule source pour le rendu Phaser et pour le test de distinction des formes (mode daltonien).
 */
export type Pt = [number, number];

const ring = (n: number, f: (t: number) => Pt): Pt[] => Array.from({ length: n }, (_, k) => f((k / n) * Math.PI * 2));

const circle = (r: number): Pt[] => ring(48, (t) => [Math.cos(t) * r, Math.sin(t) * r]);

function star(outer: number, inner: number): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k < 10; k++) {
    const t = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? outer : inner;
    pts.push([Math.cos(t) * r, Math.sin(t) * r + 0.06]);
  }
  return pts;
}

function drop(): Pt[] {
  // Pointe en haut, ventre rond en bas.
  const pts: Pt[] = [[0, -0.95]];
  const cy = 0.28, r = 0.6;
  for (let k = 0; k <= 32; k++) {
    const t = -Math.PI * 0.15 + (k / 32) * Math.PI * 1.3; // de l'épaule droite à l'épaule gauche, par le bas
    pts.push([Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

function roundedSquare(half: number, radius: number): Pt[] {
  const pts: Pt[] = [];
  const c = half - radius;
  const corners: [number, number, number][] = [[c, c, 0], [-c, c, Math.PI / 2], [-c, -c, Math.PI], [c, -c, (3 * Math.PI) / 2]];
  for (const [cx, cy, a0] of corners)
    for (let k = 0; k <= 6; k++) {
      const t = a0 + (k / 6) * (Math.PI / 2);
      pts.push([cx + Math.cos(t) * radius, cy + Math.sin(t) * radius]);
    }
  return pts;
}

export const SHAPE_NAMES = ["circle", "star", "triangle", "drop", "diamond", "square"] as const;
export type ShapeName = (typeof SHAPE_NAMES)[number];

/** Index = couleur de la pièce (0 Baie, 1 Pétale, 2 Feuille, 3 Goutte, 4 Prune, 5 Nuage). */
export const PIECE_SHAPES: Pt[][] = [
  circle(0.74),
  star(0.98, 0.46),
  [[0, -0.9], [0.92, 0.78], [-0.92, 0.78]],
  drop(),
  [[0, -0.98], [0.72, 0], [0, 0.98], [-0.72, 0]],
  roundedSquare(0.8, 0.14),
];

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Rasterise une silhouette sur une grille n×n (1 = intérieur). */
export function rasterize(poly: Pt[], n = 48): Uint8Array {
  const out = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      out[y * n + x] = pointInPolygon([((x + 0.5) / n) * 2 - 1, ((y + 0.5) / n) * 2 - 1], poly) ? 1 : 0;
  return out;
}

/** Distance de silhouette : 1 − IoU. 0 = identiques, 1 = disjointes. */
export function silhouetteDistance(a: Pt[], b: Pt[], n = 48): number {
  const ra = rasterize(a, n), rb = rasterize(b, n);
  let inter = 0, uni = 0;
  for (let i = 0; i < ra.length; i++) {
    inter += ra[i] & rb[i];
    uni += ra[i] | rb[i];
  }
  return 1 - inter / uni;
}
