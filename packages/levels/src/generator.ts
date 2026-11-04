import { createGame, hashString, nextInt, pick, seedRng, type Goal, type LevelSpec, type ObstacleKind, type RngState } from "@helios/core";
import { calibrate, runMonteCarlo } from "@helios/bot";
import { background, CONTENT_VERSION, difficultyOf, ELEMENT_UNLOCK, introAt, TARGET_RATE, TOLERANCE, VARIANT_UNLOCK, type Difficulty, type LevelFile } from "./schema";
import { ALL_SHAPES, OPEN_SHAPES, PORTAL_SHAPES, ringLoop, SHAPES } from "./shapes";

/**
 * Générateur procédural déterministe des niveaux 151–10 000.
 * Tout dépend de (N, CONTENT_VERSION, tentative, échelle) — jamais du joueur (FAIR-01).
 */

export function levelSeed(n: number, version = CONTENT_VERSION, attempt = 0): string {
  return `L${n}v${version}a${attempt}:${hashString(`helios-discovery:${n}:${version}:${attempt}`)}`;
}

/** Une forme est compatible « objets à faire descendre » si toutes ses sorties sont sur la dernière ligne. */
function exitsOnBottomRow(mask: string[]): boolean {
  const h = mask.length, w = mask[0].length;
  for (let y = 0; y < h - 1; y++)
    for (let x = 0; x < w; x++) if (mask[y][x] === "." && mask[y + 1][x] !== ".") return false;
  return true;
}

type GoalKind = "collect" | "clear" | "drop" | "score" | "mixed";

export interface Candidate {
  spec: LevelSpec;
  difficulty: Difficulty;
  shape: string;
  goalKind: GoalKind;
  /** Clé de tutoriel quand le niveau introduit un élément. */
  tutorial?: string;
}

/** Obstacles disponibles au niveau N. */
export function availableObstacles(n: number): ObstacleKind[] {
  return (["ice", "crate", "chain", "cage", "ivy", "bubble", "chest"] as ObstacleKind[]).filter((k) => n >= ELEMENT_UNLOCK[k]);
}

/** Place `count` cases tirées au hasard parmi `pool`, en miroir gauche-droite quand c'est possible. */
function placeMirrored(rng: RngState, pool: number[], width: number, count: number, taken: Set<number>): number[] {
  const out: number[] = [];
  const free = pool.filter((i) => !taken.has(i));
  for (let guard = 0; out.length < count && free.length > 0 && guard < 500; guard++) {
    const i = free.splice(nextInt(rng, free.length), 1)[0];
    const x = i % width, mirror = i - x + (width - 1 - x);
    out.push(i);
    taken.add(i);
    if (out.length < count && mirror !== i && !taken.has(mirror) && pool.includes(mirror)) {
      out.push(mirror);
      taken.add(mirror);
      free.splice(free.indexOf(mirror), 1);
    }
  }
  return out;
}

/**
 * Construit un niveau candidat. `scale` module la quantité d'objectifs et d'obstacles
 * (ajusté par la validation quand le niveau sort de la fourchette visée).
 */
