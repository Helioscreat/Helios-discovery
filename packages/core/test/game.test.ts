import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyMove, applyMoveInPlace, cloneState, createGame, ensurePlayable, findMatches, fromAscii, getHint,
  hashState, hasValidMove, listValidMoves, nextInt, seedRng, stabilize, type GameEvent, type GameState, type LevelSpec,
} from "../src";
import { assertStable, eventsOf, grid, P } from "./helpers";

const spec = (over: Partial<LevelSpec> = {}): LevelSpec => ({
  width: 8, height: 8, colors: 5, moves: 25, goals: [{ type: "score", target: 1e9 }], seed: "s1", ...over,
});

describe("PRNG", () => {
  it("même graine → même suite ; graines différentes → suites différentes", () => {
    const a = seedRng("x"), b = seedRng("x"), c = seedRng("y");
    const sa = Array.from({ length: 20 }, () => nextInt(a, 1000));
    expect(Array.from({ length: 20 }, () => nextInt(b, 1000))).toEqual(sa);
    expect(Array.from({ length: 20 }, () => nextInt(c, 1000))).not.toEqual(sa);
  });

  it("distribution uniforme (khi² sur 6 classes, 60 000 tirages)", () => {
    const s = seedRng("uniforme");
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) counts[nextInt(s, 6)]++;
    const chi2 = counts.reduce((acc, c) => acc + (c - 10000) ** 2 / 10000, 0);
    expect(chi2).toBeLessThan(20.5); // seuil p = 0,001 pour 5 ddl
  });
});

describe("création de partie", () => {
  it("grille sans alignement initial, avec au moins un coup", () => {
    for (let k = 0; k < 50; k++) {
      const st = createGame(spec({ seed: `gen-${k}`, colors: 4 + (k % 3) }));
      expect(findMatches(st)).toEqual([]);
      expect(hasValidMove(st)).toBe(true);
      assertStable(st);
    }
  });

  it("respecte le masque irrégulier", () => {
    const mask = ["#..#", "....", "....", "#..#"];
    const st = createGame(spec({ width: 4, height: 4, mask }));
    expect(st.cells[0]).toBeNull();
    expect(st.cells[3]).toBeNull();
    assertStable(st);
  });

  it("refuse les tailles et nombres de couleurs hors spécification", () => {
    expect(() => createGame(spec({ width: 10 }))).toThrow();
    expect(() => createGame(spec({ colors: 3 }))).toThrow();
    expect(() => createGame(spec({ colors: 7 }))).toThrow();
  });
});

describe("règles d'échange", () => {
  it("échange sans alignement : refusé, aucun coup consommé, état inchangé", () => {
    const st = grid(5, 5, {});
    const before = JSON.stringify(st);
    const r = applyMove(st, { from: P(st, 0, 0), to: P(st, 1, 0) });
    expect(r.accepted).toBe(false);
    expect(r.events[0]).toMatchObject({ type: "swapRejected", reason: "noMatch" });
    expect(JSON.stringify(r.state)).toBe(before);
  });

  it("cases non adjacentes : refusé", () => {
    const st = grid(5, 5, {});
    expect(applyMove(st, { from: P(st, 0, 0), to: P(st, 2, 0) }).events[0]).toMatchObject({ reason: "notAdjacent" });
    expect(applyMove(st, { from: P(st, 4, 0), to: P(st, 0, 1) }).events[0]).toMatchObject({ reason: "notAdjacent" });
  });

  it("une spéciale échangée avec une pièce normale sans alignement : refusé ; un Prisme : accepté", () => {
    const st = grid(5, 5, { "0,0": "a-", "2,0": "P" });
    expect(applyMove(st, { from: P(st, 0, 0), to: P(st, 1, 0) }).accepted).toBe(false);
    expect(applyMove(st, { from: P(st, 2, 0), to: P(st, 3, 0) }).accepted).toBe(true);
  });

  it("applyMove ne modifie jamais l'état d'entrée", () => {
    const st = createGame(spec());
    const before = JSON.stringify(st);
    applyMove(st, getHint(st)!);
    expect(JSON.stringify(st)).toBe(before);
  });

  it("un coup accepté décrémente les coups restants", () => {
    const st = createGame(spec());
    const r = applyMove(st, getHint(st)!);
    expect(r.state.movesLeft).toBe(24);
    expect(r.state.moveCount).toBe(1);
  });
});

describe("gravité, remplissage, mélange", () => {
  it("la gravité ne traverse jamais une case inactive", () => {
    const holes = fromAscii(["c d a d", "d c a c", "c # a #", "d c d c"]);
    const ev2 = stabilize(holes);
    for (const g of eventsOf(ev2, "gravity"))
      for (const [from, to] of g.moves) {
        expect(from % 4).toBe(to % 4);
        for (let i = from; i <= to; i += 4) expect(holes.mask[i]).toBe(true);
      }
    assertStable(holes);
  });

  it("mélange automatique d'une grille bloquée : pièces conservées, coup disponible, aucun alignement", () => {
    const st = fromAscii(["a b c d", "c d a b", "a b c d", "c d a b"], { colors: 4 });
    expect(listValidMoves(st)).toHaveLength(0);
    const ids = st.cells.map((p) => p!.id).sort((x, y) => x - y);
    const ev: GameEvent[] = [];
    ensurePlayable(st, ev);
    expect(eventsOf(ev, "shuffle")).toHaveLength(1);
    expect(hasValidMove(st)).toBe(true);
    expect(findMatches(st)).toEqual([]);
    expect(st.cells.map((p) => p!.id).sort((x, y) => x - y)).toEqual(ids);
  });

  it("indice : renvoie un coup valide, et préfère un combo", () => {
    const st = grid(5, 5, { "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a", "3,3": "P", "4,3": "e*" });
    expect(getHint(st)).toEqual({ from: P(st, 3, 3), to: P(st, 4, 3) });
  });
});

