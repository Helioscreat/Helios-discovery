import { describe, expect, it } from "vitest";
import { applyMoveInPlace, createGame, hashState, seedRng, type LevelSpec } from "@helios/core";
import { calibrate, greedyChoice, rateAt, runGreedy, runMonteCarlo } from "../src";

const spec: LevelSpec = { width: 8, height: 8, colors: 5, moves: 99, goals: [{ type: "collect", color: 1, count: 30 }], seed: "bot-test" };

describe("bot glouton", () => {
  it("déterministe pour une graine de bot donnée", () => {
    expect(runGreedy(spec, "b1", 40)).toEqual(runGreedy(spec, "b1", 40));
  });

  it("ne consomme pas le PRNG de la partie pour décider", () => {
    const st = createGame(spec);
    const before = JSON.stringify(st.rng);
    greedyChoice(st, seedRng("x"));
    expect(JSON.stringify(st.rng)).toBe(before);
  });

  it("propriété clé du calibrage : le budget de coups ne change pas le déroulé de la partie", () => {
    // Même graine de bot, budgets 15 et 60 : les 15 premiers coups sont identiques.
    const a = createGame({ ...spec, moves: 15 }), b = createGame({ ...spec, moves: 60 });
    const ra = seedRng("same"), rb = seedRng("same");
    for (let k = 0; k < 14; k++) {
      // Après une victoire, le bonus de fin dépend des coups restants : le calibrage s'arrête à la victoire.
      if (a.status !== "playing" || b.status !== "playing") {
        expect(a.status).toBe(b.status);
        expect(a.moveCount).toBe(b.moveCount);
        break;
      }
      applyMoveInPlace(a, greedyChoice(a, ra)!);
      applyMoveInPlace(b, greedyChoice(b, rb)!);
      expect(a.status).toBe(b.status);
      if (a.status === "playing") expect(hashState({ ...a, movesLeft: 0 })).toBe(hashState({ ...b, movesLeft: 0 }));
    }
  });

  it("joue mieux que le hasard (vise les objectifs)", () => {
    let wins = 0;
    for (let r = 0; r < 20; r++) if (runGreedy(spec, `w${r}`, 30).won) wins++;
    expect(wins).toBeGreaterThan(5);
  });
});

describe("calibrage", () => {
  it("rateAt compte les parties gagnées en ≤ M coups", () => {
    expect(rateAt([10, 12, Infinity, 20], 12)).toBe(0.5);
    expect(rateAt([10, 12, Infinity, 20], 9)).toBe(0);
  });

  it("le budget choisi est le plus petit qui atteint la cible (borne basse)", () => {
    const c = calibrate(spec, 0.6, { runs: 60, cap: 60, minMoves: 5 });
    expect(c.rate).toBeGreaterThanOrEqual(0.6);
    expect(rateAt(c.movesToWin, c.moves - 1)).toBeLessThan(0.6);
    expect(c.rate).toBe(rateAt(c.movesToWin, c.moves));
  });

  it("validation hors échantillon : de nouvelles parties confirment le taux calibré et la borne basse", () => {
    const c = calibrate(spec, 0.35, { runs: 200, cap: 60, minMoves: 5 });
    const fresh = calibrate({ ...spec }, 0.35, { runs: 200, cap: 60, minMoves: 5, botSalt: "audit" });
    const audit = rateAt(fresh.movesToWin, c.moves);
    expect(Math.abs(audit - c.rate)).toBeLessThan(0.1); // parties indépendantes : écart-type ≈ 3,5 points
    expect(audit).toBeGreaterThan(0.35 - 0.08);
  });
});

describe("bot Monte-Carlo", () => {
  it("gagne au moins aussi souvent que le glouton sur un niveau serré", () => {
    const tight: LevelSpec = { ...spec, goals: [{ type: "collect", color: 1, count: 45 }] };
    let g = 0, mc = 0;
    for (let r = 0; r < 6; r++) {
      if (runGreedy(tight, `t${r}`, 22).won) g++;
      if (runMonteCarlo(tight, `t${r}`, 22).won) mc++;
    }
    expect(mc).toBeGreaterThanOrEqual(g);
  });
});
