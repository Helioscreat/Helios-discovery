import { describe, expect, it } from "vitest";
import { FlashLimiter } from "../src/a11y/flash";
import { CATALOGS as APP_CATALOGS, detectLocale } from "../src/i18n";
import { fr } from "../src/i18n/fr";
import { PIECE_SHAPES, silhouetteDistance } from "../src/render/shapes";
import { CONTRAST_PAIRS, contrastRatio, PIECE_COLORS, TOKENS } from "../src/theme/tokens";
import { SCREENS } from "../src/ui/registry";

const CATALOGS = APP_CATALOGS as Record<string, Record<string, string>>;

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

/**
 * Motifs interdits, par langue : incitation directe à acheter (impératif), appel aux parents, urgence, rareté.
 * Les noms neutres (« achat », « Kauf », « compra ») restent permis : seules les injonctions sont visées.
 */
const FORBIDDEN_BY_LOCALE: Record<string, RegExp[]> = {
  fr: [
    /demande(r|z)?\s+(à|a)\s+(tes|vos|ton|ta|votre)\s+(parents?|papa|maman|mère|père)/i,
    /\bach[eè]te(r|z|s)?\b/i,
    /\bvite\b|\bdépêche/i,
    /plus que \d|\bderni(er|ère)s?\s+(chance|exemplaires?)\b/i,
    /offre limitée/i,
  ],
  en: [/ask\s+(your\s+)?(parents?|mum|mom|dad|father|mother)/i, /\bbuy\b|\bpurchase now\b/i, /\bhurry\b|\bquick(ly)?\b/i, /only \d+ left|last chance/i, /limited (time )?offer/i],
  nl: [/vraag\s+(het\s+)?(aan\s+)?(je|jouw)\s+(ouders|vader|moeder|papa|mama)/i, /\bkoop\b/i, /\bsnel\b|\bschiet op\b/i, /nog maar \d|laatste kans/i, /beperkte aanbieding/i],
  de: [/frag\s+(deine|deinen)\s+(eltern|vater|mutter|papa|mama)/i, /\bkauf(e)?\s+(jetzt|sofort|dir)\b|jetzt kaufen/i, /\bschnell\b|\bbeeil/i, /nur noch \d|letzte chance/i, /begrenztes angebot/i],
  es: [/pide(les)?\s+(a\s+)?(tus|tu)\s+(padres|padre|madre|papá|mamá)/i, /\bc[oó]mpra(lo|la|los|las)\b|\bcompra (ya|ahora)\b/i, /\bdate prisa\b|\br[aá]pido\b/i, /solo quedan \d|[uú]ltima oportunidad/i, /oferta limitada/i],
  it: [/chiedi\s+(ai|a)\s+(tuoi|tua|tuo)\s+(genitori|padre|madre|papà|mamma)/i, /\bcompra(lo|la|li|le)?\s+(ora|adesso|subito)\b|\bacquista\b/i, /\bsubito\b|\bsbrigati\b/i, /ne restano solo \d|ultima occasione/i, /offerta limitata/i],
};
const FORBIDDEN = Object.values(FORBIDDEN_BY_LOCALE).flat();

describe("[T-AGE-10] aucun texte n'incite un enfant à acheter ou à solliciter un parent", () => {
  for (const [loc, cat] of Object.entries(CATALOGS)) {
    it(`catalogue ${loc} : aucun motif interdit`, () => {
      for (const [key, text] of Object.entries(cat))
        for (const re of FORBIDDEN_BY_LOCALE[loc]) expect(text, `${loc}:${key}`).not.toMatch(re);
    });
  }

  it("le personnage-guide n'apparaît sur aucun écran d'achat", () => {
    for (const s of SCREENS) if (s.purchase) expect(s.usesCharacter, s.name).toBe(false);
  });

  it("chaque langue du jeu a ses motifs interdits", () => {
    for (const loc of Object.keys(CATALOGS)) expect(FORBIDDEN_BY_LOCALE[loc]?.length, loc).toBeGreaterThanOrEqual(5);
  });

  it("le lint détecte bien les formulations interdites (contrôle du contrôle)", () => {
    const bad = [
      "Demande à tes parents !", "Achète maintenant", "Vite, plus que 2 !", "Ask your mom", "Limited offer",
      "Vraag het aan je ouders", "Koop nu!", "Frag deine Eltern", "Jetzt kaufen", "Pide a tus padres", "¡Cómpralo ya!",
      "Chiedi ai tuoi genitori", "Acquista subito", "Ultima occasione",
    ];
    for (const b of bad) expect(FORBIDDEN.some((re) => re.test(b)), b).toBe(true);
  });
});

const DECLINE_WHITELIST: Record<string, string[]> = {
  fr: ["Non merci", "Fermer", "Refuser", "Tout refuser", "Abandonner", "Plus tard", "Retour", "Annuler"],
  en: ["No thanks", "Close", "Decline", "Refuse all", "Give up", "Later", "Back", "Cancel"],
  nl: ["Nee, bedankt", "Sluiten", "Weigeren", "Alles weigeren", "Opgeven", "Later", "Terug", "Annuleren"],
  de: ["Nein danke", "Schließen", "Ablehnen", "Alle ablehnen", "Aufgeben", "Später", "Zurück", "Abbrechen"],
  es: ["No, gracias", "Cerrar", "Rechazar", "Rechazar todo", "Abandonar", "Más tarde", "Volver", "Cancelar"],
  it: ["No, grazie", "Chiudi", "Rifiuta", "Rifiuta tutto", "Abbandona", "Più tardi", "Indietro", "Annulla"],
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
  it("[T-STO-05] six langues (fr, en, nl, de, es, it) : mêmes clés et mêmes paramètres {x} que le français", () => {
    const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    expect(Object.keys(CATALOGS).sort()).toEqual(["de", "en", "es", "fr", "it", "nl"]);
    for (const [loc, cat] of Object.entries(CATALOGS)) {
      expect(Object.keys(cat).sort(), loc).toEqual(Object.keys(fr).sort());
      for (const k of Object.keys(fr) as (keyof typeof fr)[]) expect(params(cat[k]), `${loc}:${k}`).toBe(params(fr[k]));
    }
  });

  it("[T-STO-05] la langue de l'appareil est reprise si elle est disponible, sinon l'anglais", () => {
    expect(detectLocale(["nl-BE", "fr-BE"])).toBe("nl");
    expect(detectLocale(["de-AT"])).toBe("de");
    expect(detectLocale(["es-ES"])).toBe("es");
    expect(detectLocale(["it-IT"])).toBe("it");
    expect(detectLocale(["pl-PL", "fr-FR"])).toBe("fr");
    expect(detectLocale(["pl-PL"])).toBe("en");
  });

  it("le nom du guide (Pépin) et le nom du jeu ne sont pas traduits", () => {
    for (const [loc, cat] of Object.entries(CATALOGS)) {
      expect(cat["app.title"], loc).toBe("Helios Discovery");
      expect(cat["tutorial.booster.body"], loc).toContain("Pépin");
    }
  });

  it("aucune chaîne vide", () => {
    for (const cat of Object.values(CATALOGS)) for (const [k, v] of Object.entries(cat)) expect(v.trim(), k).not.toBe("");
  });
});
