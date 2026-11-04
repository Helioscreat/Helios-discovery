/**
 * Formes de grille (dessinées à la main). '.' = case active, '#' = case inactive.
 * Toutes symétriques gauche-droite pour la lisibilité, toutes ≤ 9×9.
 */
export const SHAPES: Record<string, string[]> = {
  full9: [".........", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "........."],
  full8x9: ["........", "........", "........", "........", "........", "........", "........", "........", "........"],
  full7x8: [".......", ".......", ".......", ".......", ".......", ".......", ".......", "......."],
  corners: ["#.......#", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "#.......#"],
  diamond: ["###...###", "##.....##", "#.......#", ".........", ".........", ".........", "#.......#", "##.....##", "###...###"],
  hourglass: [".........", "#.......#", "##.....##", "###...###", "###...###", "###...###", "##.....##", "#.......#", "........."],
  donut: [".........", ".........", ".........", "...###...", "...###...", "...###...", ".........", ".........", "........."],
  pillars: [".........", ".........", "..#...#..", "..#...#..", ".........", "..#...#..", "..#...#..", ".........", "........."],
  arch: ["##.....##", "#.......#", ".........", ".........", ".........", ".........", "...###...", "...###...", "...###..."],
  cross: ["###...###", "###...###", "###...###", ".........", ".........", ".........", "###...###", "###...###", "###...###"],
  twin: ["....#....", "....#....", "....#....", "....#....", ".........", ".........", ".........", ".........", "........."],
  heart: ["##..#..##", ".........", ".........", ".........", ".........", "#.......#", "##.....##", "###...###", "####.####"],
  pyramid: ["####.####", "###...###", "##.....##", "#.......#", ".........", ".........", ".........", ".........", "........."],
  wide7: [".........", ".........", ".........", ".........", ".........", ".........", "........."],
};

/** Formes adaptées aux premiers niveaux générés (plus ouvertes). */
export const OPEN_SHAPES = ["full9", "full8x9", "corners", "wide7", "full7x8"];
export const ALL_SHAPES = Object.keys(SHAPES);

export function shapeSize(name: string): { width: number; height: number } {
  const s = SHAPES[name];
  return { width: s[0].length, height: s.length };
}

/**
 * Formes à portails : deux zones séparées par du vide. Portails = [x entrée, y entrée, x sortie, y sortie].
 * Toutes les sorties d'objets sont sur la dernière ligne (compatibles « objets à faire descendre »).
 */
export const PORTAL_SHAPES: Record<string, { mask: string[]; portals: [number, number, number, number][] }> = {
  split: {
    mask: [".........", ".........", ".........", ".........", "#########", ".........", ".........", ".........", "........."],
    portals: Array.from({ length: 9 }, (_, x) => [x, 3, x, 5] as [number, number, number, number]),
  },
  splitShift: {
    mask: [".........", ".........", ".........", "#########", ".........", ".........", ".........", ".........", "........."],
    portals: Array.from({ length: 9 }, (_, x) => [x, 2, (x + 4) % 9, 4] as [number, number, number, number]),
  },
  towers: {
    mask: ["...###...", "...###...", "...###...", "...###...", "#########", ".........", ".........", ".........", "........."],
    portals: [[0, 3, 2, 5], [1, 3, 1, 5], [2, 3, 0, 5], [6, 3, 8, 5], [7, 3, 7, 5], [8, 3, 6, 5]],
  },
};

/** Boucle de tapis roulant : contour d'un rectangle [x0, y0] – [x1, y1], dans le sens horaire. */
export function ringLoop(width: number, x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let x = x0; x <= x1; x++) out.push(y0 * width + x);
  for (let y = y0 + 1; y <= y1; y++) out.push(y * width + x1);
  for (let x = x1 - 1; x >= x0; x--) out.push(y1 * width + x);
  for (let y = y1 - 1; y > y0; y--) out.push(y * width + x0);
  return out;
}
