import type { Goal, LevelSpec } from "@helios/core";
import { DEFAULT_GENERATE, generateLevel, levelSeed, type Candidate, type GenerateOptions, type GeneratedLevel } from "./generator";
import { CONTENT_VERSION, difficultyOf, TARGET_RATE, type Difficulty } from "./schema";

/**
 * Niveaux 1–150 conçus à la main : grilles dessinées (ci-dessous), objectifs et nombre de couleurs
 * choisis niveau par niveau. Seul le nombre de coups est calibré par le bot.
 *
 * Légende des grilles (un caractère par case) :
 *   .  pièce au hasard     #  case inactive      a–f  pièce de couleur imposée
 *   i I J  gel 1, 2, 3 couches                   x X Y  caisse 1, 2, 3 PV
 *   k  pièce enchaînée     g  pièce en cage      v  lierre     D  objet à faire descendre
 *   q  caisse 1 PV sur gel     K  pièce enchaînée sur gel
 *   1  Fusée horizontale (a)   2  Fusée verticale (b)   3  Bombe (c)   4  Libellule (d)   P  Prisme
 */
const CHAR: Record<string, string> = {
  ".": ".", "#": "#", a: "a", b: "b", c: "c", d: "d", e: "e", f: "f",
  i: "i1.", I: "i2.", J: "i3.", x: "X1", X: "X2", Y: "X3", k: "k.", g: "g.", v: "V", D: "D", q: "i1X1", K: "i1k.",
  "1": "a-", "2": "b|", "3": "c*", "4": "d^", P: "P",
};

