import type { AgeProfile } from "./age";

/**
 * Consentement (RGPD art. 4(11), 7 ; ePrivacy art. 5(3)).
 *
 * Deux mécanismes, chacun pour ce qu'il sait gérer :
 *  - **notre écran** recueille la seule finalité qui nous est propre : la mesure d'audience first-party ;
 *  - **Google UMP** (CMP certifiée, TCF v2.2) recueille le consentement à la publicité Google AdMob, comme Google
 *    l'exige dans l'EEE. Le choix détaillé (chaîne TC) est stocké par le SDK sur l'appareil ; nous ne conservons que
 *    le statut renvoyé par UMP et sa date.
 * La version de la notice est conservée avec chaque choix (preuve du consentement, art. 7(1)).
 */
export type Purpose = "analytics";
export const PURPOSES: Purpose[] = ["analytics"];
export const CONSENT_NOTICE_VERSION = "2026-11-v2";

export type ConsentChoice = Record<Purpose, boolean>;
export const REFUSE_ALL: ConsentChoice = { analytics: false };

/** Finalités proposées sur notre écran. Sous l'âge du consentement national (ou âge inconnu) : aucune. */
export function offeredPurposes(p: AgeProfile): Purpose[] {
  if (p.underConsentAge || p.band === "unknown") return [];
  return PURPOSES;
}

/** Notre écran n'est affiché que s'il y a au moins une finalité à proposer (GDPR-11). */
export const showConsentScreen = (p: AgeProfile) => offeredPurposes(p).length > 0;

/** Applique la politique : une finalité non proposée est toujours refusée, quoi que dise le client. */
export function normalizeConsent(p: AgeProfile, choice: Partial<ConsentChoice>): ConsentChoice {
  return { analytics: offeredPurposes(p).includes("analytics") && !!choice.analytics };
}

// ───────────────────────── Google UMP ─────────────────────────
/** Statuts renvoyés par UMP (ConsentInformation.ConsentStatus). */
export type UmpStatus = "UNKNOWN" | "REQUIRED" | "OBTAINED" | "NOT_REQUIRED";
export const UMP_STATUSES: UmpStatus[] = ["UNKNOWN", "REQUIRED", "OBTAINED", "NOT_REQUIRED"];

/** Résultat d'UMP gardé par le jeu : `canRequestAds` est la seule autorité pour lancer une requête publicitaire. */
export interface AdsConsentState {
  status: UmpStatus;
  canRequestAds: boolean;
  /** UMP exige un point d'entrée « choix publicitaires » permanent dans les paramètres. */
  privacyOptionsRequired: boolean;
}
export const ADS_UNKNOWN: AdsConsentState = { status: "UNKNOWN", canRequestAds: false, privacyOptionsRequired: false };

/**
 * Faut-il appeler UMP, et comment (AGE-04, GDPR-11) :
 *  - âge inconnu, sous l'âge du consentement national, ou publicité coupée dans le pays : jamais (aucun appel à Google) ;
 *  - mineur au-dessus de ce seuil : `tagForUnderAgeOfConsent` (UMP n'affiche aucun formulaire, publicité limitée) ;
 *  - majeur : formulaire UMP si Google le juge nécessaire.
 */
export type UmpPlan =
  | { call: false; reason: "unknownAge" | "underConsentAge" | "adsDisabled" }
  | { call: true; tagForUnderAgeOfConsent: boolean; mayShowForm: boolean };

export function umpPlan(p: AgeProfile, adsEnabled = true): UmpPlan {
  if (p.band === "unknown") return { call: false, reason: "unknownAge" };
  if (p.underConsentAge) return { call: false, reason: "underConsentAge" };
  if (!adsEnabled) return { call: false, reason: "adsDisabled" };
  const minor = p.band !== "adult";
  return { call: true, tagForUnderAgeOfConsent: minor, mayShowForm: !minor };
}

/**
 * Paramètres d'une requête publicitaire.
 *  - `allowed` : UMP consulté et `canRequestAds` vrai ; sinon aucune requête ;
 *  - mineur : `tfua` = 1 et `npa` = 1 en plus du marquage UMP (jamais de publicité personnalisée, DSA art. 28) ;
 *  - majeur : la personnalisation suit la chaîne TC écrite par UMP, lue directement par le SDK.
 */
export interface AdParams {
  allowed: boolean;
  tfua: 0 | 1;
  npa: 0 | 1;
}

export function adRequestParams(p: AgeProfile, ads: AdsConsentState, adsEnabled = true): AdParams {
  const plan = umpPlan(p, adsEnabled);
  const minor = p.band !== "adult";
  return { allowed: plan.call && ads.status !== "UNKNOWN" && ads.canRequestAds, tfua: minor ? 1 : 0, npa: minor ? 1 : 0 };
}

/** App Tracking Transparency (iOS) : seulement un majeur dont UMP a recueilli le consentement (AGE-05). */
export function shouldRequestATT(p: AgeProfile, ads: AdsConsentState): boolean {
  return p.band === "adult" && !p.underConsentAge && ads.status === "OBTAINED" && ads.canRequestAds;
}

/**
 * SDK tiers autorisés (GDPR-03). Rien avant la fin de notre écran (âge, puis mesure d'audience).
 * Ensuite : UMP seulement si le plan l'autorise ; AdMob seulement si UMP l'autorise.
 */
export function allowedSdks(decided: boolean, p: AgeProfile, ads: AdsConsentState, adsEnabled = true): string[] {
  if (!decided) return [];
  const out: string[] = [];
  if (umpPlan(p, adsEnabled).call) out.push("ump");
  if (adRequestParams(p, ads, adsEnabled).allowed) out.push("ads");
  return out;
}
