import type { AgeProfile } from "./age";

/**
 * Consentement (RGPD art. 4(11), 7 ; ePrivacy art. 5(3)). Trois finalités séparées, toutes refusées par défaut.
 * La version de la notice est conservée avec chaque choix (preuve du consentement, art. 7(1)).
 */
export type Purpose = "analytics" | "adsPersonalized" | "adsNonPersonalized";
export const PURPOSES: Purpose[] = ["analytics", "adsPersonalized", "adsNonPersonalized"];
export const CONSENT_NOTICE_VERSION = "2026-11-v1";

export type ConsentChoice = Record<Purpose, boolean>;
export const REFUSE_ALL: ConsentChoice = { analytics: false, adsPersonalized: false, adsNonPersonalized: false };

/** Finalités proposées à ce joueur. Mineur : jamais la pub personnalisée. Sous le seuil national : aucune. */
export function offeredPurposes(p: AgeProfile): Purpose[] {
  if (p.underConsentAge || p.band === "unknown") return [];
  if (p.band === "minor") return ["analytics", "adsNonPersonalized"];
  return PURPOSES;
}

/** La CMP n'est affichée que s'il y a au moins une finalité à proposer (GDPR-11). */
export const showConsentScreen = (p: AgeProfile) => offeredPurposes(p).length > 0;

/** Applique la politique : une finalité non proposée est toujours refusée, quoi que dise le client. */
export function normalizeConsent(p: AgeProfile, choice: Partial<ConsentChoice>): ConsentChoice {
  const offered = new Set(offeredPurposes(p));
  return {
    analytics: offered.has("analytics") && !!choice.analytics,
    adsPersonalized: offered.has("adsPersonalized") && !!choice.adsPersonalized,
    adsNonPersonalized: offered.has("adsNonPersonalized") && !!choice.adsNonPersonalized,
  };
}

/**
 * Paramètres d'une requête publicitaire (AGE-04).
 *  - npa = 1 : non personnalisée ; tfua = 1 : utilisateur sous l'âge du consentement / mineur.
 *  - `limited` : annonces « limitées » sans identifiant ni stockage (refus de toute finalité publicitaire).
 *  - `allowed` : false = aucune requête publicitaire (âge inconnu, ou sous le seuil sans finalité possible).
 */
export interface AdParams {
  allowed: boolean;
  npa: 0 | 1;
  tfua: 0 | 1;
  limited: boolean;
  useAdId: boolean;
}

export function adRequestParams(p: AgeProfile, c: ConsentChoice): AdParams {
  if (p.band === "unknown") return { allowed: false, npa: 1, tfua: 1, limited: true, useAdId: false };
  const minor = p.band !== "adult";
  const personalized = !minor && c.adsPersonalized;
  return {
    allowed: true,
    npa: personalized ? 0 : 1,
    tfua: minor || p.underConsentAge ? 1 : 0,
    limited: !c.adsPersonalized && !c.adsNonPersonalized,
    useAdId: personalized,
  };
}

/** App Tracking Transparency (iOS) : uniquement pour un majeur qui consent à la pub personnalisée (AGE-05). */
export function shouldRequestATT(p: AgeProfile, c: ConsentChoice): boolean {
  return p.band === "adult" && c.adsPersonalized;
}

/** SDK tiers autorisés selon le consentement (GDPR-03). Aucun avant la décision. */
export function allowedSdks(decided: boolean, p: AgeProfile, c: ConsentChoice): string[] {
  if (!decided) return [];
  const out: string[] = [];
  const ad = adRequestParams(p, c);
  if (ad.allowed) out.push("ads");
  return out;
}
