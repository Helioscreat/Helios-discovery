import { describe, expect, it } from "vitest";
import { applyMove, colCells, crossCells, fromAscii, rowCells, squareAround, stabilize, tripleLines, crossLines } from "../src";
import { assertStable, eventsOf, firstCleared, grid, P, sorted } from "./helpers";

describe("création des spéciales", () => {
  it("la spéciale apparaît sur la case jouée", () => {
    // Ligne 0 : a a b a c ; un « a » sous le « b » remonte → 4 en ligne.
    const st = grid(5, 5, { "0,0": "a", "1,0": "a", "2,0": "b", "3,0": "a", "2,1": "a" });
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(r.accepted).toBe(true);
    const created = eventsOf(r.events, "specialCreated")[0];
    expect(created).toMatchObject({ at: P(st, 2, 0), special: "rocketV", color: 0 });
    assertStable(r.state);
  });

  it("en cascade (sans case jouée), elle apparaît sur la case la plus basse puis la plus à gauche", () => {
    const st = grid(5, 5, { "1,0": "a", "1,1": "a", "1,2": "a", "1,3": "a" });
    const ev = stabilize(st);
    expect(eventsOf(ev, "specialCreated")[0]).toMatchObject({ at: P(st, 1, 3), special: "rocketH" });
  });

  it("le score d'un alignement de 3 en première phase vaut 3 × 10", () => {
    const st = grid(5, 5, { "0,0": "a", "1,0": "a", "2,0": "b", "2,1": "a" });
    const r = applyMove(st, { from: P(st, 2, 1), to: P(st, 2, 0) });
    expect(eventsOf(r.events, "score")[0].delta).toBe(30);
  });
});

describe("effets des spéciales déclenchées dans un alignement", () => {
  it("Fusée horizontale : efface toute la ligne", () => {
    const st = grid(5, 5, { "0,2": "a-", "1,2": "a", "2,2": "a" });
    expect(firstCleared(stabilize(st))).toEqual(rowCells(st, 2));
  });

  it("Fusée verticale : efface toute la colonne", () => {
    const st = grid(5, 5, { "2,0": "a|", "2,1": "a", "2,2": "a" });
    expect(firstCleared(stabilize(st))).toEqual(colCells(st, 2));
  });

  it("Fusée : ignore les cases inactives", () => {
    const st = fromAscii(["c d c d c", "a- a a # d", "c d c d c"]);
    const cleared = firstCleared(stabilize(st));
    expect(cleared).toEqual([P(st, 0, 1), P(st, 1, 1), P(st, 2, 1), P(st, 4, 1)]);
    assertStable(st);
  });

  it("Bombe : efface le carré 3x3", () => {
    const st = grid(5, 5, { "1,2": "a", "2,2": "a*", "3,2": "a" });
    expect(firstCleared(stabilize(st))).toEqual(squareAround(st, P(st, 2, 2), 1));
  });

  it("Libellule : croix au départ puis frappe une cible", () => {
    const st = grid(5, 5, { "1,2": "a", "2,2": "a^", "3,2": "a" });
    const ev = stabilize(st);
    const flight = eventsOf(ev, "dragonflyFlight")[0];
    expect(flight.from).toBe(P(st, 2, 2));
    const cross = crossCells(st, P(st, 2, 2));
    expect(firstCleared(ev)).toEqual(sorted([...cross, flight.to]));
    expect(cross).not.toContain(flight.to);
  });

  it("Libellule : vise en priorité la couleur d'un objectif de collecte", () => {
    const st = grid(5, 5, { "1,2": "a", "2,2": "a^", "3,2": "a", "4,4": "b" }, {
      goals: [{ type: "collect", color: 1, count: 5 }],
    });
    const flight = eventsOf(stabilize(st), "dragonflyFlight")[0];
    expect(flight.to).toBe(P(st, 4, 4));
  });

  it("Prisme touché par une explosion : efface la couleur la plus présente", () => {
    // Fusée dans la ligne 2 ; le Prisme est sur cette ligne.
    const st = grid(5, 5, { "0,2": "a-", "1,2": "a", "2,2": "a", "4,2": "P", "0,0": "b", "0,4": "b" });
    const before = st.cells.map((p) => p?.color ?? -1);
    const ev = stabilize(st);
    const act = eventsOf(ev, "activated").find((e) => e.special === "prism")!;
    expect(act.cells.length).toBeGreaterThan(0);
    const colors = new Set(act.cells.map((c) => before[c]));
    expect(colors.size).toBe(1);
    // aucune autre couleur n'a plus de cases restantes que celle choisie
    const chosen = [...colors][0];
    const remaining = (c: number) => before.filter((v, i) => v === c && !rowCells(st, 2).includes(i)).length;
    for (let c = 0; c < 6; c++) expect(remaining(c)).toBeLessThanOrEqual(remaining(chosen));
  });

  it("réaction en chaîne : une Fusée en touche une autre", () => {
    const st = grid(5, 5, { "0,2": "a-", "1,2": "a", "2,2": "a", "4,2": "b|" });
    const cleared = firstCleared(stabilize(st));
    expect(cleared).toEqual(sorted([...rowCells(st, 2), ...colCells(st, 4)]));
  });
});

