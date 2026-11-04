import { describe, expect, it } from "vitest";
import {
  adRequestParams, ageFromBirth, ageProfile, allowedSdks, checkMessage, checkNickname, CONSENT_AGE, consentAge, normalizeConsent,
  offeredPurposes, REFUSE_ALL, shouldRequestATT, showConsentScreen, statementOfReasons, validateConsentAgeTable, validateDecision,
} from "../src";

const NOW = Date.UTC(2026, 10, 4);
const born = (years: number, daysOffset = 0) => {
  const d = new Date(NOW - daysOffset * 86_400_000);
  return `${d.getUTCFullYear() - years}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

describe("âge", () => {
  it("âge révolu exact, dates invalides ou futures refusées", () => {
    expect(ageFromBirth(born(15), NOW)).toBe(15);
    expect(ageFromBirth(born(15, -1), NOW)).toBe(14); // anniversaire demain
    expect(ageFromBirth("2030-01-01", NOW)).toBeNull();
    expect(ageFromBirth("2010-02-30", NOW)).toBeNull();
    expect(ageFromBirth("abc", NOW)).toBeNull();
  });

  it("[T-AGE-03] seuils nationaux de consentement : FR 15, BE 13, DE 16, ES 14, IT 14, NL 16 ; inconnu → 16 ; table validée dans [13, 16]", () => {
    expect([consentAge("FR"), consentAge("BE"), consentAge("DE"), consentAge("ES"), consentAge("IT"), consentAge("NL"), consentAge("ZZ")]).toEqual([15, 13, 16, 14, 14, 16, 16]);
    expect(validateConsentAgeTable(CONSENT_AGE)).toEqual([]);
    expect(validateConsentAgeTable({ FR: 12 })).toHaveLength(1);
  });

  it("tranches : mineur < 18 ; sous le seuil national ; chat restreint < 16", () => {
    expect(ageProfile(14, "FR")).toEqual({ band: "minor", underConsentAge: true, chatRestricted: true });
    expect(ageProfile(15, "FR")).toEqual({ band: "minor", underConsentAge: false, chatRestricted: true });
    expect(ageProfile(15, "DE")).toEqual({ band: "minor", underConsentAge: true, chatRestricted: true });
    expect(ageProfile(17, "FR")).toEqual({ band: "minor", underConsentAge: false, chatRestricted: false });
    expect(ageProfile(18, "FR").band).toBe("adult");
  });
});

describe("consentement et publicité", () => {
  const all = { analytics: true, adsPersonalized: true, adsNonPersonalized: true };

  it("[T-AGE-04] mineur : jamais de pub personnalisée ni d'identifiant publicitaire, même s'il « accepte tout »", () => {
    for (const age of [15, 16, 17]) {
      const p = ageProfile(age, "FR");
      expect(offeredPurposes(p)).not.toContain("adsPersonalized");
      const c = normalizeConsent(p, all);
      expect(c.adsPersonalized).toBe(false);
      expect(adRequestParams(p, c)).toMatchObject({ npa: 1, tfua: 1, useAdId: false });
    }
    const adult = ageProfile(30, "FR");
    expect(adRequestParams(adult, normalizeConsent(adult, all))).toMatchObject({ npa: 0, tfua: 0, useAdId: true });
  });

  it("[T-AGE-05] ATT seulement pour un majeur qui consent à la pub personnalisée", () => {
    expect(shouldRequestATT(ageProfile(17, "FR"), normalizeConsent(ageProfile(17, "FR"), all))).toBe(false);
    expect(shouldRequestATT(ageProfile(30, "FR"), REFUSE_ALL)).toBe(false);
    expect(shouldRequestATT(ageProfile(30, "FR"), normalizeConsent(ageProfile(30, "FR"), all))).toBe(true);
  });

  it("sous le seuil national : aucune CMP, tout refusé ; refus total → pubs limitées sans identifiant ; aucun SDK avant décision", () => {
    const p = ageProfile(14, "FR");
    expect(showConsentScreen(p)).toBe(false);
    expect(normalizeConsent(p, all)).toEqual(REFUSE_ALL);
    const adult = ageProfile(30, "FR");
    expect(adRequestParams(adult, REFUSE_ALL)).toMatchObject({ limited: true, useAdId: false, npa: 1 });
    expect(allowedSdks(false, adult, all)).toEqual([]);
  });
});

describe("[T-DSA-07] filtre des messages et pseudonymes", () => {
  const BAD = [
    "t'es un connard", "quelle merde ce niveau", "sale pute", "espèce de batard", "fdp", "va te faire, salope", "c0nn4rd", "m e r d e", "MERDEEEE", "enculé",
    "fuck you", "you are a bitch", "what an asshole", "f u c k", "sh1t", "motherfucker", "stupid retard", "fuuuuck this", "you whore", "wanker",
    "je hebt een klootzak", "kut spel", "wat een hoer", "tering zeg", "eikel",
    "du arschloch", "scheiße", "hurensohn", "du wichser", "schlampe",
    "eres un gilipollas", "mierda de juego", "puta", "cabrón", "joder",
    "che cazzo", "sei uno stronzo", "vaffanculo", "puttana", "coglione",
  ];
  const PERSONAL = [
    "écris-moi : lea.martin@gmail.com", "mail me at john (at) mail (dot) com", "appelle le 06 12 34 56 78", "my number +33612345678",
    "va sur www.monsite.fr", "join discord.gg/abcd", "https://example.com/invite", "insta: moi.com", "0612345678", "contact: paul@exemple.fr",
  ];
  const CLEAN = [
    "Bonjour l'équipe !", "Merci pour les vies", "Quelqu'un a des vies ?", "Bien joué au niveau 140", "Je bloque sur le 212, des conseils ?",
    "Le coffre d'équipe est presque plein", "Bonne nuit tout le monde", "J'ai enfin fini la zone du verger", "La salopette de mon perso est trop belle",
    "Ma réputation de jardinier est faite", "Je joue sur mon computer", "On fait la course ce week-end ?", "Les bulles c'est pénible au début",
    "Astuce : garde le prisme pour la fin", "Classe ce niveau", "Super assortiment", "Le pdf des règles est où ?", "Tu as vu le nouveau tapis ?",
    "Hello team", "Thanks for the lives!", "Anyone need help?", "Well played", "That level was hard", "Good luck everyone", "See you tomorrow",
    "I love the dragonfly combo", "The class of this game", "Scunthorpe is a town", "My cocktail of boosters", "Assassin level 300 lol",
    "Hallo team", "Bedankt voor de levens", "Goed gespeeld", "Tot morgen", "Wie heeft er levens?", "De computer loopt vast", "Leuk spel",
    "Danke für die Leben", "Gut gespielt", "Bis morgen", "Wer braucht Hilfe?", "Schönes Level", "Ich mag die Libelle",
    "Gracias por las vidas", "Bien jugado", "Hasta mañana", "Mi computadora es lenta", "La disputa terminó", "Buena suerte",
    "Grazie per le vite", "Ben fatto", "A domani", "Buona fortuna", "Che bel livello", "Il computer è lento",
    "Niveau 50 terminé en 3 étoiles", "On est 28 dans l'équipe", "Je reviens dans 10 minutes", "Score de 12000 !", "J'ai 3 marteaux",
    "Le niveau 7 est marqué difficile", "Qui veut faire la quête du jour ?", "Le passe de saison finit dans 5 jours", "Trop fort le combo bombe + fusée",
    "J'ai crevé 12 bulles d'un coup", "La graine est passée par le portail", "Le générateur me rend fou", "Ouvert 2 coffres", "Gel 3 couches dur dur",
    "Jolie décoration de fontaine", "Je préfère la décoration 2", "La serre est restaurée", "Le moulin tourne enfin", "Cascade inversée finie",
    "Tu joues à quelle heure ?", "Pause café", "Je dois aller travailler", "Félicitations pour le niveau 1000", "Bienvenue au nouveau membre",
    "Merci capitaine", "Respect", "Allez on y croit", "Courage pour le 230", "Ça passe avec la croix de feu",
    "Je recommande le kit de départ", "Les cages s'ouvrent à côté", "Pensez à la roue du jour", "Les chaînes cassent avec un alignement", "Chouette",
    "Belle série", "Le lierre m'a eu", "Coup de chance", "Au top", "Encore 3 coups",
    "Qui a fini l'observatoire ?", "Nice combo", "Merci beaucoup", "Dankjewel", "Viel Spaß", "Mucho ánimo", "In bocca al lupo", "Le quai des nuages est joli",
    "Je passe la main", "On se retrouve demain soir",
  ];

  it("≥ 95 % des grossièretés et données personnelles détectées", () => {
    const missed = [...BAD, ...PERSONAL].filter((m) => checkMessage(m).ok);
    expect(missed.length / (BAD.length + PERSONAL.length), `manqués : ${missed.join(" | ")}`).toBeLessThanOrEqual(0.05);
  });

  it("< 2 % de faux positifs sur des messages ordinaires (6 langues)", () => {
    expect(CLEAN.length).toBeGreaterThanOrEqual(100);
    const fp = CLEAN.filter((m) => !checkMessage(m).ok);
    expect(fp.length / CLEAN.length, `faux positifs : ${fp.join(" | ")}`).toBeLessThan(0.02);
  });

  it("pseudonymes : format, grossièretés et données personnelles refusés", () => {
    expect(checkNickname("Jardinier42").ok).toBe(true);
    expect(checkNickname("ab").ok).toBe(false);
    expect(checkNickname("c0nnard").ok).toBe(false);
    expect(checkNickname("lea@mail.com").ok).toBe(false);
    expect(checkNickname("0612345678").ok).toBe(false);
  });
});

describe("décisions de modération", () => {
  it("une décision exige faits, fondement et modérateur ; la motivation inclut les voies de recours", () => {
    expect(validateDecision({ reportId: "r", moderatorId: "m", restriction: "removeContent", facts: "court", automated: false, ground: null })).toHaveLength(2);
    const ok = { reportId: "r", moderatorId: "m", restriction: "removeContent" as const, facts: "Message insultant envoyé à un membre de l'équipe.", automated: false, ground: { type: "tos" as const, clause: "CGU 4.2" } };
    expect(validateDecision(ok)).toEqual([]);
    expect(statementOfReasons(ok).redress).toEqual(["internalAppeal", "outOfCourtSettlement", "judicialRedress"]);
  });
});
