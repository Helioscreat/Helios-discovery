import { describe, expect, it } from "vitest";
import {
  applyBooster, applyStarterKit, boostersUnlockedAt, BOOSTER_UNLOCK_LEVEL, createGame, crossLines, findMatches,
  getHint, applyMove, hasValidMove, squareAround, unlockedBoosters,
} from "../src";
import { assertStable, eventsOf, firstCleared, grid, P } from "./helpers";

describe("boosters en jeu", () => {
  it("Marteau : efface exactement la case visée, sans consommer de coup", () => {
    const st = grid(5, 5, {});
    const r = applyBooster(st, "hammer", P(st, 2, 2));
    expect(r.accepted).toBe(true);
    expect(firstCleared(r.events)).toEqual([P(st, 2, 2)]);
    expect(r.state.movesLeft).toBe(st.movesLeft);
    assertStable(r.state);
  });

  it("Marteau sur une spéciale : la déclenche", () => {
    const st = grid(5, 5, { "2,2": "a-" });
    const r = applyBooster(st, "hammer", P(st, 2, 2));
    expect(firstCleared(r.events)).toHaveLength(5);
  });

  it("Bombe : 3x3 au choix", () => {
    const st = grid(5, 5, {});
    const r = applyBooster(st, "bomb", P(st, 0, 0));
    expect(firstCleared(r.events)).toEqual(squareAround(st, P(st, 0, 0), 1));
  });

  it("Croix de feu : ligne + colonne", () => {
    const st = grid(5, 5, {});
    expect(firstCleared(applyBooster(st, "fireCross", P(st, 1, 3)).events)).toEqual(crossLines(st, P(st, 1, 3)));
  });

  it("Arc-en-ciel : efface toute la couleur de la case visée", () => {
    const st = grid(5, 5, { "0,0": "a", "4,4": "a", "2,2": "a" });
    expect(firstCleared(applyBooster(st, "rainbow", P(st, 2, 2)).events)).toEqual([P(st, 0, 0), P(st, 2, 2), P(st, 4, 4)]);
  });

  it("Mélangeur : mélange sans consommer de coup, grille jouable et sans alignement", () => {
    const st = createGame({ width: 8, height: 8, colors: 5, moves: 20, goals: [{ type: "score", target: 1e9 }], seed: "mix" });
    const r = applyBooster(st, "shuffler");
    expect(r.accepted).toBe(true);
    expect(eventsOf(r.events, "shuffle")).toHaveLength(1);
    expect(r.state.movesLeft).toBe(20);
    expect(findMatches(r.state)).toEqual([]);
    expect(hasValidMove(r.state)).toBe(true);
    expect(JSON.stringify(r.state.cells)).not.toBe(JSON.stringify(st.cells));
  });

  it("cible invalide ou partie terminée : refusé, état inchangé", () => {
    const st = grid(5, 5, {});
    expect(applyBooster(st, "hammer").accepted).toBe(false);
    expect(applyBooster(st, "bomb", 99).accepted).toBe(false);
    expect(applyBooster({ ...st, status: "lost" }, "hammer", 0).accepted).toBe(false);
  });

  it("un booster qui termine les objectifs déclenche la victoire", () => {
    const st = grid(5, 5, {}, { goals: [{ type: "score", target: 1 }] });
    const r = applyBooster(st, "hammer", 0);
    expect(r.state.status).toBe("won");
  });

  it("applyBooster ne modifie pas l'état d'entrée et reste déterministe", () => {
    const st = createGame({ width: 7, height: 7, colors: 5, moves: 20, goals: [{ type: "score", target: 1e9 }], seed: "det" });
    const before = JSON.stringify(st);
    const a = applyBooster(st, "bomb", 24), b = applyBooster(st, "bomb", 24);
    expect(JSON.stringify(st)).toBe(before);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

describe("Kit de départ", () => {
  it("place une Fusée, une Bombe et un Prisme, sans alignement, avant le premier coup", () => {
    const st = createGame({ width: 8, height: 8, colors: 5, moves: 20, goals: [{ type: "score", target: 1e9 }], seed: "kit" });
    const r = applyStarterKit(st);
    expect(r.accepted).toBe(true);
    const sp = r.state.cells.map((p) => p?.special).filter(Boolean).sort();
    expect(sp).toEqual(["bomb", "prism", "rocketH"]);
    expect(findMatches(r.state)).toEqual([]);
    assertStable(r.state);
  });

  it("refusé après le premier coup", () => {
    const st = createGame({ width: 8, height: 8, colors: 5, moves: 20, goals: [{ type: "score", target: 1e9 }], seed: "kit2" });
    const after = applyMove(st, getHint(st)!).state;
    expect(applyStarterKit(after).accepted).toBe(false);
  });
});

describe("déblocage", () => {
  it("niveaux 8, 12, 18, 25, 32, 40", () => {
    expect(Object.values(BOOSTER_UNLOCK_LEVEL)).toEqual([8, 12, 18, 25, 32, 40]);
    expect(unlockedBoosters(7)).toEqual([]);
    expect(unlockedBoosters(18)).toEqual(["hammer", "bomb", "rainbow"]);
    expect(boostersUnlockedAt(40)).toEqual(["starterKit"]);
    expect(boostersUnlockedAt(41)).toEqual([]);
  });
});
