/**
 * Inventaire des données : SOURCE UNIQUE du registre (RGPD art. 30), de l'AIPD (art. 35), de la politique de
 * confidentialité (art. 13), du formulaire « Sécurité des données » (Google Play) et du manifeste de
 * confidentialité Apple (PrivacyInfo.xcprivacy).
 * Chaque type de donnée collecté par notre code porte une annotation `// @collects <id>` à l'endroit où il est
 * enregistré ; un test échoue si une annotation manque ici, ou si un type marqué `by: "code"` n'est annoté nulle part.
 */

/** Catégories Google Play (formulaire « Sécurité des données »). */
export type GoogleCategory =
  | "Personal info › User IDs" | "Personal info › Name" | "Personal info › Email address" | "Personal info › Other info"
  | "Financial info › Purchase history" | "Messages › Other in-app messages"
  | "App activity › App interactions" | "App activity › Other user-generated content" | "App activity › Other actions"
  | "Device or other IDs";

/** Types Apple (NSPrivacyCollectedDataType…). */
export type AppleType =
  | "UserID" | "EmailAddress" | "PurchaseHistory" | "OtherUserContent" | "CustomerSupport" | "ProductInteraction" | "DeviceID" | "OtherDataTypes";

export type Purpose = "AppFunctionality" | "Analytics" | "ThirdPartyAdvertising" | "FraudPrevention" | "AccountManagement" | "LegalCompliance";

export interface DataType {
  id: string;
  label: string;
  google: GoogleCategory;
  apple: AppleType | null;
  /** `code` : enregistré par notre serveur (annotation @collects obligatoire) ; `sdk` : collecté par un SDK tiers. */
  by: "code" | "sdk";
  /** Facultatif pour le joueur (Data safety : « optional »). */
  optional: boolean;
  /** Transmis à un tiers qui l'utilise pour son propre compte (Data safety : « shared »). */
  shared: boolean;
  /** Utilisé pour suivre le joueur entre apps d'autres sociétés (Apple : tracking). */
  tracking: boolean;
  purposes: Purpose[];
}