export const LAYOUTS: Record<string, string[]> = {
  // ── bases et tutoriels des spéciales ──
  open7: [".......", ".......", ".......", ".......", ".......", ".......", "......."],
  open8: ["........", "........", "........", "........", "........", "........", "........", "........"],
  open9: [".........", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "........."],
  tutRocket: [".......", ".......", ".......", "aaba...", "..a....", ".......", "......."],
  tutSquare: [".......", ".......", "..bb...", "..b....", "...b...", ".......", "......."],
  tutBomb: [".......", ".......", "..c....", "..c....", ".cdcc..", ".......", "......."],
  tutPrism: [".......", ".......", ".......", "aabaa..", "..a....", ".......", "......."],
  tutCombo: [".......", ".......", ".......", "..12...", ".......", ".......", "......."],
  corners: ["#.......#", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "#.......#"],
  diamond: ["###...###", "##.....##", "#.......#", ".........", ".........", ".........", "#.......#", "##.....##", "###...###"],
  hourglass: [".........", "#.......#", "##.....##", "###...###", "###...###", "###...###", "##.....##", "#.......#", "........."],
  pillars: [".........", ".........", "..#...#..", "..#...#..", ".........", "..#...#..", "..#...#..", ".........", "........."],
  donut: [".........", ".........", ".........", "...###...", "...###...", "...###...", ".........", ".........", "........."],
  twin: ["....#....", "....#....", "....#....", "....#....", ".........", ".........", ".........", ".........", "........."],
  // ── Gel ──
  tutIce: [".......", ".......", ".iiiii.", ".iiiii.", ".iiiii.", ".......", "......."],
  iceBand: [".........", ".........", ".........", "iiiiiiiii", "iiiiiiiii", "iiiiiiiii", ".........", ".........", "........."],
  iceRing: [".........", ".iiiiiii.", ".i.....i.", ".i.....i.", ".i.....i.", ".i.....i.", ".i.....i.", ".iiiiiii.", "........."],
  iceCorners: ["IIi...iII", "Ii.....iI", "i.......i", ".........", ".........", ".........", "i.......i", "Ii.....iI", "IIi...iII"],
  iceDiamond: ["###iii###", "##iIIIi##", "#iIIJIIi#", "iiIJJJIii", "iIJJJJJIi", "iiIJJJIii", "#iIIJIIi#", "##iIIIi##", "###iii###"],
  iceFloor: [".........", ".........", ".........", ".........", ".........", "IIIIIIIII", "IIIIIIIII", "JJJJJJJJJ", "JJJJJJJJJ"],
  // ── Caisses ──
  tutCrate: [".......", ".......", ".......", ".xxxxx.", ".......", ".......", "......."],
  crateRows: [".........", ".........", ".........", "x.x.x.x.x", ".........", "x.x.x.x.x", ".........", ".........", "........."],
  crateBlocks: [".........", ".........", ".XX...XX.", ".XX...XX.", ".........", ".........", "..XX.XX..", "..XX.XX..", "........."],
  crateHeavy: [".........", ".........", "Y.......Y", ".YX...XY.", "..YX.XY..", "...XYX...", ".........", ".........", "........."],
  crateIce: [".........", ".........", "iiiiiiiii", "iqiqiqiqi", "iiiiiiiii", "iqiqiqiqi", "iiiiiiiii", ".........", "........."],
  // ── Chaînes ──
  tutChain: [".......", ".......", "..kkk..", "..kkk..", "..kkk..", ".......", "......."],
  chainLines: [".........", ".........", "kkkkkkkkk", ".........", ".........", ".........", "kkkkkkkkk", ".........", "........."],
  chainIce: [".........", ".........", "..KKKKK..", ".KiiiiiK.", ".KiiiiiK.", ".KiiiiiK.", "..KKKKK..", ".........", "........."],
  // ── Objets à faire descendre ──
  tutDrop: ["...D...", ".......", ".......", ".......", ".......", ".......", "......."],
  dropOpen: ["..D...D..", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "........."],
  dropCrates: ["....D....", ".........", ".........", "..x...x..", "..x...x..", ".........", "x.......x", ".........", "........."],
  // ── Cages ──
  tutCage: [".......", ".......", ".g...g.", ".......", ".g...g.", ".......", "......."],
  cageGrid: [".........", ".........", ".g.g.g.g.", ".........", ".g.g.g.g.", ".........", ".g.g.g.g.", ".........", "........."],
  cageIce: [".........", ".........", "iigiigiig", "iiiiiiiii", "giigiigii", "iiiiiiiii", "iigiigiig", ".........", "........."],
  // ── Lierre ──
  tutIvy: [".......", ".......", ".......", ".......", ".......", "...v...", "......."],
  ivyCorners: [".........", ".........", ".........", ".........", ".........", ".........", ".........", "v.......v", "vv.....vv"],
  ivyCrates: [".........", ".........", ".........", "..x...x..", ".........", ".........", "....v....", "...vvv...", "........."],
  // ── combinaisons (niveaux 120–150) ──
  mixA: [".........", ".........", "iiiiiiiii", "ixixixixi", "iiiiiiiii", ".g.....g.", ".........", "...kkk...", "........."],
  mixB: ["##.....##", "#.......#", "..x...x..", "..KiiiK..", "..iIJIi..", "..KiiiK..", "..x...x..", "#.......#", "##.....##"],
  mixC: ["....D....", ".........", "k.......k", ".k.....k.", "..x...x..", ".........", ".........", ".........", "........."],
};

export const HANDMADE_COUNT = 150;

interface Design {
  layout: string;
  colors: number;
  goals: string; // "c1:30" collecte · "s:6000" score · "ice" / "crate" / "chain" / "cage" tout l'obstacle · "ivy:0" · "drop:3" ; séparés par "+"
  title?: string;
  tutorial?: string;
}

