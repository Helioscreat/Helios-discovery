import { describe, expect, it } from "vitest";
import { FlashLimiter } from "../src/a11y/flash";
import { en } from "../src/i18n/en";
import { fr } from "../src/i18n/fr";
import { PIECE_SHAPES, silhouetteDistance } from "../src/render/shapes";
import { CONTRAST_PAIRS, contrastRatio, PIECE_COLORS, TOKENS } from "../src/theme/tokens";
import { SCREENS } from "../src/ui/registry";

const CATALOGS = { fr, en } as Record<string, Record<string, string>>;

describe("[T-ACC-02] contrastes WCAG 2.1 AA des jetons de couleur", () => {
  it("calcul de référence : noir sur blanc = 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });
  for (const [fg, bg, min] of CONTRAST_PAIRS) {
    it(`${fg} sur ${bg} ≥ ${min}:1`, () => {
      expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("[T-ACC-04] accessibilité du rendu : formes, flashs", () => {
  it("chaque couleur de pièce a une forme", () => {
    expect(PIECE_SHAPES).toHaveLength(PIECE_COLORS.length);
  });

  it("les 6 silhouettes sont distinctes deux à deux (1 − IoU ≥ 0,15, lisibles sans la couleur)", () => {
    for (let a = 0; a < PIECE_SHAPES.length; a++)
      for (let b = a + 1; b < PIECE_SHAPES.length; b++) {
        const d = silhouetteDistance(PIECE_SHAPES[a], PIECE_SHAPES[b]);
        expect(d, `formes ${a} et ${b}`).toBeGreaterThanOrEqual(0.15);
      }
  });

  it("limiteur : au plus 3 flashs par seconde glissante, même sous une rafale", () => {
    const f = new FlashLimiter(3, 1000);
    const played: number[] = [];
    for (let now = 0; now < 5000; now += 16) if (f.allow(now)) played.push(now); // 60 demandes/s
    expect(FlashLimiter.peakRate(played)).toBeLessThanOrEqual(3);
    expect(played.length).toBeGreaterThanOrEqual(14); // la limite n'empêche pas tout flash
  });

  it("peakRate détecte une rafale de 4 flashs en moins d'une seconde", () => {
    expect(FlashLimiter.peakRate([0, 200, 400, 600])).toBe(4);
    expect(FlashLimiter.peakRate([0, 1000, 2000, 3000])).toBe(1);
  });
});

/** Motifs interdits : incitation directe à acheter, appel aux parents, urgence, rareté. */
const FORBIDDEN: RegExp[] = [
  /demande(r|z)?\s+(à|a)\s+(tes|vos|ton|ta|votre)\s+(parents?|papa|maman|mère|père)/i,
  /ask\s+(your\s+)?(parents?|mum|mom|dad|father|mother)/i,
  /\bach[eè]te(r|z|s)?\b/i,
  /\bbuy\b|\bpurchase now\b/i,
  /\bvite\b|\bdépêche|\bhurry\b|\bquick(ly)?\b/i,
  /plus que \d|only \d+ left|\bderni(er|ère)s?\s+(chance|exemplaires?)\b|last chance/i,
  /offre limitée|limited (time )?offer/i,
];

describe("[T-AGE-10] aucun texte n'incite un enfant à acheter ou à solliciter un parent", () => {
  for (const [loc, cat] of Object.entries(CATALOGS)) {
    it(`catalogue ${loc} : aucun motif interdit`, () => {
      for (const [key, text] of Object.entries(cat))
        for (const re of FORBIDDEN) expect(text, `${loc}:${key}`).not.toMatch(re);
    });
  }

  it("le personnage-guide n'apparaît sur aucun écran d'achat", () => {
    for (const s of SCREENS) if (s.purchase) expect(s.usesCharacter, s.name).toBe(false);
  });

  it("le lint détecte bien les formulations interdites (contrôle du contrôle)", () => {
    const bad = ["Demande à tes parents !", "Achète maintenant", "Vite, plus que 2 !", "Ask your mom", "Limited offer"];
    for (const b of bad) expect(FORBIDDEN.some((re) => re.test(b)), b).toBe(true);
  });
});

const DECLINE_WHITELIST: Record<string, string[]> = {
  fr: ["Non merci", "Fermer", "Refuser", "Abandonner", "Plus tard", "Retour", "Annuler"],
  en: ["No thanks", "Close", "Decline", "Give up", "Later", "Back", "Cancel"],
};

describe("[T-COM-06] libellés de refus neutres (liste blanche)", () => {
  for (const [loc, cat] of Object.entries(CATALOGS)) {
    it(`catalogue ${loc}`, () => {
      const declines = Object.entries(cat).filter(([k]) => k.startsWith("decline."));
      expect(declines.length).toBeGreaterThan(0);
      for (const [k, v] of declines) expect(DECLINE_WHITELIST[loc], `${loc}:${k}`).toContain(v);
    });
  }
});

describe("catalogues de traduction", () => {
  it("mêmes clés et mêmes paramètres {x} en français et en anglais", () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) expect(params(en[k]), k).toBe(params(fr[k]));
  });

  it("aucune chaîne vide", () => {
    for (const cat of Object.values(CATALOGS)) for (const [k, v] of Object.entries(cat)) expect(v.trim(), k).not.toBe("");
  });
});