export function buildCandidate(n: number, attempt: number, scale: number): Candidate {
  const seed = levelSeed(n, CONTENT_VERSION, attempt);
  const rng = seedRng(`${seed}:design`);
  const D = background(n);
  // Niveau d'introduction d'un élément (≥ 151) : tutoriel facile, élément imposé.
  const intro = n > 150 ? introAt(n) : null;
  const difficulty: Difficulty = intro ? "relax" : difficultyOf(n);
  const obstacles = availableObstacles(n);

  const weights: [GoalKind, number][] = [["collect", 30], ["clear", obstacles.length ? 40 : 0], ["drop", n >= ELEMENT_UNLOCK.drop ? 14 : 0], ["score", 6], ["mixed", obstacles.length ? 10 : 0]];
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let roll = nextInt(rng, total);
  let goalKind: GoalKind = "collect";
  for (const [k, w] of weights) if ((roll -= w) < 0) { goalKind = k; break; }
  let forcedClear: ObstacleKind | null = null;
  if (intro === "portal") goalKind = "drop";
  else if (intro === "conveyor" || intro === "portalConveyor") goalKind = "collect";
  else if (intro === "generator") { goalKind = "clear"; forcedClear = "bubble"; }
  else if (intro === "chest" || intro === "chest2") { goalKind = "clear"; forcedClear = "chest"; }
  else if (intro === "crateGenerator") { goalKind = "clear"; forcedClear = "crate"; }

  // Forme : à portails (≥ 152, 15 % des niveaux, ou imposée par un tutoriel), sinon forme classique.
  const usePortal = n >= ELEMENT_UNLOCK.portal && (intro === "portal" || intro === "portalConveyor" || (!intro && nextInt(rng, 100) < 15));
  let shape: string;
  let mask: string[];
  let portals: [number, number][] | undefined;
  if (usePortal) {
    shape = pick(rng, Object.keys(PORTAL_SHAPES));
    mask = PORTAL_SHAPES[shape].mask;
    const w = mask[0].length;
    portals = PORTAL_SHAPES[shape].portals.map(([x1, y1, x2, y2]) => [y1 * w + x1, y2 * w + x2]);
  } else {
    let shapePool = difficulty === "relax" || n < 300 ? OPEN_SHAPES : ALL_SHAPES;
    if (goalKind === "drop") shapePool = shapePool.filter((s) => exitsOnBottomRow(SHAPES[s]));
    shape = pick(rng, shapePool);
    mask = SHAPES[shape];
  }
  const height = mask.length, width = mask[0].length;
  const tokens: string[] = mask.flatMap((r) => [...r].map((c) => (c === "." ? "." : "#")));
  const active = tokens.map((t, i) => (t === "." ? i : -1)).filter((i) => i >= 0);
  const cells = active.length;
  const colors = difficulty === "relax" ? 4 + nextInt(rng, 2) : D < 0.55 ? 5 : 5 + nextInt(rng, 2);

  // Tapis roulant : contour d'un rectangle de la moitié basse, seulement si toutes ses cases sont actives.
  let conveyors: number[][] | undefined;
  const useConveyor = n >= ELEMENT_UNLOCK.conveyor && (intro === "conveyor" || intro === "portalConveyor" || (!intro && nextInt(rng, 100) < 15));
  if (useConveyor) {
    const y1 = height - 2, y0 = Math.max(Math.ceil(height / 2), y1 - 2), x0 = Math.floor(width / 2) - 2, x1 = x0 + 4;
    const loop = ringLoop(width, x0, y0, x1, y1);
    if (loop.every((i) => tokens[i] === ".")) conveyors = [loop];
  }
  const loopCells = new Set(conveyors?.flat() ?? []);

  const goals: Goal[] = [];
  const taken = new Set<number>();
  // Les deux lignes du haut restent libres d'obstacles fixes : la grille doit toujours pouvoir se remplir.
  const lowerPool = active.filter((i) => Math.floor(i / width) >= 2);
  // Générateurs et coffres bloqueraient un tapis : jamais sur une boucle.
  const fixedPool = lowerPool.filter((i) => !loopCells.has(i));
  let drops: LevelSpec["drops"];

  const addObstacle = (kind: ObstacleKind, density: number, asGoal: boolean) => {
    const count = kind === "chest" ? 2 + nextInt(rng, 2) : Math.max(2, Math.round(cells * density * scale));
    const placed = placeMirrored(rng, kind === "ice" ? active : kind === "chest" ? fixedPool : lowerPool, width, count, taken);
    let goalCount = 0;
    for (const i of placed) {
      if (kind === "ice") {
        const layers = 1 + nextInt(rng, D > 0.7 ? 3 : D > 0.45 ? 2 : 1);
        tokens[i] = `i${layers}.`;
      } else if (kind === "crate") tokens[i] = `X${1 + nextInt(rng, D > 0.7 ? 3 : 2)}`;
      else if (kind === "chain") tokens[i] = "k.";
      else if (kind === "cage") tokens[i] = "g.";
      else if (kind === "ivy") tokens[i] = "V";
      else if (kind === "bubble") tokens[i] = "B";
      else if (kind === "chest") tokens[i] = n >= VARIANT_UNLOCK.chest2 && (intro === "chest2" || nextInt(rng, 2) === 0) ? "C2" : "C";
      goalCount++;
    }
    if (kind === "chest") {
      // Une première clé dans la moitié haute ; les suivantes arrivent avec les nouvelles pièces.
      const top = active.filter((i) => Math.floor(i / width) < height / 2 && tokens[i] === ".");
      if (top.length) tokens[pick(rng, top)] = "y.";
    }
    // Générateurs : de bulles (≥ 191) pour un objectif « bulles », de caisses (≥ 254) pour un objectif « caisses ».
    let extra = 0;
    if (asGoal && kind === "bubble" && n >= ELEMENT_UNLOCK.generator && (intro === "generator" || nextInt(rng, 2) === 0)) {
      for (const g of placeMirrored(rng, fixedPool, width, 1 + nextInt(rng, 2), taken)) { tokens[g] = "G"; extra += 2; }
    }
    if (asGoal && kind === "crate" && n >= VARIANT_UNLOCK.crateGenerator && (intro === "crateGenerator" || nextInt(rng, 100) < 35)) {
      for (const g of placeMirrored(rng, fixedPool, width, 1, taken)) { tokens[g] = "H"; extra += 2; }
    }
    if (asGoal && goalCount > 0) goals.push({ type: "clear", target: kind, count: goalCount + extra });
  };

  const collectCount = () => Math.max(12, Math.round((34 + 40 * D) * scale));
  const density: Record<ObstacleKind, number> = {
    ice: 0.3 + 0.25 * D, crate: 0.16 + 0.12 * D, chain: 0.14 + 0.1 * D, cage: 0.1 + 0.08 * D, ivy: 0.05 + 0.04 * D, bubble: 0.08 + 0.06 * D, chest: 0,
  };

  if (goalKind === "collect" || goalKind === "mixed") {
    const nColors = goalKind === "collect" && D > 0.4 && nextInt(rng, 2) === 0 ? 2 : 1;
    const picked = new Set<number>();
    while (picked.size < nColors) picked.add(nextInt(rng, colors));
    for (const c of picked) goals.push({ type: "collect", color: c, count: Math.round(collectCount() / (nColors === 2 ? 1.5 : 1)) });
  }
  if (goalKind === "clear" || goalKind === "mixed") {
    const kind = forcedClear ?? pick(rng, obstacles);
    addObstacle(kind, density[kind] * (goalKind === "mixed" ? 0.6 : 1), true);
  }
  if (goalKind === "drop") {
    const totalDrops = Math.max(2, Math.round((2 + 2 * D) * scale));
    drops = { total: totalDrops, maxOnBoard: 2 };
    goals.push({ type: "drop", count: totalDrops });
    const top = active.filter((i) => i < width && tokens[i] === ".");
    tokens[pick(rng, top)] = "D";
  }
  if (goalKind === "score") goals.push({ type: "score", target: Math.round((5000 + 9000 * D) * scale / 100) * 100 });

  // Obstacle décoratif (non objectif) pour varier, à partir de N = 151 uniquement (jamais dans un tutoriel).
  const decor = obstacles.filter((k) => k !== "ivy" && k !== "chest" && !goals.some((g) => g.type === "clear" && g.target === k));
  if (n >= 151 && !intro && decor.length > 0 && nextInt(rng, 10) < 3 && difficulty !== "relax") addObstacle(pick(rng, decor), 0.05, false);

  const layout: string[] = [];
  for (let y = 0; y < height; y++) layout.push(tokens.slice(y * width, (y + 1) * width).join(" "));
  return { spec: { width, height, layout, colors, moves: 0, goals, drops, seed, portals, conveyors }, difficulty, shape, goalKind, tutorial: intro ?? undefined };
}

