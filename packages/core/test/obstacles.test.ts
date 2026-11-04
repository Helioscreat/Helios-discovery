import { describe, expect, it } from "vitest";
import {
  applyBooster, applyMove, applyMoveInPlace, cloneState, createGame, findMatches, fromAscii, hasValidMove, listValidMoves,
  nextInt, seedRng, settle, stabilize, toAscii, type GameEvent, type GameState,
} from "../src";
import { eventsOf, grid, P } from "./helpers";

/** Invariants avec obstacles : rien sur une case inactive, plus aucun alignement, gravité stable (seules les poches fermées restent vides). */
function assertSettled(st: GameState) {
  for (let i = 0; i < st.cells.length; i++) if (!st.mask[i]) expect(st.cells[i]).toBeNull();
  expect(findMatches(st)).toEqual([]);
  const copy = cloneState(st);
  const ev: GameEvent[] = [];
  settle(copy, ev);
  expect(ev, "la gravité doit être stable").toEqual([]);
}

describe("notation des obstacles", () => {
  it("aller-retour jeton → état → jeton", () => {
    const rows = ["i2a kb gc X3 V", "D i1X1 a- P #", "c d c d c"];
    expect(toAscii(fromAscii(rows))).toEqual(rows);
  });
});

describe("Gel", () => {
  it("un alignement sur du gel enlève une couche par phase", () => {
    const st = grid(5, 5, { "0,0": "i2a", "1,0": "i1a", "2,0": "a" }, { goals: [{ type: "clear", target: "ice", count: 2 }] });
    stabilize(st);
    expect(st.ice![P(st, 0, 0)]).toBe(1);
    expect(st.ice![P(st, 1, 0)]).toBe(0);
    expect(st.progress[0]).toBe(1); // seule la case à 1 couche est entièrement libérée
  });

  it("une explosion casse aussi le gel, même sous une caisse", () => {
    const st = grid(5, 5, { "2,2": "i1X1" });
    applyBooster(st, "bomb", P(st, 2, 1)).state;
    const r = applyBooster(st, "bomb", P(st, 2, 1));
    expect(r.state.ice![P(st, 2, 2)]).toBe(0);
    expect(r.state.cells[P(st, 2, 2)]?.kind).not.toBe("crate");
  });
});

describe("Caisses", () => {
  it("abîmées par un alignement voisin, détruites à 0 PV", () => {
    const st = grid(5, 5, { "0,1": "a", "1,1": "a", "2,1": "a", "1,0": "X2" }, { goals: [{ type: "clear", target: "crate", count: 1 }] });
    stabilize(st);
    expect(st.cells[P(st, 1, 0)]).toMatchObject({ kind: "crate", hp: 1 });
    expect(st.progress[0]).toBe(0);
  });

  it("restent fixes ; les cases en dessous sont remplies en diagonale", () => {
    const st = grid(5, 5, { "2,0": "X3", "1,2": "a", "2,2": "a", "3,2": "a" });
    stabilize(st);
    expect(st.cells[P(st, 2, 0)]).toMatchObject({ kind: "crate" });
    for (let y = 1; y < 5; y++) expect(st.cells[P(st, 2, y)], `case 2,${y}`).not.toBeNull();
    assertSettled(st);
  });

  it("une Fusée qui traverse une caisse lui retire un PV", () => {
    const st = grid(5, 5, { "0,2": "a-", "1,2": "a", "2,2": "a", "4,2": "X2" });
    stabilize(st);
    expect(st.cells[P(st, 4, 2)]).toMatchObject({ kind: "crate", hp: 1 });
  });

  it("poche fermée : reste vide sans erreur, puis se remplit quand la caisse tombe", () => {
    const st = fromAscii([
      "c X1 X1 X1 c",
      "d X1 _ X1 d",
      "c d X1 d c",
      "d c d c d",
    ], { colors: 6 });
    stabilize(st);
    expect(st.cells[P(st, 2, 1)]).toBeNull();
    const r = applyBooster(st, "hammer", P(st, 2, 0));
    expect(r.state.cells[P(st, 2, 1)]).not.toBeNull();
  });
});

