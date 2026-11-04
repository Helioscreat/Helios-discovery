/**
 * Documents internes (français) : registre des traitements (RGPD art. 30(1)) et analyse d'impact (art. 35).
 * Générés depuis l'inventaire : ajouter un traitement à TREATMENTS l'ajoute au registre et à l'AIPD.
 */
import { CONSENT_AGE } from "@helios/compliance";
import { RETENTION, SUBPROCESSORS } from "@helios/config";
import type { Block, Doc } from "./blocks";
import { DELETION_MAX_DAYS, duration, TARGET_COUNTRIES } from "./documents";
import { dataType, TREATMENTS, type Treatment } from "./inventory";
import { LEGAL_VERSION, PUBLISHER } from "./publisher";

const BASIS: Record<Treatment["basis"], string> = {
  a: "Art. 6(1)(a) consentement",
  b: "Art. 6(1)(b) exécution du contrat",
  c: "Art. 6(1)(c) obligation légale",
  f: "Art. 6(1)(f) intérêt légitime",
};

/** Mesures de sécurité (art. 30(1)(g), art. 32) communes à tous les traitements. */
export const SECURITY_MEASURES = [
  "Hébergement en région UE (Scaleway fr-par), chiffrement au repos et en transit (TLS).",
  "Comptes pseudonymes (UUID), jetons stockés hachés (SHA-256), aucun nom réel collecté.",
  "Accès d'administration et de modération par clés individuelles, journalisées ; principe du moindre privilège.",
  "Purge quotidienne automatique selon les durées de conservation ; effacement des comptes sous 30 jours au plus.",
  "Schéma fermé pour la mesure d'audience (aucun texte libre) ; filtre de données personnelles dans le chat.",
  "SDK tiers chargés seulement après consentement ; liste blanche des hôtes réseau.",
  "Sauvegardes chiffrées conservées 30 jours au plus, soumises aux mêmes échéances d'effacement.",
];

function retention(t: Treatment): string {
  const parts = t.retention.tables.map((tb) => `${tb} : ${duration("fr", RETENTION.find((r) => r.table === tb)!.days)}`);
  if (t.retention.account) parts.push(`durée du compte, puis effacement sous ${DELETION_MAX_DAYS} jours`);
  if (!parts.length) parts.push("aucune donnée conservée sur nos serveurs (SDK du prestataire)");
  return parts.join(" ; ");
}

function transfers(t: Treatment): string {
  const out = t.recipients.map((n) => SUBPROCESSORS.find((s) => s.name === n)!).filter((s) => s.safeguard !== "UE");
  return out.length ? out.map((s) => `${s.name} : ${s.safeguard === "DPF + CCT" ? "groupe établi aux États-Unis, cadre UE–États-Unis (décision du 10/07/2023) et clauses contractuelles types" : "clauses contractuelles types"}`).join(" ; ") : "Aucun transfert hors UE";
}

export function register(): Doc {
  const p = PUBLISHER;
  const blocks: Block[] = [
    { h: 1, text: "Registre des activités de traitement (RGPD art. 30)" },
    { p: `Version ${LEGAL_VERSION.label} du ${LEGAL_VERSION.date}. Document interne, généré depuis packages/legal/src/inventory.ts.` },
    { h: 2, text: "Responsable du traitement (art. 30(1)(a))", id: "a" },
    { table: { head: ["Rubrique", "Valeur"], rows: [["Nom", p.name], ["Forme", p.legalForm], ["Adresse", p.address], ["Contact", `${p.email} ; ${p.contactForm}`], ["Représentant dans l'UE", "Sans objet (établi en France)"], ["Délégué à la protection des données", "Non désigné (à réévaluer : suivi régulier et systématique à grande échelle ?)"]] } },
  ];
  for (const t of TREATMENTS) {
    blocks.push(
      { h: 2, text: `Traitement « ${t.id} »`, id: `t-${t.id}` },
      {
        table: {
          head: ["Rubrique (art. 30(1))", "Contenu"],
          rows: [
            ["(a) Responsable", p.name],
            ["(b) Finalité", `${t.purpose}. Base : ${BASIS[t.basis]} — ${t.basisDetail}`],
            ["(c) Personnes concernées", t.subjects],
            ["(c) Catégories de données", t.data.map((d) => dataType(d).label).join(" ; ")],
            ["(d) Destinataires", t.recipients.join(" ; ")],
            ["(e) Transferts hors UE et garanties", transfers(t)],
            ["(f) Délais d'effacement", retention(t)],
            ["(g) Mesures de sécurité", "Voir la section « Mesures de sécurité »"],
            ["Mineurs", t.minors],
            ["Décision automatisée (art. 22)", "Non"],
          ],
        },
      },
    );
  }
  blocks.push({ h: 2, text: "Mesures de sécurité (art. 30(1)(g) et 32)", id: "g" }, { ul: SECURITY_MEASURES });
  blocks.push({ h: 2, text: "Sous-traitants (art. 28)" }, { table: { head: ["Nom", "Rôle", "Pays", "Garantie", "Contrat (DPA)"], rows: SUBPROCESSORS.map((s) => [s.name, s.role, s.country, s.safeguard, s.dpa]) } });
  return { id: "registre", lang: "fr", title: "Registre des traitements", blocks };
}

