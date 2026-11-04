import type { LevelSpec } from "@helios/core";
import { buildCandidate, levelHash, toSpec, type LevelFile } from "@helios/levels";

/**
 * Niveaux du jeu.
 *  - 1–150 : fichiers JSON faits main (packages/levels/data/handmade), inclus dans le build.
 *  - 151+  : régénérés à l'identique à partir du manifeste (tentative, échelle, coups, empreinte) produit
 *            par `generate --validate`. Le manifeste est chargé à la demande pour alléger le démarrage.
 * Le niveau N ne dépend que de N et de la version de contenu : jamais du joueur (FAIR-01).
 */
const handmade = import.meta.glob<LevelFile>("../../../../packages/levels/data/handmade/[0-9][0-9][0-9].json", { eager: true, import: "default" });
const manifestLoaders = import.meta.glob<{ version: number; from: number; to: number; levels: [number, number, number, number, string][] }>(
  "../../../../packages/levels/data/generated/manifest.json",
  { import: "default" },
);

const HANDMADE: LevelFile[] = Object.values(handmade).sort((a, b) => a.n - b.n);
export const HANDMADE_COUNT = HANDMADE.length;

let generated: Map<number, [number, number, number, number, string]> | null = null;
let generatedTo = 0;

/** Charge le manifeste des niveaux générés (sans effet s'il est absent du build). */
export async function loadGeneratedLevels(): Promise<void> {
  const loader = Object.values(manifestLoaders)[0];
  if (!loader || generated) return;
  const m = await loader();
  generated = new Map(m.levels.map((e) => [e[0], e]));
  generatedTo = m.to;
}

export function levelCount(): number {
  return Math.max(HANDMADE_COUNT, generatedTo);
}

const cache = new Map<number, LevelFile>();

export function levelFile(n: number): LevelFile {
  const hit = cache.get(n);
  if (hit) return hit;
  let file: LevelFile;
  if (n <= HANDMADE_COUNT) file = HANDMADE[n - 1];
  else {
    const e = generated?.get(n);
    if (!e) throw new Error(`niveau ${n} indisponible`);
    const [, attempt, scale, moves, hash] = e;
    const cand = buildCandidate(n, attempt, scale);
    file = {
      n, version: 1, source: "generated", difficulty: cand.difficulty, targetRate: 0,
      width: cand.spec.width, height: cand.spec.height, layout: cand.spec.layout!, colors: cand.spec.colors, moves,
      goals: cand.spec.goals, ...(cand.spec.drops ? { drops: cand.spec.drops } : {}), seed: cand.spec.seed, attempt, scale,
      validation: { runs: 0, botRate: 0, avgMovesLeft: 0, status: "ok" },
    };
    if (levelHash(file) !== hash) console.error(`niveau ${n} : empreinte différente du niveau validé (version de contenu ?)`);
  }
  cache.set(n, file);
  return file;
}

export type Difficulty = "normal" | "hard" | "veryHard";

/** Badge affiché : Difficile ou Très difficile (cahier des charges §4). */
export function difficultyOf(n: number): Difficulty {
  if (n > levelCount()) return "normal";
  const d = levelFile(n).difficulty;
  return d === "hard" ? "hard" : d === "veryHard" ? "veryHard" : "normal";
}

/**
 * Spécification jouable du niveau N. `attempt` (numéro d'essai sur ce niveau) ne change que la suite
 * des pièces qui tombent, jamais la grille de départ ni les objectifs.
 */
export function levelSpec(n: number, attempt = 0): LevelSpec {
  return { ...toSpec(levelFile(n)), playSeed: String(attempt) };
}
