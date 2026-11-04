import { describe, expect, it } from "vitest";
import { applyMove, getHint, hashState } from "@helios/core";
import { difficultyOf, levelSpec } from "../src/game/levels";
import { grantUnlocks, newProfile } from "../src/game/profile";
import { GameSession } from "../src/game/session";

describe("déblocage des boosters et exemplaires offerts", () => {
  it("3 exemplaires offerts au déblocage, une seule fois", () => {
    const p = newProfile();
    expect(grantUnlocks(p, 7)).toEqual([]);
    expect(grantUnlocks(p, 8)).toEqual(["hammer"]);
    expect(p.inventory.hammer).toBe(3);
    expect(grantUnlocks(p, 8)).toEqual([]);
    expect(p.inventory.hammer).toBe(3);
    expect(grantUnlocks(p, 40)).toEqual(["bomb", "rainbow", "fireCross", "shuffler", "starterKit"]);
  });
});

describe("session de jeu", () => {
  it("un booster n'est décompté que s'il est accepté, et ne consomme aucun coup", () => {
    const p = newProfile();
    grantUnlocks(p, 12);
    const s = new GameSession(12, p, false);
    expect(s.useBooster("bomb", -1)).toBeNull();
    expect(p.inventory.bomb).toBe(3);
    const moves = s.state.movesLeft;
    expect(s.useBooster("bomb", 40)).not.toBeNull();
    expect(p.inventory.bomb).toBe(2);
    expect(s.state.movesLeft).toBe(moves);
  });

  it("sans exemplaire en réserve, le booster est refusé", () => {
    const s = new GameSession(12, newProfile(), false);
    expect(s.useBooster("hammer", 0)).toBeNull();
  });

  it("le Kit de départ consomme un exemplaire et place 3 spéciales", () => {
    const p = newProfile();
    grantUnlocks(p, 40);
    const s = new GameSession(40, p, true);
    expect(p.inventory.starterKit).toBe(2);
    expect(s.state.cells.filter((c) => c?.special).length).toBe(3);
  });

  it("le niveau N est identique quel que soit le profil (inventaire, progression) — volet session de FAIR-01", () => {
    const rich = newProfile();
    grantUnlocks(rich, 45);
    rich.levelReached = 45;
    const a = new GameSession(20, newProfile(), false).state;
    const b = new GameSession(20, rich, false).state;
    expect(hashState(a)).toBe(hashState(b));
    const next = applyMove(a, getHint(a)!).state;
    expect(hashState(next)).toBe(hashState(applyMove(b, getHint(b)!).state));
  });

  it("niveaux réels : badges Difficile (7e) et Très difficile (10e) de chaque bloc, parcours d'accueil sans badge", () => {
    expect(difficultyOf(7)).toBe("normal");
    expect(difficultyOf(17)).toBe("hard");
    expect(difficultyOf(20)).toBe("veryHard");
    expect(difficultyOf(21)).toBe("normal");
    expect(levelSpec(13).layout?.join(" ")).toMatch(/i1/);
  });

  it("l'essai change la suite des pièces, pas la grille de départ", () => {
    const a = levelSpec(30, 0), b = levelSpec(30, 1);
    expect(a.layout).toEqual(b.layout);
    expect(a.playSeed).not.toBe(b.playSeed);
  });
});