export const DATA_TYPES: DataType[] = [
  { id: "account.id", label: "Identifiant pseudonyme du compte (UUID)", google: "Personal info › User IDs", apple: "UserID", by: "code", optional: false, shared: false, tracking: false, purposes: ["AppFunctionality", "AccountManagement"] },
  { id: "account.country", label: "Pays (déduit de la langue de l'appareil)", google: "Personal info › Other info", apple: "OtherDataTypes", by: "code", optional: false, shared: false, tracking: false, purposes: ["AppFunctionality", "LegalCompliance"] },
  { id: "account.nickname", label: "Pseudonyme choisi pour l'équipe", google: "Personal info › Name", apple: "OtherUserContent", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality"] },
  { id: "age.birthMonth", label: "Mois et année de naissance", google: "Personal info › Other info", apple: "OtherDataTypes", by: "code", optional: false, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "consent.record", label: "Choix de mesure d'audience, statut renvoyé par Google UMP, date et version de la notice", google: "App activity › Other actions", apple: "OtherDataTypes", by: "code", optional: false, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "purchase.history", label: "Achats (article, prix, date, numéro de commande du store)", google: "Financial info › Purchase history", apple: "PurchaseHistory", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality", "FraudPrevention", "LegalCompliance"] },
  { id: "team.membership", label: "Équipe rejointe", google: "App activity › Other actions", apple: "OtherDataTypes", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality"] },
  { id: "chat.message", label: "Messages du chat d'équipe", google: "Messages › Other in-app messages", apple: "OtherUserContent", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality"] },
  { id: "block.list", label: "Joueurs bloqués", google: "App activity › Other actions", apple: "OtherDataTypes", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality"] },
  { id: "report.content", label: "Signalements envoyés (motif, précisions)", google: "App activity › Other user-generated content", apple: "OtherUserContent", by: "code", optional: true, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "moderation.decision", label: "Décisions de modération et leurs motifs", google: "App activity › Other actions", apple: "OtherDataTypes", by: "code", optional: false, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "appeal.content", label: "Recours contre une décision", google: "App activity › Other user-generated content", apple: "OtherUserContent", by: "code", optional: true, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "inbox.notice", label: "Avis envoyés au joueur dans le jeu (décisions, résultats de recours)", google: "App activity › Other actions", apple: "OtherDataTypes", by: "code", optional: false, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "support.message", label: "Message envoyé au point de contact", google: "App activity › Other user-generated content", apple: "CustomerSupport", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality", "LegalCompliance"] },
  { id: "support.email", label: "Adresse e-mail pour la réponse (facultative)", google: "Personal info › Email address", apple: "EmailAddress", by: "code", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality"] },
  { id: "rights.deletionRequest", label: "Demande de suppression et échéance", google: "App activity › Other actions", apple: "OtherDataTypes", by: "code", optional: true, shared: false, tracking: false, purposes: ["LegalCompliance"] },
  { id: "analytics.events", label: "Événements de jeu (niveau joué, réussi, échoué ; boosters ; durée de session)", google: "App activity › App interactions", apple: "ProductInteraction", by: "code", optional: true, shared: false, tracking: false, purposes: ["Analytics"] },
  { id: "ads.deviceId", label: "Identifiant publicitaire et données techniques de l'appareil (SDK Google Mobile Ads)", google: "Device or other IDs", apple: "DeviceID", by: "sdk", optional: true, shared: true, tracking: true, purposes: ["ThirdPartyAdvertising", "FraudPrevention"] },
  { id: "push.token", label: "Jeton de notification de l'appareil (FCM, APNs)", google: "Device or other IDs", apple: null, by: "sdk", optional: true, shared: false, tracking: false, purposes: ["AppFunctionality"] },
];

/** Base légale (RGPD art. 6(1)). */
export type LegalBasis = "a" | "b" | "c" | "f";

export interface Treatment {
  id: string;
  /** Finalité (registre, en français ; les textes joueurs sont dans les catalogues de chaque langue). */
  purpose: string;
  basis: LegalBasis;
  /** Texte précis de l'obligation légale ou de l'intérêt légitime. */
  basisDetail: string;
  subjects: string;
  data: string[];
  /** Tables du serveur concernées : leur durée vient de RETENTION ; `account` = durée du compte puis effacement. */
  retention: { tables: string[]; account?: boolean };
  /** Noms de sous-traitants (SUBPROCESSORS.name) destinataires. */
  recipients: string[];
  /** Concerne les mineurs : mesures spécifiques (AIPD). */
  minors: string;
  /** Décision fondée exclusivement sur un traitement automatisé (art. 22) : toujours faux ici, contrôlé par test. */
  automatedDecision: false;
}

export const TREATMENTS: Treatment[] = [
  { id: "account", purpose: "Fournir le jeu : compte pseudonyme, progression, synchronisation", basis: "b", basisDetail: "Exécution du contrat (CGU)", subjects: "Joueurs", data: ["account.id", "account.country", "account.nickname"], retention: { tables: [], account: true }, recipients: ["Scaleway SAS"], minors: "Aucun nom réel demandé ; pseudonyme filtré ; aucun profil public au-delà du pseudonyme.", automatedDecision: false },
  { id: "age", purpose: "Adapter le jeu à l'âge : protections des mineurs, âge du consentement", basis: "c", basisDetail: "RGPD art. 8 ; règlement (UE) 2022/2065 (DSA) art. 28", subjects: "Joueurs", data: ["age.birthMonth"], retention: { tables: [], account: true }, recipients: ["Scaleway SAS"], minors: "Seuls le mois et l'année sont conservés ; la tranche d'âge seule est gardée sur l'appareil.", automatedDecision: false },
  { id: "consent", purpose: "Recueillir et prouver le consentement", basis: "c", basisDetail: "RGPD art. 7(1) ; directive 2002/58 art. 5(3)", subjects: "Joueurs", data: ["consent.record"], retention: { tables: ["consents"] }, recipients: ["Scaleway SAS"], minors: "Sous l'âge du consentement national : aucune finalité soumise au consentement n'est proposée.", automatedDecision: false },
  { id: "purchases", purpose: "Achats intégrés : livraison, plafond mensuel des mineurs, remboursements, comptabilité", basis: "b", basisDetail: "Exécution du contrat (CGV) ; obligation comptable (C. com. L123-22) pour la conservation", subjects: "Joueurs qui achètent", data: ["purchase.history"], retention: { tables: ["ledger"] }, recipients: ["Scaleway SAS", "Google Ireland Ltd (Google Play)", "Apple Distribution International"], minors: "Plafond mensuel de dépense ; aucune offre mise en avant ; contrôle parental du store.", automatedDecision: false },
  { id: "chat", purpose: "Chat d'équipe, blocage de joueurs", basis: "b", basisDetail: "Exécution du contrat (fonction d'équipe)", subjects: "Joueurs membres d'une équipe", data: ["team.membership", "chat.message", "block.list"], retention: { tables: ["messages"], account: true }, recipients: ["Scaleway SAS"], minors: "Sous 16 ans : messages prédéfinis uniquement. Filtre des données personnelles et du langage pour tous.", automatedDecision: false },
  { id: "moderation", purpose: "Signalements, modération, décisions motivées, recours", basis: "c", basisDetail: "DSA art. 16, 17, 20 et 23", subjects: "Joueurs signalants et signalés", data: ["report.content", "moderation.decision", "appeal.content", "inbox.notice"], retention: { tables: ["reports", "decisions", "appeals", "notifications"] }, recipients: ["Scaleway SAS"], minors: "Toute décision est prise par une personne ; le recours est examiné par une autre personne.", automatedDecision: false },
  { id: "support", purpose: "Point de contact unique et support", basis: "c", basisDetail: "DSA art. 11 et 12 ; RGPD art. 12 (exercice des droits)", subjects: "Joueurs, autorités, toute personne", data: ["support.message", "support.email"], retention: { tables: ["tickets"] }, recipients: ["Scaleway SAS"], minors: "L'e-mail est facultatif ; il est effacé avec la demande.", automatedDecision: false },
  { id: "rights", purpose: "Exercice des droits : export, suppression du compte", basis: "c", basisDetail: "RGPD art. 15, 17 et 20", subjects: "Joueurs", data: ["rights.deletionRequest"], retention: { tables: [], account: true }, recipients: ["Scaleway SAS"], minors: "Export et suppression accessibles depuis les paramètres, sans démarche externe.", automatedDecision: false },
  { id: "analytics", purpose: "Mesure d'audience first-party pour améliorer les niveaux", basis: "a", basisDetail: "Consentement (RGPD art. 6(1)(a) ; directive 2002/58 art. 5(3))", subjects: "Joueurs ayant consenti", data: ["analytics.events"], retention: { tables: ["events"] }, recipients: ["Scaleway SAS"], minors: "Proposé seulement au-dessus de l'âge du consentement ; aucune donnée publicitaire ; schéma fermé sans texte libre.", automatedDecision: false },
  { id: "protection", purpose: "Indicateurs agrégés de protection (revenus des mineurs, plafonds atteints, sessions longues)", basis: "f", basisDetail: "Intérêt légitime : vérifier que le jeu protège ses joueurs ; seuls des agrégats sont produits", subjects: "Joueurs", data: ["purchase.history", "analytics.events"], retention: { tables: ["ledger", "events"] }, recipients: ["Scaleway SAS"], minors: "Aucune mesure individuelle n'est prise à partir de ces indicateurs.", automatedDecision: false },
  { id: "ads", purpose: "Vidéos récompensées facultatives (Google AdMob) ; consentement recueilli par Google UMP", basis: "a", basisDetail: "Consentement recueilli par Google UMP (TCF v2.2 ; RGPD art. 6(1)(a) ; directive 2002/58 art. 5(3)). Sans consentement : publicité limitée, sans traceur ni personnalisation, seulement sur une vidéo choisie par le joueur", subjects: "Joueurs majeurs ou au-dessus de l'âge du consentement, dans les pays où la publicité est active", data: ["ads.deviceId"], retention: { tables: [] }, recipients: ["Google Ireland Ltd (UMP)", "Google Ireland Ltd (AdMob)"], minors: "Mineurs : jamais de publicité personnalisée (DSA art. 28(2)) ; sous l'âge du consentement : aucune publicité.", automatedDecision: false },
  { id: "notifications", purpose: "Notifications facultatives (vies, équipe, saison)", basis: "a", basisDetail: "Consentement (opt-in, ePrivacy art. 13)", subjects: "Joueurs ayant activé les notifications", data: ["push.token"], retention: { tables: [] }, recipients: ["Google Ireland Ltd (Firebase Cloud Messaging)", "Apple Distribution International (APNs)"], minors: "Aucune notification commerciale pour un joueur protégé ; au plus 2 par jour, jamais entre 22 h et 8 h.", automatedDecision: false },
];

/** Stockage local sur l'appareil (directive 2002/58 art. 5(3)) : uniquement des traceurs strictement nécessaires. */
export interface DeviceItem { key: string; content: string; necessary: true }
export const DEVICE_STORAGE: DeviceItem[] = [
  { key: "helios.settings.v1", content: "Réglages (son, affichage, langue, notifications)", necessary: true },
  { key: "helios.meta.v1", content: "Progression, vies, pièces, récompenses", necessary: true },
  { key: "helios.profile.v1", content: "Historique des tentatives par niveau (aide gratuite après 8 échecs)", necessary: true },
  { key: "helios.compliance.v1", content: "Tranche d'âge et choix de consentement", necessary: true },
  { key: "helios.account.v1", content: "Identifiant et jeton du compte pseudonyme", necessary: true },
  { key: "IABTCF_*", content: "Choix publicitaires enregistrés par Google UMP (chaîne TC du cadre IAB), lus par le SDK publicitaire", necessary: true },
];

export const dataType = (id: string): DataType => {
  const d = DATA_TYPES.find((x) => x.id === id);
  if (!d) throw new Error(`type de donnée inconnu : ${id}`);
  return d;
};
