import type { LevelSpec } from "@helios/core";

/**
 * NIVEAUX PROVISOIRES pour tester l'interface. Ils seront remplacés au livrable 4
 * par les niveaux 1–150 faits main et le générateur validé par le bot.
 * Le niveau N est identique pour tous les joueurs (FAIR-01) : il ne dépend que de N.
 */
export const DEMO_LEVEL_COUNT = 45;

const MASKS: (string[] | undefined)[] = [
  undefined,
  ["#.......#", ".........", ".........", ".........", "....#....", ".........", ".........", ".........", "#.......#"],
  ["..#####..", ".........", ".........", ".........", ".........", ".........", ".........", ".........", "..#####.."],
];

export type Difficulty = "normal" | "hard" | "veryHard";

export function difficultyOf(n: number): Difficulty {
  const k = ((n - 1) % 10) + 1;
  return k === 7 ? "hard" : k === 10 ? "veryHard" : "normal";
}

export function levelSpec(n: number): LevelSpec {
  const mask = n <= 3 ? undefined : MASKS[n % MASKS.length];
  const colors = n <= 10 ? 4 : n <= 30 ? 5 : 6;
  const diff = difficultyOf(n);
  const moves = diff === "veryHard" ? 18 : diff === "hard" ? 20 : 24;
  const goals: LevelSpec["goals"] =
    n % 3 === 0
      ? [{ type: "score", target: 2500 + n * 60 }]
      : [{ type: "collect", color: n % colors, count: 18 + n }, ...(n > 15 ? [{ type: "collect" as const, color: (n + 2) % colors, count: 12 + n }] : [])];
  return { width: 9, height: 9, mask, colors, moves, goals, seed: `demo-${n}:v0` };
}