describe("combos (échange de deux spéciales)", () => {
  const combo = (w: number, h: number, place: Record<string, string>, from: [number, number], to: [number, number]) => {
    const st = grid(w, h, place);
    const r = applyMove(st, { from: P(st, ...from), to: P(st, ...to) });
    expect(r.accepted).toBe(true);
    assertStable(r.state);
    return { st, r, ev: r.events, cleared: firstCleared(r.events) };
  };

  it("Fusée + Fusée = croix (ligne + colonne)", () => {
    const { st, ev, cleared } = combo(5, 5, { "2,2": "a-", "3,2": "b|" }, [3, 2], [2, 2]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("rocket+rocket");
    expect(cleared).toEqual(crossLines(st, P(st, 2, 2)));
  });

  it("Fusée + Bombe = 3 lignes + 3 colonnes", () => {
    const { st, ev, cleared } = combo(7, 7, { "3,3": "a*", "4,3": "b-" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("rocket+bomb");
    expect(cleared).toEqual(tripleLines(st, P(st, 3, 3)));
    expect(cleared).toHaveLength(33);
  });

  it("Bombe + Bombe = 5x5", () => {
    const { st, ev, cleared } = combo(7, 7, { "3,3": "a*", "4,3": "b*" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("bomb+bomb");
    expect(cleared).toEqual(squareAround(st, P(st, 3, 3), 2));
    expect(cleared).toHaveLength(25);
  });

  it("Bombe + Bombe dans un coin : zone tronquée à la grille", () => {
    const { cleared } = combo(7, 7, { "0,0": "a*", "1,0": "b*" }, [1, 0], [0, 0]);
    expect(cleared).toHaveLength(9);
  });

  it("Prisme + pièce normale = efface toute la couleur", () => {
    const { st, ev, cleared } = combo(5, 5, { "2,2": "P", "3,2": "a", "0,0": "a", "4,4": "a" }, [3, 2], [2, 2]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("prism+color");
    expect(cleared).toEqual(sorted([P(st, 0, 0), P(st, 4, 4), P(st, 2, 2), P(st, 3, 2)]));
  });

  it("Prisme + Fusée = toutes les pièces de la couleur deviennent des Fusées et se déclenchent", () => {
    const { st, ev, cleared } = combo(5, 5, { "2,2": "P", "3,2": "a-", "0,0": "a", "4,4": "a", "0,4": "a" }, [3, 2], [2, 2]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("prism+rocket");
    const t = eventsOf(ev, "transformed")[0];
    expect(sorted(t.cells)).toEqual(sorted([P(st, 0, 0), P(st, 4, 4), P(st, 0, 4)]));
    t.cells.forEach((c, k) => {
      const line = t.specials[k] === "rocketH" ? rowCells(st, Math.floor(c / 5)) : colCells(st, c % 5);
      for (const l of line) expect(cleared).toContain(l);
    });
  });

  it("Prisme + Bombe = la couleur devient des Bombes", () => {
    const { st, ev, cleared } = combo(7, 7, { "3,3": "P", "4,3": "a*", "0,0": "a", "6,6": "a" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("prism+bomb");
    expect(eventsOf(ev, "transformed")[0].specials).toEqual(["bomb", "bomb"]);
    for (const c of squareAround(st, P(st, 6, 6), 1)) expect(cleared).toContain(c);
  });

  it("Prisme + Libellule = la couleur devient des Libellules qui s'envolent", () => {
    const { ev } = combo(7, 7, { "3,3": "P", "4,3": "a^", "0,0": "a", "6,6": "a" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("prism+dragonfly");
    expect(eventsOf(ev, "dragonflyFlight").length).toBeGreaterThanOrEqual(3);
  });

  it("Prisme + Prisme = grille vidée, sans réaction en chaîne", () => {
    const { st, ev, cleared } = combo(5, 5, { "2,2": "P", "3,2": "P", "0,0": "a-" }, [3, 2], [2, 2]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("prism+prism");
    expect(cleared).toHaveLength(st.cells.length);
    const firstGravity = ev.findIndex((e) => e.type === "gravity" || e.type === "spawned");
    expect(ev.slice(0, firstGravity).some((e) => e.type === "activated")).toBe(false);
  });

  it("Libellule + Libellule = 3 Libellules", () => {
    const { ev } = combo(7, 7, { "3,3": "a^", "4,3": "b^" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("dragonfly+dragonfly");
    const firstGravity = ev.findIndex((e) => e.type === "gravity" || e.type === "spawned");
    expect(eventsOf(ev.slice(0, firstGravity), "dragonflyFlight")).toHaveLength(3);
  });

  it("Libellule + Bombe = la Libellule transporte la Bombe jusqu'à sa cible", () => {
    const { st, ev, cleared } = combo(7, 7, { "3,3": "a^", "4,3": "b*" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("dragonfly+bomb");
    const f = eventsOf(ev, "dragonflyFlight")[0];
    expect(f.carry).toBe("bomb");
    for (const c of squareAround(st, f.to, 1)) expect(cleared).toContain(c);
  });

  it("Libellule + Fusée = la Libellule transporte la Fusée", () => {
    const { st, ev, cleared } = combo(7, 7, { "3,3": "a^", "4,3": "b|" }, [4, 3], [3, 3]);
    expect(eventsOf(ev, "combo")[0].kind).toBe("dragonfly+rocket");
    const f = eventsOf(ev, "dragonflyFlight")[0];
    expect(f.carry).toBe("rocketV");
    for (const c of colCells(st, f.to % 7)) expect(cleared).toContain(c);
  });
});