/** Risques identifiés pour l'AIPD (art. 35(7)(c)) et mesures associées (art. 35(7)(d)). */
export const DPIA_RISKS = [
  { risk: "Contact d'un mineur par un adulte malveillant via le chat", likelihood: "moyenne", severity: "élevée", measures: "Messages prédéfinis seulement sous 16 ans ; filtre des données personnelles et des liens pour tous ; blocage ; signalement en 2 clics ; modération humaine ; aucun message privé.", residual: "faible" },
  { risk: "Dépense excessive d'un mineur", likelihood: "moyenne", severity: "moyenne", measures: "Plafond mensuel par pays côté serveur ; aucune offre mise en avant ; pas de monnaie premium ; aucun contenu aléatoire payant ; contrôle parental du store.", residual: "faible" },
  { risk: "Profilage publicitaire d'un mineur", likelihood: "faible", severity: "élevée", measures: "Aucune publicité personnalisée sous 18 ans ; aucune publicité sous l'âge du consentement ; SDK chargé après consentement uniquement.", residual: "faible" },
  { risk: "Fausse déclaration d'âge", likelihood: "élevée", severity: "moyenne", measures: "Écran d'âge neutre (aucun indice) ; âge non modifiable sans support ; protections par défaut si âge inconnu.", residual: "moyen (limite connue de l'auto-déclaration)" },
  { risk: "Violation de données (fuite de la base)", likelihood: "faible", severity: "moyenne", measures: "Données pseudonymes et minimales ; jetons hachés ; chiffrement ; durées de conservation courtes ; hébergement UE.", residual: "faible" },
  { risk: "Usage des données de mesure au-delà de la finalité (ciblage des joueurs vulnérables)", likelihood: "faible", severity: "élevée", measures: "Validateur d'expériences : aucun segment fondé sur l'âge, la dépense, les échecs ; joueurs protégés dans la variante de référence ; seuls des agrégats sortent du tableau de bord.", residual: "faible" },
  { risk: "Sanction injustifiée par un outil automatique", likelihood: "faible", severity: "moyenne", measures: "Le filtre bloque l'envoi sans sanctionner ; toute mesure sur un compte est humaine et motivée ; recours examiné par une autre personne.", residual: "faible" },
];

export function dpia(): Doc {
  const ages = TARGET_COUNTRIES.map((c) => `${c} ${CONSENT_AGE[c]}`).join(", ");
  const blocks: Block[] = [
    { h: 1, text: "Analyse d'impact relative à la protection des données (RGPD art. 35)" },
    { p: `Version ${LEGAL_VERSION.label} du ${LEGAL_VERSION.date}. Document interne. Motif : traitement de données de mineurs à une échelle potentiellement importante (lignes directrices WP248, critères « personnes vulnérables » et « grande échelle »).` },
    { h: 2, text: "(a) Description systématique des traitements et des finalités", id: "a" },
    { table: { head: ["Traitement", "Finalité", "Base", "Données"], rows: TREATMENTS.map((t) => [t.id, t.purpose, BASIS[t.basis], t.data.map((d) => dataType(d).label).join(" ; ")]) } },
    { p: `Public : 13 ans et plus, dont des mineurs. Âges du consentement appliqués : ${ages}. Pays : ${TARGET_COUNTRIES.join(", ")}.` },
    { h: 2, text: "(b) Nécessité et proportionnalité", id: "b" },
    { ul: [
      "Minimisation : aucun nom, adresse ou numéro ; seuls le mois et l'année de naissance ; pseudonyme facultatif.",
      "Bases légales adaptées : contrat pour le jeu, obligation légale pour l'âge, la modération et le contact, consentement pour la mesure, la publicité et les notifications.",
      "Durées limitées par table, purge automatique quotidienne (RETENTION).",
      "Information : politique de confidentialité en 6 langues, version courte lisible par un mineur.",
      "Droits : export JSON et suppression dans le jeu, sans démarche externe ; retrait du consentement en 2 clics.",
      "Sous-traitants sous contrat (art. 28), hébergement UE.",
    ] },
    { h: 2, text: "(c) Risques pour les droits et libertés", id: "c" },
    { table: { head: ["Risque", "Vraisemblance", "Gravité", "Risque résiduel"], rows: DPIA_RISKS.map((r) => [r.risk, r.likelihood, r.severity, r.residual]) } },
    { h: 2, text: "(d) Mesures envisagées pour faire face aux risques", id: "d" },
    { table: { head: ["Risque", "Mesures"], rows: DPIA_RISKS.map((r) => [r.risk, r.measures]) } },
    { ul: SECURITY_MEASURES },
    { h: 2, text: "Conclusion et suivi" },
    { p: "Risque résiduel jugé acceptable, sous réserve de la fausse déclaration d'âge (limite connue). Pas de consultation préalable de la CNIL requise (art. 36) si cette conclusion est confirmée. Revue à chaque nouveau traitement, nouveau SDK, ou au plus tard tous les 12 mois. Avis du délégué ou d'un conseil à recueillir avant le lancement." },
  ];
  return { id: "aipd", lang: "fr", title: "AIPD", blocks };
}