/** Table de conception, niveau par niveau. */
export const DESIGNS: Design[] = [
  // 1–10 : bases, puis les 4 spéciales et un premier combo
  { layout: "open7", colors: 4, goals: "c0:26", title: "Premiers pas", tutorial: "match" },
  { layout: "tutRocket", colors: 4, goals: "c0:30", title: "La Fusée", tutorial: "rocket" },
  { layout: "tutSquare", colors: 4, goals: "c1:30", title: "La Libellule", tutorial: "dragonfly" },
  { layout: "tutBomb", colors: 4, goals: "c2:32", title: "La Bombe", tutorial: "bomb" },
  { layout: "tutPrism", colors: 4, goals: "c3:32", title: "Le Prisme", tutorial: "prism" },
  { layout: "tutCombo", colors: 4, goals: "s:4000", title: "Combos", tutorial: "combo" },
  { layout: "open8", colors: 4, goals: "c0:20+c1:20" },
  { layout: "open8", colors: 4, goals: "c2:30", title: "Le Marteau" },
  { layout: "corners", colors: 5, goals: "c1:28" },
  { layout: "open9", colors: 5, goals: "s:4500" },
  // 11–20 : formes, puis le Gel (13)
  { layout: "diamond", colors: 5, goals: "c0:26" },
  { layout: "pillars", colors: 5, goals: "c3:30", title: "La Bombe à poser" },
  { layout: "tutIce", colors: 4, goals: "ice", title: "Le Gel", tutorial: "ice" },
  { layout: "iceBand", colors: 5, goals: "ice" },
  { layout: "hourglass", colors: 5, goals: "c2:30" },
  { layout: "iceRing", colors: 5, goals: "ice" },
  { layout: "iceCorners", colors: 5, goals: "ice" },
  { layout: "donut", colors: 5, goals: "c4:30+c1:30", title: "L'Arc-en-ciel" },
  { layout: "iceBand", colors: 5, goals: "ice+c0:24" },
  { layout: "iceDiamond", colors: 5, goals: "ice" },
  // 21–30
  { layout: "corners", colors: 5, goals: "c3:34" },
  { layout: "iceRing", colors: 5, goals: "ice+c2:20" },
  { layout: "twin", colors: 5, goals: "s:7000" },
  { layout: "iceCorners", colors: 5, goals: "ice+c1:22" },
  { layout: "open9", colors: 5, goals: "c0:36", title: "La Croix de feu" },
  { layout: "iceFloor", colors: 5, goals: "ice" },
  { layout: "pillars", colors: 5, goals: "c4:40" },
  { layout: "iceBand", colors: 5, goals: "ice+s:6000" },
  { layout: "diamond", colors: 5, goals: "c2:32+c3:32" },
  { layout: "iceDiamond", colors: 5, goals: "ice+c0:24" },
  // 31–40 : les Caisses (33)
  { layout: "open9", colors: 5, goals: "c1:34" },
  { layout: "hourglass", colors: 5, goals: "c0:36", title: "Le Mélangeur" },
  { layout: "tutCrate", colors: 4, goals: "crate", title: "Les Caisses", tutorial: "crate" },
  { layout: "crateRows", colors: 5, goals: "crate" },
  { layout: "crateRows", colors: 5, goals: "crate+c3:20" },
  { layout: "crateBlocks", colors: 5, goals: "crate" },
  { layout: "crateIce", colors: 5, goals: "ice" },
  { layout: "crateBlocks", colors: 5, goals: "crate+c2:24" },
  { layout: "corners", colors: 5, goals: "c4:44" },
  { layout: "crateHeavy", colors: 5, goals: "crate", title: "Le Kit de départ" },
  // 41–50
  { layout: "crateRows", colors: 5, goals: "crate" },
  { layout: "iceRing", colors: 5, goals: "ice" },
  { layout: "donut", colors: 5, goals: "s:9000" },
  { layout: "crateIce", colors: 5, goals: "crate+ice" },
  { layout: "crateBlocks", colors: 5, goals: "crate+c0:26" },
  { layout: "iceFloor", colors: 5, goals: "ice+c1:20" },
  { layout: "crateHeavy", colors: 5, goals: "crate+c3:20" },
  { layout: "twin", colors: 5, goals: "c2:36+c4:36" },
  { layout: "iceCorners", colors: 5, goals: "ice+s:7000" },
  { layout: "crateIce", colors: 5, goals: "crate+ice+c0:16" },
  // 51–60 : les Chaînes (52)
  { layout: "open9", colors: 5, goals: "c3:40" },
  { layout: "tutChain", colors: 4, goals: "chain", title: "Les Chaînes", tutorial: "chain" },
  { layout: "chainLines", colors: 5, goals: "chain" },
  { layout: "chainLines", colors: 5, goals: "chain+c1:24" },
  { layout: "crateRows", colors: 5, goals: "crate+c4:24" },
  { layout: "chainIce", colors: 5, goals: "chain" },
  { layout: "chainIce", colors: 5, goals: "chain+ice" },
  { layout: "diamond", colors: 6, goals: "c0:30" },
  { layout: "chainLines", colors: 5, goals: "chain+s:6000" },
  { layout: "chainIce", colors: 5, goals: "chain+ice+c2:16" },
  // 61–70
  { layout: "corners", colors: 5, goals: "c1:44" },
  { layout: "crateBlocks", colors: 5, goals: "crate+c3:28" },
  { layout: "iceDiamond", colors: 5, goals: "ice+c4:20" },
  { layout: "chainLines", colors: 6, goals: "chain" },
  { layout: "pillars", colors: 6, goals: "c2:32+c0:32" },
  { layout: "crateHeavy", colors: 5, goals: "crate+s:7000" },
  { layout: "chainIce", colors: 6, goals: "chain+ice" },
  { layout: "iceBand", colors: 6, goals: "ice+c3:24" },
  { layout: "hourglass", colors: 6, goals: "c4:36" },
  { layout: "crateIce", colors: 6, goals: "crate+ice" },
  // 71–80 : les objets à faire descendre (71)
  { layout: "tutDrop", colors: 4, goals: "drop:2", title: "Les Graines de lumière", tutorial: "drop" },
  { layout: "dropOpen", colors: 5, goals: "drop:3" },
  { layout: "dropOpen", colors: 5, goals: "drop:3+c1:20" },
  { layout: "dropCrates", colors: 5, goals: "drop:3" },
  { layout: "dropOpen", colors: 5, goals: "drop:4" },
  { layout: "chainLines", colors: 5, goals: "chain+c0:24" },
  { layout: "dropCrates", colors: 5, goals: "drop:4+crate" },
  { layout: "dropOpen", colors: 6, goals: "drop:3" },
  { layout: "iceRing", colors: 6, goals: "ice+c2:24" },
  { layout: "dropCrates", colors: 6, goals: "drop:4" },
  // 81–90
  { layout: "open9", colors: 5, goals: "c3:44" },
  { layout: "dropOpen", colors: 5, goals: "drop:4+c4:20" },
  { layout: "crateBlocks", colors: 6, goals: "crate" },
  { layout: "chainIce", colors: 5, goals: "chain+ice+c1:20" },
  { layout: "dropCrates", colors: 5, goals: "drop:3+crate" },
  { layout: "iceFloor", colors: 6, goals: "ice" },
  { layout: "dropOpen", colors: 6, goals: "drop:5" },
  { layout: "crateHeavy", colors: 6, goals: "crate" },
  { layout: "twin", colors: 6, goals: "s:9000" },
  { layout: "crateIce", colors: 6, goals: "crate+ice+c0:20" },
  // 91–100 : les Cages (92)
  { layout: "corners", colors: 5, goals: "c2:40" },
  { layout: "tutCage", colors: 4, goals: "cage", title: "Les Cages", tutorial: "cage" },
  { layout: "cageGrid", colors: 5, goals: "cage" },
  { layout: "cageGrid", colors: 5, goals: "cage+c3:24" },
  { layout: "dropOpen", colors: 5, goals: "drop:4" },
  { layout: "cageIce", colors: 5, goals: "cage" },
  { layout: "cageIce", colors: 5, goals: "cage+ice" },
  { layout: "chainLines", colors: 6, goals: "chain+c4:24" },
  { layout: "cageGrid", colors: 6, goals: "cage+s:7000" },
  { layout: "cageIce", colors: 6, goals: "cage+ice" },
  // 101–110
  { layout: "open9", colors: 5, goals: "c0:46" },
  { layout: "dropCrates", colors: 5, goals: "drop:4+crate" },
  { layout: "cageGrid", colors: 5, goals: "cage+c1:28" },
  { layout: "iceDiamond", colors: 6, goals: "ice" },
  { layout: "crateBlocks", colors: 6, goals: "crate+c2:24" },
  { layout: "chainIce", colors: 6, goals: "chain+ice" },
  { layout: "cageIce", colors: 6, goals: "cage+ice+c3:16" },
  { layout: "dropOpen", colors: 6, goals: "drop:5+c4:16" },
  { layout: "diamond", colors: 6, goals: "c0:30+c1:30" },
  { layout: "crateIce", colors: 6, goals: "crate+ice" },
  // 111–120 : le Lierre (112)
  { layout: "corners", colors: 5, goals: "c2:44" },
  { layout: "tutIvy", colors: 4, goals: "ivy:0", title: "Le Lierre", tutorial: "ivy" },
  { layout: "ivyCorners", colors: 5, goals: "ivy:0" },
  { layout: "ivyCorners", colors: 5, goals: "ivy:0+c3:20" },
  { layout: "ivyCrates", colors: 5, goals: "ivy:0" },
  { layout: "cageGrid", colors: 5, goals: "cage+c4:24" },
  { layout: "ivyCrates", colors: 5, goals: "ivy:0+crate" },
  { layout: "dropCrates", colors: 6, goals: "drop:4" },
  { layout: "ivyCorners", colors: 6, goals: "ivy:0" },
  { layout: "ivyCrates", colors: 6, goals: "ivy:0+crate" },
  // 121–130
  { layout: "open9", colors: 5, goals: "c1:46" },
  { layout: "mixA", colors: 5, goals: "ice+cage" },
  { layout: "mixA", colors: 5, goals: "ice+chain" },
  { layout: "mixB", colors: 5, goals: "chain+ice" },
  { layout: "ivyCrates", colors: 5, goals: "ivy:0+c2:20" },
  { layout: "mixC", colors: 5, goals: "drop:3+chain" },
  { layout: "mixA", colors: 6, goals: "ice+crate" },
  { layout: "mixB", colors: 5, goals: "crate+ice+c0:16" },
  { layout: "mixC", colors: 6, goals: "drop:3" },
  { layout: "mixB", colors: 6, goals: "chain+ice+crate" },
  // 131–140
  { layout: "corners", colors: 5, goals: "c3:46" },
  { layout: "crateIce", colors: 5, goals: "crate+ice", title: "Caisses sur la glace" },
  { layout: "cageIce", colors: 5, goals: "cage+ice+c1:20" },
  { layout: "mixC", colors: 5, goals: "drop:4+crate" },
  { layout: "ivyCorners", colors: 6, goals: "ivy:0+c4:20" },
  { layout: "mixA", colors: 6, goals: "ice+cage+chain" },
  { layout: "iceDiamond", colors: 6, goals: "ice+s:9000" },
  { layout: "dropCrates", colors: 6, goals: "drop:5+crate" },
  { layout: "chainIce", colors: 6, goals: "chain+ice+c2:20" },
  { layout: "mixB", colors: 6, goals: "chain+ice+crate+c3:12" },
  // 141–150
  { layout: "open9", colors: 6, goals: "c0:40" },
  { layout: "cageGrid", colors: 6, goals: "cage+c4:24" },
  { layout: "ivyCrates", colors: 6, goals: "ivy:0+crate" },
  { layout: "mixA", colors: 6, goals: "ice+crate+cage" },
  { layout: "crateHeavy", colors: 6, goals: "crate+c1:24" },
  { layout: "mixC", colors: 6, goals: "drop:4+chain" },
  { layout: "iceFloor", colors: 6, goals: "ice+c2:20" },
  { layout: "cageIce", colors: 6, goals: "cage+ice" },
  { layout: "diamond", colors: 6, goals: "c3:36+c4:36" },
  { layout: "mixB", colors: 6, goals: "chain+ice+crate+s:8000", title: "Le grand jardin" },
];

