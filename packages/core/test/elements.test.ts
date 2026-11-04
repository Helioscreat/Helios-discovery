import { describe, expect, it } from "vitest";
import {
  applyBooster, applyMove, applyMoveInPlace, cloneState, createGame, findMatches, fromAscii, hasValidMove, listValidMoves,
  nextInt, seedRng, settle, stabilize, toAscii, type GameEvent, type GameState,
} from "../src";
import { eventsOf, grid, P } from "./helpers";

function assertSettled(st: GameState) {
  for (let i = 0; i < st.cells.length; i++) if (!st.mask[i]) expect(st.cells[i]).toBeNull();
  expect(findMatches(st)).toEqual([]);
  const ev: GameEvent[] = [];
  settle(cloneState(st), ev);
  expect(ev).toEqual([]);
}

/** Un coup valide quelconque qui ne touche pas une zone donnée (pour isoler les effets de fin de coup). */
const firstMove = (st: GameState) => listValidMoves(st)[0];

describe("notation des nouveaux éléments", () => {
  it("aller-retour : bulle, générateurs, coffres, pièce à clé", () => {
    const rows = ["B G H C C2", "ya yb c d e", "c d c d c"];
    expect(toAscii(fromAscii(rows))).toEqual(rows);
  });
});

describe("Bulles", () => {
  it("crevées par un alignement voisin ; comptent pour l'objectif", () => {
    const st = grid(5, 5, { "1,0": "B", "0,1": "a", "1,1": "a", "2,1": "a" }, { goals: [{ type: "clear", target: "bubble", count: 1 }] });
    stabilize(st);
    expect(st.progress[0]).toBe(1);
  });

  it("montent d'une case après chaque coup, en échangeant avec la pièce au-dessus", () => {
    const st = grid(6, 6, { "5,4": "B", "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a" });
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(r.state.cells[P(st, 5, 3)]?.kind).toBe("bubble");
    expect(eventsOf(r.events, "bubbleRise")).toHaveLength(1);
  });

  it("ne bougent pas et ne s'échangent pas", () => {
    const st = grid(5, 5, { "2,2": "B" });
    expect(listValidMoves(st).some((m) => m.from === P(st, 2, 2) || m.to === P(st, 2, 2))).toBe(false);
  });
});

describe("Portails", () => {
  // Deux zones séparées par une ligne vide ; le portail relie le bas de la zone haute au haut de la zone basse.
  const rows = ["c d c d c", "d c d c d", "# # # # #", "c d c d c", "a a b a d"];
  const portals = (st: GameState): [number, number][] => [0, 1, 2, 3, 4].map((x) => [P(st, x, 1), P(st, x, 3)]);

  it("les pièces de la zone haute tombent dans la zone basse ; la sortie n'est pas une case d'apparition", () => {
    const base = fromAscii(rows, { colors: 6 });
    const st = fromAscii(rows, { colors: 6, portals: portals(base) });
    const above = st.cells[P(st, 2, 1)]!.id;
    st.cells[P(st, 2, 3)] = null;
    settle(st, []);
    expect(st.cells[P(st, 2, 3)]!.id).toBe(above); // venue du portail, pas une nouvelle pièce
    const again: GameEvent[] = [];
    settle(st, again);
    expect(again).toEqual([]);
  });

  it("les objets à faire descendre traversent le portail et sortent par le bas de la zone basse", () => {
    const base = fromAscii(rows, { colors: 6 });
    let st = fromAscii(["c d D d c", "d c d c d", "# # # # #", "c d c d c", "e f b e f"], {
      colors: 6, portals: portals(base), goals: [{ type: "drop", count: 1 }], drops: { total: 1, maxOnBoard: 1 },
    });
    for (const [x, y] of [[2, 1], [2, 3], [2, 4], [2, 4]] as const) {
      if (st.status !== "playing") break;
      st = applyBooster(st, "hammer", P(st, x, y)).state;
    }
    expect(st.progress[0]).toBe(1);
  });
});

describe("Tapis roulants", () => {
  it("après chaque coup, le contenu de la boucle avance d'une case ; le gel reste en place", () => {
    const st = grid(6, 6, { "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a", "3,3": "i1e", "4,3": "f", "4,4": "c", "3,4": "d" });
    const loop = [P(st, 3, 3), P(st, 4, 3), P(st, 4, 4), P(st, 3, 4)];
    st.conveyors = [loop];
    const ids = loop.map((i) => st.cells[i]!.id);
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(loop.map((i) => r.state.cells[i]!.id)).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    expect(r.state.ice![P(st, 3, 3)]).toBe(1);
    expect(eventsOf(r.events, "conveyor")).toHaveLength(1);
  });
});