describe("Chaînes et Cages", () => {
  it("Chaîne : la pièce s'aligne, la chaîne se brise et la pièce reste", () => {
    const st = grid(5, 5, { "0,0": "ka", "1,0": "a", "2,0": "a" }, { goals: [{ type: "clear", target: "chain", count: 1 }] });
    const id = st.cells[0]!.id;
    stabilize(st);
    expect(st.progress[0]).toBe(1);
    expect(st.cells.some((p) => p?.id === id)).toBe(true);
    expect(st.cells.find((p) => p?.id === id)?.lock ?? null).toBeNull();
  });

  it("Chaîne : la pièce ne peut pas être échangée et ne tombe pas", () => {
    const st = grid(5, 5, { "2,1": "kb", "0,0": "a", "1,0": "a", "2,0": "b", "2,2": "a" });
    expect(applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) }).accepted).toBe(false);
    const st2 = grid(5, 5, { "2,3": "kb", "1,4": "a", "2,4": "a", "3,4": "a" });
    stabilize(st2);
    expect(st2.cells[P(st2, 2, 3)]?.lock).toBe("chain");
  });

  it("Cage : la pièce ne s'aligne pas ; un alignement voisin la libère", () => {
    const st = grid(5, 5, { "0,0": "ga", "1,0": "a", "2,0": "a" });
    expect(findMatches(st)).toEqual([]);
    const st2 = grid(5, 5, { "1,0": "gb", "0,1": "a", "1,1": "a", "2,1": "a" }, { goals: [{ type: "clear", target: "cage", count: 1 }] });
    stabilize(st2);
    expect(st2.progress[0]).toBe(1);
  });
});

describe("Lierre", () => {
  const ivyBoard = () => grid(6, 6, { "5,5": "V", "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a" }, { goals: [{ type: "clear", target: "ivy", count: 5 }] });

  it("se propage d'une case quand aucun lierre n'est détruit pendant le coup", () => {
    const st = ivyBoard();
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(eventsOf(r.events, "ivySpread")).toHaveLength(1);
    expect(r.state.cells.filter((p) => p?.kind === "ivy")).toHaveLength(2);
  });

  it("ne se propage pas si un lierre est détruit pendant le coup", () => {
    // Le lierre en (3,0) est voisin de l'alignement a a a de la ligne 0.
    const st = grid(6, 6, { "3,0": "V", "5,5": "V", "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a" });
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(r.accepted).toBe(true);
    expect(eventsOf(r.events, "ivySpread")).toHaveLength(0);
  });
});

describe("Objets à faire descendre", () => {
  it("sortent par le bas et comptent pour l'objectif", () => {
    const st = grid(5, 5, { "2,3": "D", "1,4": "a", "2,4": "a", "3,4": "a" }, { goals: [{ type: "drop", count: 1 }], drops: { total: 1, maxOnBoard: 1 } });
    const ev = stabilize(st);
    expect(eventsOf(ev, "dropCollected")).toHaveLength(1);
    expect(st.progress[0]).toBe(1);
  });

  it("indestructibles par les explosions", () => {
    const st = grid(5, 5, { "2,1": "D" }, { drops: { total: 1, maxOnBoard: 1 } });
    const r = applyBooster(st, "bomb", P(st, 2, 1));
    expect(r.state.cells.some((p) => p?.kind === "drop")).toBe(true);
  });

  it("apparition bornée par total et maxOnBoard", () => {
    const st = createGame({ width: 7, height: 7, colors: 5, moves: 60, goals: [{ type: "drop", count: 99 }], seed: "drops", drops: { total: 4, maxOnBoard: 2 } });
    const chooser = seedRng("c");
    let peak = 0;
    while (st.status === "playing") {
      const m = listValidMoves(st);
      applyMoveInPlace(st, m[nextInt(chooser, m.length)]);
      peak = Math.max(peak, st.cells.filter((p) => p?.kind === "drop").length);
    }
    expect(st.drops!.spawned).toBeLessThanOrEqual(4);
    expect(peak).toBeLessThanOrEqual(2);
    expect(st.drops!.spawned).toBeGreaterThan(0);
  });
});