export interface GenerateOptions {
  runs: number;
  cap: number;
  minMoves: number;
  maxAttempts: number;
  /** Parties de contrôle hors échantillon (0 = pas d'audit). */
  auditRuns: number;
}

export const DEFAULT_GENERATE: GenerateOptions = { runs: 200, cap: 50, minMoves: 16, maxAttempts: 10, auditRuns: 0 };

export interface GeneratedLevel {
  level: LevelFile;
  shape: string;
  goalKind: GoalKind;
  attempts: number;
  mcChecked: boolean;
}

/**
 * Génère et valide le niveau N :
 *  1. pré-test sur 40 parties pour écarter vite un candidat très hors cible ;
 *  2. calibrage des coups sur `runs` parties ;
 *  3. si aucune victoire du glouton : preuve de faisabilité par Monte-Carlo, sinon rejet ;
 *  4. hors fourchette : ajuste l'échelle des objectifs et régénère (tentative suivante).
 */
export interface LevelMeta {
  difficulty: Difficulty;
  target: number;
  source: LevelFile["source"];
  title?: string;
  tutorial?: string;
}

export function generateLevel(n: number, opts: GenerateOptions = DEFAULT_GENERATE, build = buildCandidate, meta?: LevelMeta): GeneratedLevel {
  const introKey = n > 150 ? introAt(n) : null;
  const difficulty = meta?.difficulty ?? (introKey ? "relax" : difficultyOf(n));
  const target = meta?.target ?? (introKey ? 0.95 : TARGET_RATE[difficulty]);
  let scale = 1;
  let best: { cand: Candidate; cal: ReturnType<typeof calibrate>; attempt: number; scale: number; mc: boolean } | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    attempts = attempt + 1;
    const usedScale = scale;
    const cand = build(n, attempt, usedScale);
    try {
      createGame({ ...cand.spec, moves: 1 });
    } catch {
      continue; // layout non remplissable : tentative suivante
    }
    // À partir de la 4e tentative, le plafond de coups monte de 10 : un niveau long vaut mieux qu'un niveau sous la cible.
    const cap = attempt >= 3 ? opts.cap + 10 : opts.cap;
    const pilot = calibrate(cand.spec, target, { runs: 40, cap, minMoves: opts.minMoves });
    if (pilot.wins === 0 || Math.abs(pilot.rate - target) > TOLERANCE + 0.15) {
      if (pilot.wins === 0 || pilot.rate < target) scale *= pilot.wins === 0 ? 0.6 : 0.8;
      else scale *= 1.3;
      if (!best || (best.cal.wins === 0 && pilot.wins > 0)) best = { cand, cal: pilot, attempt, scale: usedScale, mc: false };
      continue;
    }
    const cal = calibrate(cand.spec, target, { runs: opts.runs, cap, minMoves: opts.minMoves });
    let mc = false;
    if (cal.wins === 0) {
      mc = true;
      let mcWins = 0;
      for (let r = 0; r < 6 && mcWins === 0; r++) if (runMonteCarlo(cand.spec, `${cand.spec.seed}:mc:${r}`, cap).won) mcWins++;
      if (mcWins === 0) { scale *= 0.6; continue; } // infaisable sans booster : rejeté
    }
    // Acceptation : taux dans [cible, cible + tolérance]. Jamais sous la cible (protège FAIR-02).
    const accepted = cal.wins > 0 && cal.rate >= target - 1e-9 && cal.rate <= target + TOLERANCE;
    const err = cal.rate < target ? (target - cal.rate) * 3 : cal.rate - target; // être sous la cible coûte plus
    const bestErr = best ? (best.cal.rate < target ? (target - best.cal.rate) * 3 : best.cal.rate - target) : Infinity;
    if (!best || best.cal.wins === 0 || best.cal.movesToWin.length < opts.runs || err < bestErr) best = { cand, cal, attempt, scale: usedScale, mc };
    if (accepted) break;
    scale *= cal.rate < target ? 0.8 : 1.25;
  }
  if (!best || best.cal.wins === 0) throw new Error(`niveau ${n} : aucun candidat faisable`);
  // Le meilleur candidat n'a eu qu'un pré-test : calibrage complet.
  if (best.cal.movesToWin.length < opts.runs) best.cal = calibrate(best.cand.spec, target, { runs: opts.runs, cap: best.attempt >= 3 ? opts.cap + 10 : opts.cap, minMoves: opts.minMoves });
  if (best.cal.wins === 0) throw new Error(`niveau ${n} : aucun candidat faisable`);
  const { cand, cal } = best;
  let auditRate: number | undefined;
  if (opts.auditRuns > 0) {
    const audit = calibrate({ ...cand.spec }, target, { runs: opts.auditRuns, cap: cal.moves, minMoves: cal.moves, botSalt: "audit:" });
    auditRate = audit.rate;
  }
  const level: LevelFile = {
    n,
    version: CONTENT_VERSION,
    source: meta?.source ?? "generated",
    ...(meta?.title ? { title: meta.title } : {}),
    ...(meta?.tutorial ?? cand.tutorial ? { tutorial: meta?.tutorial ?? cand.tutorial } : {}),
    difficulty,
    targetRate: target,
    width: cand.spec.width,
    height: cand.spec.height,
    layout: cand.spec.layout!,
    colors: cand.spec.colors,
    moves: cal.moves,
    goals: cand.spec.goals,
    ...(cand.spec.drops ? { drops: cand.spec.drops } : {}),
    ...(cand.spec.portals ? { portals: cand.spec.portals } : {}),
    ...(cand.spec.conveyors ? { conveyors: cand.spec.conveyors } : {}),
    seed: cand.spec.seed,
    attempt: best.attempt,
    scale: best.scale,
    validation: {
      runs: cal.movesToWin.length,
      botRate: cal.rate,
      avgMovesLeft: Math.round(cal.avgMovesLeft * 100) / 100,
      status: cal.rate >= target - 1e-9 && cal.rate <= target + TOLERANCE ? "ok" : "out_of_range",
      ...(auditRate !== undefined ? { auditRate } : {}),
    },
  };
  return { level, shape: cand.shape, goalKind: cand.goalKind, attempts, mcChecked: best.mc };
}

/** Empreinte du contenu jouable d'un niveau (contrôle de régénération à l'exécution). */
export function levelHash(l: Pick<LevelFile, "width" | "height" | "layout" | "colors" | "moves" | "goals" | "drops" | "seed" | "portals" | "conveyors">): string {
  return hashString(JSON.stringify([l.width, l.height, l.layout, l.colors, l.moves, l.goals, l.drops ?? null, l.seed, l.portals ?? null, l.conveyors ?? null]));
}
