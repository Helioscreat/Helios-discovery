/**
 * Déclarations aux stores, générées depuis l'inventaire et le catalogue :
 *  - Google Play « Sécurité des données » (STO-02) et manifeste Apple PrivacyInfo.xcprivacy (STO-04) ;
 *  - réponses au questionnaire IARC (STO-01) ;
 *  - fiche éditeur « professionnel » des deux consoles (DSA-06) ;
 *  - contrôle Familles des SDK (STO-03) et recherche de paiements hors store (STO-04).
 */
import { CATALOG } from "@helios/economy";
import type { Block, Doc } from "./blocks";
import { DATA_TYPES, TREATMENTS, type AppleType, type DataType, type Purpose } from "./inventory";
import { noticeFields } from "./documents";
import { LEGAL_VERSION, PUBLISHER } from "./publisher";

const GOOGLE_PURPOSE: Record<Purpose, string> = {
  AppFunctionality: "Fonctionnement de l'application", Analytics: "Analyses", ThirdPartyAdvertising: "Publicité ou marketing",
  FraudPrevention: "Prévention des fraudes, sécurité et conformité", AccountManagement: "Gestion du compte", LegalCompliance: "Prévention des fraudes, sécurité et conformité",
};

/** Formulaire « Sécurité des données » : une ligne par catégorie Google, fusion des types de données. */
export function dataSafety(): Doc {
  const byCat = new Map<string, DataType[]>();
  for (const d of DATA_TYPES) byCat.set(d.google, [...(byCat.get(d.google) ?? []), d]);
  const rows = [...byCat.entries()].map(([cat, ds]) => [
    cat,
    "Oui",
    ds.some((d) => d.shared) ? `Oui (${ds.filter((d) => d.shared).map((d) => d.id).join(", ")})` : "Non",
    ds.every((d) => d.optional) ? "Facultatif" : "Obligatoire",
    [...new Set(ds.flatMap((d) => d.purposes.map((p) => GOOGLE_PURPOSE[p])))].join(" ; "),
    ds.map((d) => d.id).join(", "),
  ]);
  const blocks: Block[] = [
    { h: 1, text: "Google Play — Sécurité des données" },
    { p: `Réponses générées depuis packages/legal/src/inventory.ts (${LEGAL_VERSION.label}). À reporter dans Play Console > Contenu de l'application > Sécurité des données.` },
    { h: 2, text: "Pratiques générales" },
    { table: { head: ["Question", "Réponse"], rows: [
      ["L'application collecte-t-elle ou partage-t-elle des données utilisateur des types requis ?", "Oui"],
      ["Toutes les données collectées sont-elles chiffrées en transit ?", "Oui (HTTPS)"],
      ["Proposez-vous un moyen de demander la suppression des données ?", `Oui : dans l'application (Paramètres > Confidentialité) et via ${PUBLISHER.contactForm}`],
      ["Application conforme à la politique Familles ?", "Non applicable : public 13 ans et plus, hors programme Familles"],
    ] } },
    { h: 2, text: "Types de données" },
    { table: { head: ["Catégorie", "Collectée", "Partagée", "Obligatoire", "Finalités", "Types internes"], rows } },
    { p: "« Partagée » signifie transmise à un tiers pour son propre compte : seul l'identifiant publicitaire l'est (SDK Google Mobile Ads, après consentement). Les données traitées par nos sous-traitants pour notre compte ne sont pas « partagées » au sens de Google." },
  ];
  return { id: "data-safety", lang: "fr", title: "Sécurité des données", blocks };
}

const APPLE_PURPOSE: Record<Purpose, string> = {
  AppFunctionality: "NSPrivacyCollectedDataTypePurposeAppFunctionality", Analytics: "NSPrivacyCollectedDataTypePurposeAnalytics",
  ThirdPartyAdvertising: "NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising", FraudPrevention: "NSPrivacyCollectedDataTypePurposeAppFunctionality",
  AccountManagement: "NSPrivacyCollectedDataTypePurposeAppFunctionality", LegalCompliance: "NSPrivacyCollectedDataTypePurposeOther",
};

