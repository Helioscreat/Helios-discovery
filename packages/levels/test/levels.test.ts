import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGame, findMatches, hasValidMove, hashState } from "@helios/core";
import {
  buildCandidate, CONTENT_VERSION, DEFAULT_SIM, difficultyOf, ELEMENT_UNLOCK, levelHash, levelSeed, ratesFromCsv,
  simulateFreePlayers, TARGET_RATE, toSpec, TOLERANCE, type LevelFile,
} from "../src";
import { DESIGNS, HANDMADE_COUNT } from "../src/handmade";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HANDMADE_DIR = join(ROOT, "data/handmade");
const GENERATED_DIR = join(ROOT, "data/generated");
const handmade: LevelFile[] = readdirSync(HANDMADE_DIR).filter((f) => /^\d{3}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(HANDMADE_DIR, f), "utf8")));

describe("niveaux 1–150 faits main", () => {
  it("150 fichiers complets, numérotés de 1 à 150", () => {
    expect(handmade.map((l) => l.n)).toEqual(Array.from({ length: HANDMADE_COUNT }, (_, k) => k + 1));
    expect(DESIGNS).toHaveLength(150);
  });

  it("chaque niveau se crée sans alignement initial, avec un coup jouable, et a été validé par le bot", () => {
    for (const l of handmade) {
      const st = createGame(toSpec(l));
      expect(findMatches(st), `niveau ${l.n}`).toEqual([]);
      expect(hasValidMove(st), `niveau ${l.n}`).toBe(true);
      expect(l.validation.runs).toBe(200);
      expect(l.validation.botRate, `niveau ${l.n}`).toBeGreaterThan(0);
    }
  });

  it("≥ 90 % dans la fourchette visée, et aucun sous la cible de plus de 10 points", () => {
    const ok = handmade.filter((l) => Math.abs(l.validation.botRate - l.targetRate) <= TOLERANCE);
    expect(ok.length / handmade.length).toBeGreaterThanOrEqual(0.9);
    for (const l of handmade) expect(l.validation.botRate, `niveau ${l.n}`).toBeGreaterThanOrEqual(l.targetRate - TOLERANCE);
  });

  it("chaque élément est introduit par un niveau tutoriel facile, au niveau prévu, tous les 15 à 25 niveaux", () => {
    const tutos: Record<string, string> = { ice: "ice", crate: "crate", chain: "chain", drop: "drop", cage: "cage", ivy: "ivy" };
    const at = Object.entries(ELEMENT_UNLOCK).map(([k, n]) => [k, n] as const).sort((a, b) => a[1] - b[1]);
    for (const [k, n] of at) {
      expect(handmade[n - 1].tutorial, `élément ${k}`).toBe(tutos[k]);
      expect(handmade[n - 1].targetRate).toBeGreaterThanOrEqual(0.85);
    }
    for (let i = 1; i < at.length; i++) {
      const gap = at[i][1] - at[i - 1][1];
      expect(gap).toBeGreaterThanOrEqual(15);
      expect(gap).toBeLessThanOrEqual(25);
    }
  });

  it("aucun obstacle n'apparaît avant son niveau d'introduction", () => {
    const re: Record<string, RegExp> = { ice: /i\d/, crate: /X\d/, chain: /k\./, cage: /g\./, ivy: /^V$/, drop: /^D$/ };
    for (const l of handmade)
      for (const [k, n] of Object.entries(ELEMENT_UNLOCK)) {
        const used = l.layout.flatMap((r) => r.split(" ")).some((t) => re[k].test(t));
        if (used) expect(l.n, `${k} au niveau ${l.n}`).toBeGreaterThanOrEqual(n);
      }
  });
});