describe("Libellule et objectifs d'obstacles", () => {
  it("vise en priorité un obstacle d'objectif inachevé", () => {
    const st = grid(6, 6, { "1,2": "a", "2,2": "a^", "3,2": "a", "5,5": "X3" }, { goals: [{ type: "clear", target: "crate", count: 1 }] });
    const flight = eventsOf(stabilize(st), "dragonflyFlight")[0];
    expect(flight.to).toBe(P(st, 5, 5));
  });
});

describe("création depuis un layout", () => {
  it("applique gel, verrous, obstacles et couleurs imposées, sans alignement initial", () => {
    const layout = [
      "# . . . . . #",
      ". i1. i1. . i2. . .",
      ". . X2 X2 X2 . .",
      ". k. . V . k. .",
      ". . . . . . .",
      "g. . . D . . g.",
      "# . . . . . #",
    ].map((r) => r.replace("i1. i1.", "i1. i1.")); // lisibilité
    const st = createGame({ width: 7, height: 7, layout, colors: 5, moves: 20, goals: [{ type: "score", target: 1e9 }], seed: "lay", drops: { total: 3, maxOnBoard: 1 } });
    expect(st.mask[0]).toBe(false);
    expect(st.ice![P(st, 1, 1)]).toBe(1);
    expect(st.cells[P(st, 2, 2)]).toMatchObject({ kind: "crate", hp: 2 });
    expect(st.cells[P(st, 1, 3)]?.lock).toBe("chain");
    expect(st.cells[P(st, 0, 5)]?.lock).toBe("cage");
    expect(st.drops!.spawned).toBe(1);
    expect(findMatches(st)).toEqual([]);
    expect(hasValidMove(st)).toBe(true);
  });
});

describe("parties aléatoires avec obstacles (fuzz)", () => {
  const LAYOUTS = [
    ["X1 . . . . . X1", ". i2. i2. . i2. i2. .", ". . X2 . X2 . .", "k. . . V . . k.", ". . . . . . .", ". g. . . . g. .", ". . . . . . ."],
    [". . . . . . .", ". X3 X3 . X3 X3 .", ". . . . . . .", "V . . . . . V", ". . . i3. . . .", ". . . . . . .", ". . . . . . ."],
    ["# . . . . . #", ". . . . . . .", ". kX1 . . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . .", "# . . . . . #"].map((r) => r.replace("kX1", "X1")),
  ];
  it("200 parties : invariants respectés après chaque coup", () => {
    let moves = 0;
    for (let k = 0; k < 200; k++) {
      const st = createGame({
        width: 7, height: 7, layout: LAYOUTS[k % LAYOUTS.length], colors: 4 + (k % 3), moves: 25,
        goals: [{ type: "clear", target: "crate", count: 99 }], seed: `obs-${k}`,
        drops: k % 2 ? { total: 3, maxOnBoard: 2 } : undefined,
      });
      const chooser = seedRng(`c-${k}`);
      while (st.status === "playing") {
        const list = listValidMoves(st);
        expect(list.length).toBeGreaterThan(0);
        expect(applyMoveInPlace(st, list[nextInt(chooser, list.length)]).accepted).toBe(true);
        moves++;
        assertSettled(st);
        if (st.status === "playing") expect(hasValidMove(st)).toBe(true);
      }
    }
    expect(moves).toBeGreaterThan(3000);
  });
});

describe("Lierre : garde-fous", () => {
  it("ne pousse jamais sur une case d'apparition (ligne du haut)", () => {
    const st = grid(6, 6, { "0,1": "V", "1,1": "V", "0,0": "e", "5,5": "a", "4,5": "a", "3,4": "b", "3,5": "f" });
    for (let k = 0; k < 30 && st.status === "playing"; k++) {
      const m = listValidMoves(st)[0];
      if (!m) break;
      applyMoveInPlace(st, m);
      for (let x = 0; x < 6; x++) expect(st.cells[x]?.kind).not.toBe("ivy");
    }
  });
});