/** Hôtes de suivi : ceux du SDK publicitaire (contactés seulement après consentement et autorisation ATT). */
export const TRACKING_DOMAINS = ["googleads.g.doubleclick.net"];

/** PrivacyInfo.xcprivacy (plist) : types collectés par notre code et par les SDK déclarés, API à raison requise. */
export function privacyManifest(): string {
  const byType = new Map<AppleType, DataType[]>();
  for (const d of DATA_TYPES) if (d.apple) byType.set(d.apple, [...(byType.get(d.apple) ?? []), d]);
  const types = [...byType.entries()].map(([t, ds]) => {
    const purposes = [...new Set(ds.flatMap((d) => d.purposes.map((p) => APPLE_PURPOSE[p])))];
    return `\t\t<dict>
\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t<string>NSPrivacyCollectedDataType${t}</string>
\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t<${ds.some((d) => d.id !== "ads.deviceId")}/>
\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t<${ds.some((d) => d.tracking)}/>
\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t<array>
${purposes.map((p) => `\t\t\t\t<string>${p}</string>`).join("\n")}
\t\t\t</array>
\t\t</dict>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Généré par packages/legal (npm run build -w @helios/legal). Ne pas modifier à la main. -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>NSPrivacyTracking</key>
\t<${DATA_TYPES.some((d) => d.tracking)}/>
\t<key>NSPrivacyTrackingDomains</key>
\t<array>
${TRACKING_DOMAINS.map((h) => `\t\t<string>${h}</string>`).join("\n")}
\t</array>
\t<key>NSPrivacyCollectedDataTypes</key>
\t<array>
${types.join("\n")}
\t</array>
\t<key>NSPrivacyAccessedAPITypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>NSPrivacyAccessedAPIType</key>
\t\t\t<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>
\t\t\t<array>
\t\t\t\t<string>CA92.1</string>
\t\t\t</array>
\t\t</dict>
\t</array>
</dict>
</plist>
`;
}

/** Contenus payants aléatoires : interdits (RNG-01) ; le questionnaire IARC doit répondre « non ». */
const RANDOM_FIELDS = ["random", "lootTable", "drop", "probabilities"];
export const paidRandomItems = () => CATALOG.filter((s) => RANDOM_FIELDS.some((f) => JSON.stringify(s).includes(`"${f}"`)));

export interface IarcAnswer { question: string; answer: "Oui" | "Non"; source: string }

export function iarcAnswers(): IarcAnswer[] {
  const chat = TREATMENTS.some((t) => t.id === "chat");
  return [
    { question: "Violence (y compris cartoon ou fantastique)", answer: "Non", source: "GDD : match-3 sans combat" },
    { question: "Peur, horreur", answer: "Non", source: "GDD" },
    { question: "Contenu sexuel ou nudité", answer: "Non", source: "GDD" },
    { question: "Langage grossier dans le contenu du jeu", answer: "Non", source: "Catalogues de textes (lint des 6 langues)" },
    { question: "Drogues, alcool, tabac", answer: "Non", source: "GDD" },
    { question: "Discrimination", answer: "Non", source: "GDD" },
    { question: "Jeux d'argent réels", answer: "Non", source: "Aucune mise d'argent" },
    { question: "Jeux d'argent simulés", answer: "Non", source: "La roue du jour est gratuite, sans mise ni gain monétaire (à confirmer selon la définition IARC en vigueur)" },
    { question: "Achats numériques intégrés", answer: CATALOG.length > 0 ? "Oui" : "Non", source: `${CATALOG.length} articles dans le catalogue` },
    { question: "Achats d'éléments aléatoires payants (loot boxes)", answer: paidRandomItems().length ? "Oui" : "Non", source: "Validateur RNG-01 du catalogue" },
    { question: "Les utilisateurs peuvent interagir ou échanger du contenu", answer: chat ? "Oui" : "Non", source: "Chat d'équipe (messages prédéfinis sous 16 ans)" },
    { question: "Partage de la position de l'utilisateur", answer: "Non", source: "Inventaire : aucune donnée de localisation" },
  ];
}

export function iarc(): Doc {
  const rows = iarcAnswers().map((a) => [a.question, a.answer, a.source]);
  return {
    id: "iarc",
    lang: "fr",
    title: "Questionnaire IARC",
    blocks: [
      { h: 1, text: "Questionnaire IARC (Google Play et App Store)" },
      { p: `Réponses archivées (${LEGAL_VERSION.label}), contrôlées automatiquement contre le catalogue et l'inventaire. Classification attendue : PEGI 3 avec les mentions « Achats intégrés » et « Interactions entre utilisateurs » ; à confirmer par le certificat IARC.` },
      { table: { head: ["Question", "Réponse", "Justification"], rows } },
      { p: "App Store Connect : utiliser les mêmes réponses dans le questionnaire de classification d'âge ; cocher « Achats intégrés » et « Contenu généré par les utilisateurs » (chat filtré et modéré)." },
    ],
  };
}

/** Configuration du message RGPD dans AdMob (Google UMP) : ce que le code ne peut pas imposer. */
export function umpConfig(): Doc {
  const langs = ["fr", "en", "nl", "de", "es", "it"];
  return {
    id: "ump-config",
    lang: "fr",
    title: "Configuration Google UMP",
    blocks: [
      { h: 1, text: "Google UMP : configuration du message RGPD dans AdMob" },
      { p: "Le formulaire de consentement publicitaire est rendu par Google à partir de la configuration saisie dans AdMob > Confidentialité et messages. Le jeu l'appelle (packages/compliance umpPlan, apps/game/src/game/ump.ts) mais n'en contrôle ni le texte ni les boutons. Cette liste est à vérifier à chaque modification du message et avant chaque publication." },
      { h: 2, text: "Message « Réglementations européennes » (RGPD)" },
      { ul: [
        "Créer un message pour l'application Android et pour l'application iOS (même configuration).",
        `Langues : ${langs.join(", ")} (mêmes langues que le jeu).`,
        "Activer le bouton « Ne pas autoriser » sur le premier écran, au même niveau que « Autoriser » (GDPR-02, COM-04) ; vérifier sur une capture que les deux boutons ont la même taille et le même contraste.",
        "Garder « Gérer les options » pour le choix finalité par finalité.",
        "Partenaires publicitaires : liste personnalisée réduite à Google ; n'ajouter aucun autre partenaire sans mettre à jour la politique de confidentialité et le registre.",
        `Lien vers la politique de confidentialité : ${PUBLISHER.website}/legal/fr/privacy.html (et la langue de chaque message).`,
        "Désactiver le message explicatif IDFA d'AdMob : le jeu ne demande l'autorisation App Tracking Transparency qu'à un majeur dont UMP a recueilli le consentement (AGE-05).",
      ] },
      { h: 2, text: "Comportement attendu dans le jeu" },
      { table: { head: ["Joueur", "Appel à UMP", "Formulaire", "Publicité possible"], rows: [
        ["Âge inconnu ou sous l'âge du consentement du pays", "Aucun", "Aucun", "Aucune"],
        ["Pays où la publicité est coupée (config distante)", "Aucun", "Aucun", "Aucune"],
        ["Mineur au-dessus de l'âge du consentement", "tagForUnderAgeOfConsent = vrai", "Aucun (statut NOT_REQUIRED)", "Limitée, non personnalisée"],
        ["Majeur", "tagForUnderAgeOfConsent = faux", "Si Google l'exige (premier lancement, nouvelle version du message)", "Selon le choix ; limitée en cas de refus"],
      ] } },
      { p: "Le point d'entrée « Choix publicitaires (Google) » apparaît dans Paramètres > Confidentialité quand UMP l'exige (privacyOptionsRequirementStatus = REQUIRED)." },
      { h: 2, text: "Recette avant publication" },
      { ul: [
        "Déclarer les appareils de test (testDeviceIdentifiers) et forcer la géographie EEE (debugGeography) dans une version de recette uniquement.",
        "Vérifier sur Android et iOS : premier lancement d'un majeur (formulaire), d'un mineur de 16 ans (aucun formulaire), d'un joueur de 14 ans en France (aucun appel réseau vers Google).",
        "Vérifier que « Choix publicitaires » rouvre le formulaire et que le nouveau choix est pris en compte sans redémarrage.",
      ] },
      { h: 2, text: "Limite connue" },
      { p: "Le plugin Capacitor n'expose pas la chaîne TC : le serveur ne journalise que le statut renvoyé par UMP et sa date (table consents, colonne ads_status). La preuve détaillée du choix reste sur l'appareil (clés IABTCF_*) et chez Google." },
    ],
  };
}

/** Fiche « professionnel » (DSA art. 30-31) : mêmes champs que les mentions légales. */
export function traderSheet(): Doc {
  const f = Object.fromEntries(noticeFields());
  return {
    id: "fiche-editeur",
    lang: "fr",
    title: "Fiche éditeur des stores",
    blocks: [
      { h: 1, text: "Fiche éditeur « professionnel » (DSA art. 30-31)" },
      { p: "À saisir dans Play Console (Paramètres du compte de développeur > statut de professionnel) et App Store Connect (Accords, taxes et banques > statut de professionnel au titre du DSA). Les valeurs viennent de la même source que les mentions légales." },
      { table: { head: ["Champ du store", "Valeur"], rows: [
        ["Nom ou raison sociale", f.name], ["Adresse", f.address], ["E-mail", f.email], ["Téléphone", f.phone],
        ["Numéro d'immatriculation", `${f.registry} ; SIREN ${f.siren}`], ["TVA", f.vat],
      ] } },
      { h: 2, text: "Preuves à archiver (contrôle manuel T-DSA-06)" },
      { ul: [
        "Capture de la page « statut de professionnel » de Play Console, datée.",
        "Capture de la page équivalente d'App Store Connect, datée.",
        "Vérification que les informations affichées sur les fiches publiques des deux stores correspondent à cette fiche.",
      ] },
    ],
  };
}

// ───────── STO-03 : programme Familles ─────────
export interface NativeSdk { id: string; kind: "ads" | "billing" | "consent" | "push" | "analytics"; platform: "android" | "ios" }
export interface BuildConfig { appId: string; targetAudience: "teen" | "children"; nativeSdks: NativeSdk[] }

/**
 * SDK publicitaires autocertifiés pour le programme Familles de Google Play (extrait).
 * À revérifier à chaque mise à jour dans l'aide Play Console (« Families Self-Certified Ads SDK Program »).
 */
export const FAMILIES_CERTIFIED_ADS_SDKS = ["com.google.android.gms:play-services-ads"];

export function checkFamilies(cfg: BuildConfig): string[] {
  if (cfg.targetAudience !== "children") return [];
  const errors = cfg.nativeSdks
    .filter((s) => s.platform === "android" && (s.kind === "ads" || s.kind === "analytics") && !FAMILIES_CERTIFIED_ADS_SDKS.includes(s.id))
    .map((s) => `SDK ${s.id} (${s.kind}) absent de la liste des SDK certifiés Familles`);
  return errors;
}

// ───────── STO-04 : paiements via les stores uniquement ─────────
export const EXTERNAL_PAYMENT_PATTERNS = [
  /\bstripe\b/i, /paypal/i, /braintree/i, /adyen/i, /checkout\.com/i, /mollie/i, /\bklarna\b/i, /\bpaddle\b/i, /xsolla/i,
  /https?:\/\/[^\s"'`]*\/(checkout|payment|pay)\b/i,
];
export const PAYMENT_SDK_DENYLIST = ["stripe", "@stripe/stripe-js", "paypal-rest-sdk", "@paypal/checkout-server-sdk", "braintree", "@adyen/api-library", "xsolla"];

export function scanForExternalPayments(files: { path: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const f of files) for (const re of EXTERNAL_PAYMENT_PATTERNS) { const m = re.exec(f.text); if (m) hits.push(`${f.path} : « ${m[0]} »`); }
  return hits;
}