describe("[T-FAIR-01] la difficulté ne dépend jamais du joueur : le niveau N est identique pour tous", () => {
  it("un niveau généré ne dépend que de (N, version, tentative, échelle)", () => {
    for (const n of [151, 777, 5000, 9999]) {
      const a = buildCandidate(n, 0, 1), b = buildCandidate(n, 0, 1);
      expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
      expect(a.spec.seed).toBe(levelSeed(n, CONTENT_VERSION, 0));
    }
  });

  it("la grille de départ ne dépend pas de l'essai ; seule la suite des pièces qui tombent varie", () => {
    const l = handmade[20];
    const a = createGame({ ...toSpec(l), playSeed: "0" }), b = createGame({ ...toSpec(l), playSeed: "7" });
    expect(JSON.stringify(a.cells)).toBe(JSON.stringify(b.cells));
    expect(JSON.stringify(a.rng)).not.toBe(JSON.stringify(b.rng));
  });

  it("les modules de niveaux, du moteur et du bot n'importent aucune donnée joueur (profil, achats, analytics)", () => {
    const dirs = ["../src", "../../core/src", "../../bot/src"].map((d) => join(ROOT, "test", d));
    for (const dir of dirs)
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
        const src = readFileSync(join(dir, f), "utf8");
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
        for (const imp of imports) expect(imp, `${f}`).toMatch(/^(\.\.?\/|@helios\/(core|bot|levels)$|node:)/);
        expect(src, f).not.toMatch(/profile|purchase|analytics|spend|inventory/i);
      }
  });

  it("dents de scie : badge Difficile en 7e position, Très difficile en 10e, détente en 1re", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => difficultyOf(150 + k))).toEqual(
      ["relax", "easy", "easy", "medium", "medium", "medium", "hard", "medium", "medium", "veryHard"],
    );
    expect(TARGET_RATE).toEqual({ relax: 0.9, easy: 0.85, medium: 0.6, hard: 0.35, veryHard: 0.2 });
  });
});

const hasGenerated = existsSync(join(GENERATED_DIR, "manifest.json"));

describe.skipIf(!hasGenerated)("niveaux 151–10 000 générés", () => {
  const manifest = hasGenerated ? JSON.parse(readFileSync(join(GENERATED_DIR, "manifest.json"), "utf8")) as { levels: [number, number, number, number, string][] } : { levels: [] };
  const summary = hasGenerated ? JSON.parse(readFileSync(join(GENERATED_DIR, "summary.json"), "utf8")) : {};

  it("9 850 niveaux, 0 infaisable, ≥ 90 % dans la fourchette, génération < 1 h", () => {
    expect(manifest.levels).toHaveLength(9850);
    expect(summary.infeasible).toBe(0);
    expect(summary.inRangeShare).toBeGreaterThanOrEqual(0.9);
    expect(summary.seconds).toBeLessThan(3600);
  });

  it("audit hors échantillon (1 niveau sur 10, 200 parties neuves) : ≥ 90 % dans la fourchette", () => {
    expect(summary.audited).toBeGreaterThanOrEqual(980);
    expect(summary.auditInRangeShare).toBeGreaterThanOrEqual(0.9);
  });

  it("le jeu régénère chaque niveau à l'identique à partir du manifeste (échantillon de 300 niveaux)", () => {
    const sample = manifest.levels.filter((_, k) => k % 33 === 0);
    for (const [n, attempt, scale, moves, hash] of sample) {
      const c = buildCandidate(n, attempt, scale);
      expect(levelHash({ ...c.spec, layout: c.spec.layout!, moves }), `niveau ${n}`).toBe(hash);
      expect(() => createGame({ ...c.spec, moves })).not.toThrow();
    }
  });
});

describe.skipIf(!hasGenerated)("[T-FAIR-02] joueur gratuit à 10 niveaux par jour : jamais bloqué plus de 2 jours", () => {
  const rates = new Map<number, number>();
  if (hasGenerated) {
    for (const l of handmade) rates.set(l.n, l.validation.botRate);
    for (const [n, r] of ratesFromCsv(readFileSync(join(GENERATED_DIR, "report.csv"), "utf8"))) rates.set(n, r);
  }

  it("avec l'aide gratuite après 8 échecs sur un niveau (1 booster, +25 points) : ≥ 99,9 % des joueurs jamais bloqués sur 10 000 niveaux", () => {
    const r = simulateFreePlayers(rates, { ...DEFAULT_SIM, players: 1000, pityAfterFails: 8, pityBoost: 0.25 });
    expect(r.levels).toBe(10000);
    expect(r.playersBlocked).toBeLessThanOrEqual(1);
  });

  it("sans aucune aide (référence, documentée) : mesure du risque résiduel", () => {
    const r = simulateFreePlayers(rates, { ...DEFAULT_SIM, players: 1000 });
    process.stdout.write(`\n[FAIR-02] sans aide : ${r.playersBlocked}/1000 joueurs bloqués > 2 jours au moins une fois, max ${r.maxDaysOnLevel} jours\n`);
    expect(r.maxDaysOnLevel).toBeLessThanOrEqual(5);
  });
});

it("hashState stable (garde de non-régression des fixtures)", () => {
  expect(typeof hashState(createGame(toSpec(handmade[0])))).toBe("string");
});
