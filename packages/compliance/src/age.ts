/**
 * Âge et mineurs.
 *  - Protections commerciales et publicitaires : < 18 ans (DSA art. 28, 2005/29/CE annexe I pt 28).
 *  - Consentement RGPD : seuil national (RGPD art. 8, 13 à 16 ans ; France : 15 ans, loi 78-17 art. 45).
 *  - Chat : restreint sous 16 ans (choix produit).
 * Seuls la tranche d'âge et le mois de naissance sont conservés (minimisation : la date exacte n'est pas gardée).
 */
export const CONSENT_AGE: Record<string, number> = {
  FR: 15, BE: 13, DE: 16, ES: 14, IT: 14, NL: 16, AT: 14, IE: 16, PT: 13, DK: 13, SE: 13, FI: 13, PL: 16, LU: 16, CZ: 15, GR: 15, SI: 15,
};
export const DEFAULT_CONSENT_AGE = 16;
export const ADULT_AGE = 18;
export const CHAT_FREE_TEXT_AGE = 16;

export function consentAge(country: string, table: Record<string, number> = CONSENT_AGE): number {
  return table[country.toUpperCase()] ?? DEFAULT_CONSENT_AGE;
}

/** Validation de la table (config distante) : chaque seuil dans [13, 16] (AGE-03). */
export function validateConsentAgeTable(table: Record<string, number>): string[] {
  return Object.entries(table).filter(([, v]) => !Number.isInteger(v) || v < 13 || v > 16).map(([k, v]) => `seuil ${k} = ${v} hors [13, 16]`);
}

/** Âge révolu à `now`, depuis une date « AAAA-MM-JJ ». Renvoie null si la date est invalide ou future. */
export function ageFromBirth(birth: string, now: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  const n = new Date(now);
  if (date.getTime() > now || y < n.getUTCFullYear() - 120) return null;
  let age = n.getUTCFullYear() - y;
  if (n.getUTCMonth() < mo - 1 || (n.getUTCMonth() === mo - 1 && n.getUTCDate() < d)) age--;
  return age;
}

export type AgeBand = "unknown" | "minor" | "adult";

export interface AgeProfile {
  band: AgeBand;
  /** Sous le seuil national : aucun traitement fondé sur le consentement (GDPR-11). */
  underConsentAge: boolean;
  /** Chat en texte libre interdit (messages prédéfinis seulement). */
  chatRestricted: boolean;
}

export const UNKNOWN_AGE: AgeProfile = { band: "unknown", underConsentAge: true, chatRestricted: true };

export function ageProfile(age: number | null, country: string): AgeProfile {
  if (age === null) return UNKNOWN_AGE;
  return { band: age >= ADULT_AGE ? "adult" : "minor", underConsentAge: age < consentAge(country), chatRestricted: age < CHAT_FREE_TEXT_AGE };
}

/** Âge recalculé à partir du mois de naissance conservé (« AAAA-MM »), au plus tôt possible dans le mois (prudent). */
export function ageFromBirthMonth(birthMonth: string, now: number): number | null {
  return ageFromBirth(`${birthMonth}-${String(lastDay(birthMonth)).padStart(2, "0")}`, now);
}

function lastDay(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
