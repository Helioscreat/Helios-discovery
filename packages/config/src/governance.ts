/**
 * Gouvernance des données : durées de conservation (RGPD art. 5(1)(e)), sous-traitants et transferts
 * (art. 28, 44-46), journal des versions (directive 2019/770 art. 8(2)).
 * Ces tables sont la SOURCE UNIQUE : la purge du serveur et les documents juridiques (livrable 8) les lisent.
 */
export interface RetentionRule {
  table: string;
  /** Colonne de date (ms). */
  column: string;
  days: number;
  basis: string;
}

export const RETENTION: RetentionRule[] = [
  { table: "events", column: "at", days: 395, basis: "Mesure d'audience consentie : 13 mois (recommandation CNIL)" },
  { table: "messages", column: "at", days: 90, basis: "Chat d'équipe : 90 jours" },
  { table: "notifications", column: "at", days: 180, basis: "Notifications au joueur : 6 mois" },
  { table: "reports", column: "at", days: 730, basis: "Signalements et modération : 2 ans (traçabilité DSA)" },
  { table: "decisions", column: "at", days: 730, basis: "Décisions de modération : 2 ans (DSA art. 17)" },
  { table: "appeals", column: "at", days: 730, basis: "Recours : 2 ans (DSA art. 20)" },
  { table: "tickets", column: "at", days: 365, basis: "Demandes au point de contact : 1 an" },
  { table: "consents", column: "at", days: 1825, basis: "Preuve du consentement : 5 ans (prescription)" },
  { table: "ledger", column: "at", days: 3650, basis: "Pièces comptables : 10 ans (C. com. L123-22)" },
];

export interface Subprocessor {
  name: string;
  role: string;
  country: string;
  /** Hôtes contactés (liste blanche réseau). */
  hosts: string[];
  /** Garantie de transfert hors UE, ou « UE » si les données restent dans l'Union. */
  safeguard: "UE" | "DPF + CCT" | "CCT";
  dpa: string;
  /** Contacté seulement après consentement (SDK publicitaire). */
  afterConsent: boolean;
}

export const SUBPROCESSORS: Subprocessor[] = [
  { name: "Scaleway SAS", role: "Hébergement du serveur et de la base de données (région fr-par)", country: "FR", hosts: ["api.helios-discovery.example"], safeguard: "UE", dpa: "https://www.scaleway.com/en/contracts/", afterConsent: false },
  { name: "Google Ireland Ltd (Google Play)", role: "Paiement et vérification des achats (Android)", country: "IE", hosts: ["androidpublisher.googleapis.com"], safeguard: "DPF + CCT", dpa: "https://business.safety.google/processorterms/", afterConsent: false },
  { name: "Apple Distribution International", role: "Paiement et vérification des achats (iOS)", country: "IE", hosts: ["api.storekit.itunes.apple.com"], safeguard: "DPF + CCT", dpa: "https://www.apple.com/legal/internet-services/", afterConsent: false },
  { name: "Google Ireland Ltd (AdMob, UMP)", role: "Publicité récompensée et plateforme de consentement certifiée", country: "IE", hosts: ["googleads.g.doubleclick.net", "fundingchoicesmessages.google.com"], safeguard: "DPF + CCT", dpa: "https://business.safety.google/adsprocessorterms/", afterConsent: true },
  { name: "Google Ireland Ltd (Firebase Cloud Messaging)", role: "Envoi des notifications (Android), après opt-in", country: "IE", hosts: ["fcm.googleapis.com"], safeguard: "DPF + CCT", dpa: "https://firebase.google.com/terms/data-processing-terms", afterConsent: true },
  { name: "Apple Distribution International (APNs)", role: "Envoi des notifications (iOS), après opt-in", country: "IE", hosts: ["api.push.apple.com"], safeguard: "DPF + CCT", dpa: "https://www.apple.com/legal/internet-services/", afterConsent: true },
];

/** Régions d'hébergement autorisées (UE). */
export const EU_REGIONS = ["fr-par", "nl-ams", "pl-waw", "eu-west-3", "eu-central-1", "europe-west1", "europe-west9"];

export interface ReleaseNote {
  version: string;
  date: string;
  /** Mise à jour de sécurité ou de conformité (directive 2019/770 art. 8(2)). */
  compliance: boolean;
  notes: Record<"fr" | "en", string[]>;
}

export const CHANGELOG: ReleaseNote[] = [
  {
    version: "0.8.0",
    date: "2026-11-04",
    compliance: true,
    notes: {
      fr: ["Politique de confidentialité, conditions d'utilisation et de vente, mentions légales et déclaration d'accessibilité consultables dans le jeu, en 6 langues.", "« L'essentiel en 10 points » : les règles du jeu en version courte."],
      en: ["Privacy policy, terms of use and of sale, legal notice and accessibility statement available in the game, in 6 languages.", "\"The essentials in 10 points\": the rules in a short version."],
    },
  },
  {
    version: "0.7.0",
    date: "2026-11-04",
    compliance: true,
    notes: {
      fr: ["Notifications facultatives, désactivables par catégorie, jamais la nuit.", "Durées de conservation appliquées automatiquement.", "Jeu disponible en néerlandais, allemand, espagnol et italien."],
      en: ["Optional notifications, switchable per category, never at night.", "Retention periods applied automatically.", "Game available in Dutch, German, Spanish and Italian."],
    },
  },
  {
    version: "0.6.0",
    date: "2026-11-04",
    compliance: true,
    notes: {
      fr: ["Écran d'âge et choix de confidentialité au premier lancement.", "Export et suppression de vos données depuis les paramètres.", "Point de contact, signalement et recours."],
      en: ["Age screen and privacy choices on first launch.", "Export and deletion of your data from the settings.", "Contact point, reporting and appeals."],
    },
  },
  {
    version: "0.5.0",
    date: "2026-11-04",
    compliance: false,
    notes: { fr: ["Île, vies, boutique et passe de saison."], en: ["Island, lives, shop and season pass."] },
  },
];