describe("fin de partie", () => {
  it("victoire : les coups restants deviennent des Fusées qui se déclenchent", () => {
    const st = createGame(spec({ goals: [{ type: "score", target: 1 }], moves: 5 }));
    const r = applyMove(st, getHint(st)!);
    expect(r.state.status).toBe("won");
    expect(eventsOf(r.events, "bonusStart")[0].moves).toBe(4);
    expect(r.state.movesLeft).toBe(0);
    expect(r.state.cells.every((p) => p === null || p.special === null)).toBe(true);
    assertStable(r.state);
  });

  it("défaite quand les coups sont épuisés ; plus aucun coup accepté ensuite", () => {
    const st = createGame(spec({ moves: 1 }));
    const r = applyMove(st, getHint(st)!);
    expect(r.state.status).toBe("lost");
    expect(eventsOf(r.events, "lost")).toHaveLength(1);
    const again = applyMove(r.state, listValidMoves(r.state)[0] ?? { from: 0, to: 1 });
    expect(again.accepted).toBe(false);
  });

  it("objectif de collecte : l'avancement compte les pièces de la couleur effacées", () => {
    const st = grid(5, 5, { "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a" }, {
      goals: [{ type: "collect", color: 0, count: 3 }],
    });
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(r.state.progress[0]).toBeGreaterThanOrEqual(3);
    expect(r.state.status).toBe("won");
  });
});

describe("déterminisme et sérialisation", () => {
  const playHints = (st: GameState, n: number) => {
    for (let k = 0; k < n && st.status === "playing"; k++) applyMoveInPlace(st, getHint(st)!);
    return st;
  };

  it("même graine + mêmes coups → état identique au bit près", () => {
    const a = playHints(createGame(spec({ seed: "det" })), 20);
    const b = playHints(createGame(spec({ seed: "det" })), 20);
    expect(hashState(a)).toBe(hashState(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("graines différentes → grilles différentes", () => {
    expect(hashState(createGame(spec({ seed: "A" })))).not.toBe(hashState(createGame(spec({ seed: "B" }))));
  });

  it("reprise après sérialisation JSON : la suite de la partie est identique", () => {
    const a = playHints(createGame(spec({ seed: "save" })), 8);
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    expect(hashState(playHints(a, 10))).toBe(hashState(playHints(b, 10)));
  });

  it("aucune source d'aléa ou d'horloge non déterministe dans le moteur", () => {
    const dir = join(__dirname, "../src");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now|crypto\./);
    }
  });
});

describe("parties aléatoires (fuzz) : invariants après chaque coup", () => {
  const masks: (string[] | undefined)[] = [
    undefined,
    ["#.......#", ".........", ".........", "....#....", "...###...", "....#....", ".........", ".........", "#.......#"],
    ["..#..", ".....", "#...#", ".....", "..#.."],
  ];

  it("300 parties jouées jusqu'au bout sans état invalide", () => {
    let totalMoves = 0;
    for (let k = 0; k < 300; k++) {
      const mask = masks[k % masks.length];
      const size = mask ? { width: mask[0].length, height: mask.length } : { width: 9, height: 9 };
      const st = createGame({
        ...size, mask, colors: 4 + (k % 3), moves: 20,
        goals: k % 4 === 0 ? [{ type: "score", target: 3000 }] : [{ type: "collect", color: k % 4, count: 40 }],
        seed: `fuzz-${k}`,
      });
      const chooser = seedRng(`chooser-${k}`);
      let prevMoves = st.movesLeft;
      while (st.status === "playing") {
        const moves = listValidMoves(st);
        expect(moves.length).toBeGreaterThan(0);
        const m = moves[nextInt(chooser, moves.length)];
        const { accepted } = applyMoveInPlace(st, m);
        expect(accepted).toBe(true);
        totalMoves++;
        assertStable(st);
        expect(findMatches(st)).toEqual([]);
        expect(st.movesLeft).toBeLessThan(prevMoves);
        if (st.status === "playing") expect(hasValidMove(st)).toBe(true);
        prevMoves = st.movesLeft;
      }
      expect(["won", "lost"]).toContain(st.status);
    }
    expect(totalMoves).toBeGreaterThan(3000);
  });
});

describe("performance (budget du générateur, livrable 4)", () => {
  it("mesure le débit de coups résolus par seconde", () => {
    const t0 = process.hrtime.bigint();
    let moves = 0;
    for (let k = 0; k < 100; k++) {
      const st = createGame(spec({ width: 9, height: 9, colors: 5, moves: 30, seed: `perf-${k}` }));
      while (st.status === "playing") {
        applyMoveInPlace(st, getHint(st)!);
        moves++;
      }
    }
    const secs = Number(process.hrtime.bigint() - t0) / 1e9;
    const rate = Math.round(moves / secs);
    process.stdout.write(`\n[perf] débit : ${rate} coups/s (indice glouton inclus), ${moves} coups en ${secs.toFixed(2)} s\n`);
    expect(rate).toBeGreaterThan(300);
  });
});

// Garde de non-régression : clonage profond.
it("cloneState ne partage aucune référence mutable", () => {
  const a = createGame(spec());
  const b = cloneState(a);
  b.cells[0]!.color = 99;
  b.rng[0] = 0;
  expect(a.cells[0]!.color).not.toBe(99);
  expect(a.rng[0]).not.toBe(0);
});
