import { describe, expect, it } from "vitest";
import { findMatches, fromAscii, hasMatchAt } from "../src";
import { grid, P } from "./helpers";

const cells = (pts: [number, number][]) => Object.fromEntries(pts.map(([x, y]) => [`${x},${y}`, "a"]));

describe("détection et classement des alignements", () => {
  it("le damier de test ne contient aucun alignement", () => {
    expect(findMatches(grid(7, 7, {}))).toEqual([]);
  });

  it("3 en ligne → pas de spéciale", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [1, 0], [2, 0]])));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ shape: "line3", special: null, color: 0 });
    expect(g[0].cells).toHaveLength(3);
  });

  it("4 horizontaux → Fusée verticale (perpendiculaire)", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [1, 0], [2, 0], [3, 0]])));
    expect(g[0]).toMatchObject({ shape: "line4", special: "rocketV" });
  });

  it("4 verticaux → Fusée horizontale", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [0, 1], [0, 2], [0, 3]])));
    expect(g[0]).toMatchObject({ shape: "line4", special: "rocketH" });
  });

  it("5 en ligne → Prisme", () => {
    const g = findMatches(grid(5, 5, cells([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]])));
    expect(g[0]).toMatchObject({ shape: "line5", special: "prism" });
  });

  it("forme en L → Bombe", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]])));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ shape: "lt", special: "bomb" });
    expect(g[0].cells).toHaveLength(5);
  });

  it("forme en T → Bombe", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]])));
    expect(g[0]).toMatchObject({ shape: "lt", special: "bomb" });
  });

  it("carré 2x2 → Libellule", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [1, 0], [0, 1], [1, 1]])));
    expect(g[0]).toMatchObject({ shape: "square", special: "dragonfly" });
  });

  it("bloc 3x2 → un seul groupe Libellule (le carré prime sur le 3)", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]])));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ special: "dragonfly" });
    expect(g[0].cells).toHaveLength(6);
  });

  it("priorité : 5 en ligne prime sur un L qui le croise", () => {
    const g = findMatches(grid(5, 5, cells([[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]])));
    expect(g[0].special).toBe("prism");
  });

  it("priorité : L prime sur 4 en ligne", () => {
    const g = findMatches(grid(5, 5, cells([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [0, 2]])));
    expect(g[0].special).toBe("bomb");
  });

  it("deux groupes disjoints, triés par plus petit index", () => {
    const st = grid(6, 6, { ...cells([[3, 4], [4, 4], [5, 4]]), "0,0": "b", "0,1": "b", "0,2": "b" });
    const g = findMatches(st);
    expect(g.map((m) => m.color)).toEqual([1, 0]);
  });

  it("le Prisme ne s'aligne pas et coupe l'alignement", () => {
    expect(findMatches(grid(5, 5, { "0,0": "a", "1,0": "P", "2,0": "a", "3,0": "a" }))).toHaveLength(0);
  });

  it("une case inactive coupe l'alignement", () => {
    const st = fromAscii(["a a # a a", "c d c d c", "d c d c d"]);
    expect(findMatches(st)).toHaveLength(0);
  });

  it("une spéciale colorée s'aligne comme une pièce normale", () => {
    const g = findMatches(grid(5, 5, { "0,0": "a-", "1,0": "a", "2,0": "a" }));
    expect(g).toHaveLength(1);
  });

  it("hasMatchAt est cohérent avec findMatches", () => {
    const st = grid(5, 5, cells([[0, 0], [1, 0], [0, 1], [1, 1], [4, 0], [4, 1], [4, 2]]));
    const inGroups = new Set(findMatches(st).flatMap((g) => g.cells));
    for (let i = 0; i < st.cells.length; i++) expect(hasMatchAt(st, i)).toBe(inGroups.has(i));
    expect(hasMatchAt(st, P(st, 2, 2))).toBe(false);
  });
});