describe("Générateurs", () => {
  it("produisent une bulle tous les 3 coups sur une case voisine ; indestructibles", () => {
    const st = createGame({ width: 7, height: 7, layout: [". . . . . . .", ". . . . . . .", ". . . . . . .", ". . . G . . .", ". . . . . . .", ". . . . . . .", ". . . . . . ."], colors: 5, moves: 30, goals: [{ type: "score", target: 1e9 }], seed: "gen" });
    const g = P(st, 3, 3);
    let produced = 0;
    for (let k = 0; k < 6 && st.status === "playing"; k++) {
      const { events } = applyMoveInPlace(st, firstMove(st));
      produced += eventsOf(events, "generated").length;
    }
    expect(produced).toBe(2);
    expect(st.cells[g]?.kind).toBe("generator");
    const r = applyBooster(st, "bomb", g);
    expect(r.state.cells[g]?.kind).toBe("generator");
  });

  it("production plafonnée (la grille ne se bouche pas)", () => {
    const st = createGame({ width: 7, height: 7, layout: [". . . . . . .", ". . . . . . .", ". G . . . G .", ". . . . . . .", ". G . . . G .", ". . . . . . .", ". . . . . . ."], colors: 5, moves: 99, goals: [{ type: "score", target: 1e9 }], seed: "cap" });
    for (let k = 0; k < 60 && st.status === "playing"; k++) {
      const m = firstMove(st);
      if (!m) break;
      applyMoveInPlace(st, m);
      expect(st.cells.filter((p) => p?.kind === "bubble").length).toBeLessThanOrEqual(6);
    }
  });
});

describe("Coffres à clé", () => {
  it("effacer une pièce à clé ramasse la clé, qui ouvre un coffre", () => {
    const st = grid(6, 6, { "0,0": "ya", "1,0": "a", "2,0": "a", "4,4": "C" }, { goals: [{ type: "clear", target: "chest", count: 1 }] });
    st.keys = 0;
    const ev = stabilize(st);
    expect(eventsOf(ev, "keyCollected")).toHaveLength(1);
    expect(eventsOf(ev, "chestOpened")).toHaveLength(1);
    expect(st.progress[0]).toBe(1);
    expect(st.cells[P(st, 4, 4)]?.kind).not.toBe("chest");
  });

  it("un coffre à 2 serrures demande deux clés ; les explosions ne l'ouvrent pas", () => {
    const st = grid(6, 6, { "4,4": "C2" }, { goals: [{ type: "clear", target: "chest", count: 1 }] });
    st.keys = 1;
    const r = applyBooster(st, "bomb", P(st, 4, 4));
    expect(r.state.cells[P(st, 4, 4)]).toMatchObject({ kind: "chest", hp: 1 });
    expect(r.state.progress[0]).toBe(0);
  });

  it("de nouvelles clés apparaissent tant que les coffres en demandent", () => {
    const st = createGame({ width: 7, height: 7, layout: [". . . . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . .", ". C . . . C .", ". . . . . . ."], colors: 5, moves: 80, goals: [{ type: "clear", target: "chest", count: 2 }], seed: "keys" });
    const chooser = seedRng("k");
    let keysSeen = 0;
    while (st.status === "playing") {
      const m = listValidMoves(st);
      const { events } = applyMoveInPlace(st, m[nextInt(chooser, m.length)]);
      keysSeen += eventsOf(events, "keyCollected").length;
    }
    expect(keysSeen).toBeGreaterThan(0);
  });
});

describe("parties aléatoires avec les nouveaux éléments (fuzz)", () => {
  const LAYOUTS: string[][] = [
    [". . . . . . .", ". B . . . B .", ". . . . . . .", ". . . G . . .", ". . . . . . .", ". . C . C . .", ". . . . . . ."],
    [". . . . . . .", ". . . . . . .", ". . H . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . ."],
    [". . . . . . .", ". . . . . . .", "# # # # # # #", ". . . . . . .", ". . . . . . .", ". . . . . . .", ". . . . . . ."],
  ];
  it("150 parties (bulles, générateurs, coffres, portails, tapis) : invariants après chaque coup", () => {
    let moves = 0;
    for (let k = 0; k < 150; k++) {
      const layout = LAYOUTS[k % 3];
      const w = 7;
      const portals: [number, number][] | undefined = k % 3 === 2 ? Array.from({ length: 7 }, (_, x) => [1 * w + x, 3 * w + ((x + 2) % 7)]) : undefined;
      const conveyors = k % 2 === 0 ? [[4 * w + 2, 4 * w + 3, 4 * w + 4, 5 * w + 4, 5 * w + 3, 5 * w + 2].filter((i) => k % 3 !== 0 || (i !== 5 * w + 2 && i !== 5 * w + 4))] : undefined;
      const st = createGame({ width: 7, height: 7, layout, colors: 4 + (k % 3), moves: 25, goals: [{ type: "clear", target: "bubble", count: 99 }], seed: `el-${k}`, portals, conveyors });
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
    expect(moves).toBeGreaterThan(2000);
  });
});
