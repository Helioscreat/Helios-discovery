import {
  applyMoveInPlace, cloneState, createGame, goalContext, goalTarget, listValidMoves, moveValue, nextInt, nextU32, seedRng,
  type GameState, type LevelSpec, type Move, type RngState,
} from "@helios/core";

/**
 * Bots de validation des niveaux.
 *
 * Règle essentielle : la politique des bots ne dépend JAMAIS des coups restants. Une partie jouée avec
 * un budget de coups élevé est donc identique, coup pour coup, à la même partie jouée avec un budget M,
 * jusqu'au M-ième coup. D'où : taux de réussite(M) = part des parties gagnées en ≤ M coups.
 * Le hasard du bot a sa propre graine et ne consomme jamais le PRNG de la partie.
 */

export interface GreedyOptions {
  /** Probabilité de jouer le meilleur coup ; sinon un coup tiré parmi les `topK` meilleurs. */
  pBest: number;
  topK: number;
}

export const DEFAULT_GREEDY: GreedyOptions = { pBest: 0.7, topK: 4 };

/** Choix d'un coup par le bot glouton stochastique (heuristique orientée objectifs). */
export function greedyChoice(st: GameState, rng: RngState, opts: GreedyOptions = DEFAULT_GREEDY): Move | null {
  const moves = listValidMoves(st);
  if (moves.length === 0) return null;
  const ctx = goalContext(st);
  const scored = moves.map((m) => ({ m, v: moveValue(st, m, ctx) + (nextU32(rng) % 1000) / 1e4 })); // départage aléatoire
  scored.sort((a, b) => b.v - a.v);
  if (nextInt(rng, 1000) < opts.pBest * 1000) return scored[0].m;
  return scored[nextInt(rng, Math.min(opts.topK, scored.length))].m;
}

export interface RunResult {
  won: boolean;
  /** Coups joués jusqu'à la victoire (ou jusqu'au plafond). */
  movesUsed: number;
  /** Avancement moyen des objectifs en fin de partie (0 à 1). */
  progress: number;
}

export function progressShare(st: GameState): number {
  if (st.goals.length === 0) return 1;
  return st.goals.reduce((acc, g, k) => acc + Math.min(1, st.progress[k] / Math.max(1, goalTarget(g))), 0) / st.goals.length;
}

/** Joue une partie complète avec le bot glouton, avec un plafond de `cap` coups. */
export function runGreedy(spec: LevelSpec, botSeed: string, cap: number, opts: GreedyOptions = DEFAULT_GREEDY): RunResult {
  // Chaque partie a sa propre suite de pièces (comme chaque essai d'un joueur) : parties indépendantes.
  const st = createGame({ ...spec, moves: cap, playSeed: botSeed });
  return playOut(st, seedRng(botSeed), opts);
}

function playOut(st: GameState, rng: RngState, opts: GreedyOptions): RunResult {
  while (st.status === "playing") {
    const m = greedyChoice(st, rng, opts);
    if (!m) break;
    applyMoveInPlace(st, m);
  }
  return { won: st.status === "won", movesUsed: st.moveCount, progress: progressShare(st) };
}

export interface MonteCarloOptions {
  /** Coups candidats examinés à chaque tour (les meilleurs selon l'heuristique). */
  candidates: number;
  /** Simulations gloutonnes par candidat. */
  rollouts: number;
}

export const DEFAULT_MC: MonteCarloOptions = { candidates: 4, rollouts: 3 };

/**
 * Bot Monte-Carlo : à chaque tour, simule `rollouts` fins de partie gloutonnes pour chacun des
 * `candidates` meilleurs coups et joue celui qui gagne le plus souvent (puis le plus vite, puis avec le
 * meilleur avancement). Beaucoup plus lent : sert de preuve de faisabilité quand le glouton échoue.
 */
export function runMonteCarlo(spec: LevelSpec, botSeed: string, cap: number, opts: MonteCarloOptions = DEFAULT_MC): RunResult {
  const st = createGame({ ...spec, moves: cap, playSeed: botSeed });
  const rng = seedRng(botSeed);
  while (st.status === "playing") {
    const moves = listValidMoves(st);
    if (moves.length === 0) break;
    const ctx = goalContext(st);
    const top = moves.map((m) => ({ m, v: moveValue(st, m, ctx) })).sort((a, b) => b.v - a.v).slice(0, opts.candidates);
    let best = top[0].m, bestScore = -Infinity;
    for (const { m } of top) {
      let score = 0;
      for (let r = 0; r < opts.rollouts; r++) {
        const sim = cloneState(st);
        sim.rng = [nextU32(rng), nextU32(rng), nextU32(rng), nextU32(rng) | 1]; // futur inconnu du bot
        applyMoveInPlace(sim, m);
        const res = sim.status === "playing" ? playOut(sim, seedRng(`${botSeed}:${st.moveCount}:${r}`), DEFAULT_GREEDY) : { won: sim.status === "won", movesUsed: sim.moveCount, progress: progressShare(sim) };
        score += (res.won ? 1000 - res.movesUsed * 5 : 0) + res.progress * 100;
      }
      if (score > bestScore) [best, bestScore] = [m, score];
    }
    applyMoveInPlace(st, best);
  }
  return { won: st.status === "won", movesUsed: st.moveCount, progress: progressShare(st) };
}

export interface Calibration {
  /** Coups retenus pour le niveau. */
  moves: number;
  /** Taux de réussite du bot avec ce budget (sur les mêmes parties). */
  rate: number;
  /** Coups restants moyens des parties gagnées avec ce budget. */
  avgMovesLeft: number;
  /** Coups nécessaires pour gagner, par partie (Infinity si non gagnée sous le plafond). */
  movesToWin: number[];
  wins: number;
}

/** Taux de réussite pour un budget M, à partir des coups-pour-gagner observés. */
export function rateAt(movesToWin: number[], m: number): number {
  return movesToWin.filter((x) => x <= m).length / movesToWin.length;
}

/**
 * Calibre le nombre de coups d'un niveau : joue `runs` parties gloutonnes (plafond `cap`), puis retient
 * le PLUS PETIT budget M dont le taux de réussite atteint au moins `target` (borne basse, jamais en dessous).
 * Si même le plafond ne l'atteint pas, M = plafond (le générateur rend alors le niveau plus facile).
 * Pourquoi une borne basse plutôt que « le plus proche » : un niveau sous la cible (ex. 12 % pour 20 %)
 * peut bloquer un joueur gratuit plusieurs jours (critère FAIR-02).
 */
export function calibrate(spec: LevelSpec, target: number, opts: { runs: number; cap: number; minMoves: number; botSalt?: string }): Calibration {
  const movesToWin: number[] = [];
  for (let r = 0; r < opts.runs; r++) {
    const res = runGreedy(spec, `${spec.seed}:bot:${opts.botSalt ?? ""}${r}`, opts.cap);
    movesToWin.push(res.won ? res.movesUsed : Infinity);
  }
  const wins = movesToWin.filter(Number.isFinite).length;
  let best = opts.cap;
  for (let m = opts.minMoves; m <= opts.cap; m++) {
    if (rateAt(movesToWin, m) >= target - 1e-9) { best = m; break; }
  }
  const won = movesToWin.filter((x) => x <= best);
  return {
    moves: best,
    rate: rateAt(movesToWin, best),
    avgMovesLeft: won.length ? won.reduce((a, x) => a + (best - x), 0) / won.length : 0,
    movesToWin,
    wins,
  };
}