export function expandLayout(name: string): string[] {
  const rows = LAYOUTS[name];
  if (!rows) throw new Error(`grille inconnue : ${name}`);
  return rows.map((r) => [...r].map((c) => {
    const t = CHAR[c];
    if (t === undefined) throw new Error(`caractère inconnu « ${c} » dans ${name}`);
    return t;
  }).join(" "));
}

function countToken(layout: string[], pred: (t: string) => boolean): number {
  return layout.flatMap((r) => r.split(" ")).filter(pred).length;
}

/** Parcours d'introduction : les 15 premiers niveaux sont plus généreux ; un tutoriel est toujours facile. */
export function handmadeTarget(n: number, d: Design): { difficulty: Difficulty; target: number } {
  if (d.tutorial) return { difficulty: "relax", target: 0.95 };
  if (n <= 10) return { difficulty: "relax", target: 0.92 };
  if (n <= 15) return { difficulty: "easy", target: TARGET_RATE.easy };
  const difficulty = difficultyOf(n);
  return { difficulty, target: TARGET_RATE[difficulty] };
}

/** Candidat pour un niveau fait main. `scale` ne module que la collecte, le score et le nombre d'objets. */
export function buildHandmade(n: number, attempt: number, scale: number): Candidate {
  const d = DESIGNS[n - 1];
  if (!d) throw new Error(`niveau ${n} non conçu`);
  const layout = expandLayout(d.layout);
  const goals: Goal[] = [];
  let drops: LevelSpec["drops"];
  for (const part of d.goals.split("+")) {
    const [kind, arg] = part.split(":");
    if (kind.startsWith("c") && kind.length === 2) goals.push({ type: "collect", color: Number(kind[1]), count: Math.max(6, Math.round(Number(arg) * scale)) });
    else if (kind === "s") goals.push({ type: "score", target: Math.max(1000, Math.round((Number(arg) * scale) / 100) * 100) });
    else if (kind === "drop") {
      const total = Math.max(1, Math.round(Number(arg) * Math.min(1.5, scale)));
      drops = { total, maxOnBoard: 2 };
      goals.push({ type: "drop", count: total });
    } else if (kind === "ice") goals.push({ type: "clear", target: "ice", count: countToken(layout, (t) => /^i\d/.test(t)) });
    else if (kind === "crate") goals.push({ type: "clear", target: "crate", count: countToken(layout, (t) => /X\d$/.test(t)) });
    else if (kind === "chain") goals.push({ type: "clear", target: "chain", count: countToken(layout, (t) => t.includes("k")) });
    else if (kind === "cage") goals.push({ type: "clear", target: "cage", count: countToken(layout, (t) => t.startsWith("g")) });
    // Lierre : détruire autant de lierre qu'il y en a au départ (toujours faisable, même si on l'élimine avant qu'il pousse).
    else if (kind === "ivy") goals.push({ type: "clear", target: "ivy", count: countToken(layout, (t) => t === "V") });
    else throw new Error(`objectif inconnu « ${part} » (niveau ${n})`);
  }
  // Niveau trop facile dont les objectifs sont fixés par la grille : on ajoute une collecte proportionnelle.
  const scalable = goals.some((g) => g.type === "collect" || g.type === "score" || g.type === "drop");
  if (!scalable && scale > 1.01) goals.push({ type: "collect", color: n % d.colors, count: Math.round((18 * (scale - 1)) / 0.25) });
  const seed = levelSeed(n, CONTENT_VERSION, attempt);
  return {
    spec: { width: layout[0].split(" ").length, height: layout.length, layout, colors: d.colors, moves: 0, goals, drops, seed },
    difficulty: handmadeTarget(n, d).difficulty,
    shape: d.layout,
    goalKind: goals.length > 1 ? "mixed" : goals[0].type === "clear" ? "clear" : (goals[0].type as Candidate["goalKind"]),
  };
}

/** Calibre un niveau fait main (coups) ; les tutoriels acceptent un budget plus court. */
export function designLevel(n: number, opts: GenerateOptions = DEFAULT_GENERATE): GeneratedLevel {
  const d = DESIGNS[n - 1];
  const { difficulty, target } = handmadeTarget(n, d);
  const o: GenerateOptions = { ...opts, minMoves: n <= 15 ? 10 : 12, cap: 60 };
  return generateLevel(n, o, buildHandmade, { difficulty, target, source: "handmade", title: d.title, tutorial: d.tutorial });
}
