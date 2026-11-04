# Analyse d'impact relative à la protection des données (RGPD art. 35)

Version 2026-11-v1 du 2026-11-04. Document interne. Motif : traitement de données de mineurs à une échelle potentiellement importante (lignes directrices WP248, critères « personnes vulnérables » et « grande échelle »).

## (a) Description systématique des traitements et des finalités

| Traitement | Finalité | Base | Données |
|---|---|---|---|
| account | Fournir le jeu : compte pseudonyme, progression, synchronisation | Art. 6(1)(b) exécution du contrat | Identifiant pseudonyme du compte (UUID) ; Pays (déduit de la langue de l'appareil) ; Pseudonyme choisi pour l'équipe |
| age | Adapter le jeu à l'âge : protections des mineurs, âge du consentement | Art. 6(1)(c) obligation légale | Mois et année de naissance |
| consent | Recueillir et prouver le consentement | Art. 6(1)(c) obligation légale | Choix de mesure d'audience, statut renvoyé par Google UMP, date et version de la notice |
| purchases | Achats intégrés : livraison, plafond mensuel des mineurs, remboursements, comptabilité | Art. 6(1)(b) exécution du contrat | Achats (article, prix, date, numéro de commande du store) |
| chat | Chat d'équipe, blocage de joueurs | Art. 6(1)(b) exécution du contrat | Équipe rejointe ; Messages du chat d'équipe ; Joueurs bloqués |
| moderation | Signalements, modération, décisions motivées, recours | Art. 6(1)(c) obligation légale | Signalements envoyés (motif, précisions) ; Décisions de modération et leurs motifs ; Recours contre une décision ; Avis envoyés au joueur dans le jeu (décisions, résultats de recours) |
| support | Point de contact unique et support | Art. 6(1)(c) obligation légale | Message envoyé au point de contact ; Adresse e-mail pour la réponse (facultative) |
| rights | Exercice des droits : export, suppression du compte | Art. 6(1)(c) obligation légale | Demande de suppression et échéance |
| analytics | Mesure d'audience first-party pour améliorer les niveaux | Art. 6(1)(a) consentement | Événements de jeu (niveau joué, réussi, échoué ; boosters ; durée de session) |
| protection | Indicateurs agrégés de protection (revenus des mineurs, plafonds atteints, sessions longues) | Art. 6(1)(f) intérêt légitime | Achats (article, prix, date, numéro de commande du store) ; Événements de jeu (niveau joué, réussi, échoué ; boosters ; durée de session) |
| ads | Vidéos récompensées facultatives (Google AdMob) ; consentement recueilli par Google UMP | Art. 6(1)(a) consentement | Identifiant publicitaire et données techniques de l'appareil (SDK Google Mobile Ads) |
| notifications | Notifications facultatives (vies, équipe, saison) | Art. 6(1)(a) consentement | Jeton de notification de l'appareil (FCM, APNs) |

Public : 13 ans et plus, dont des mineurs. Âges du consentement appliqués : FR 15, BE 13, DE 16, ES 14, IT 14, NL 16. Pays : FR, BE, DE, ES, IT, NL.

## (b) Nécessité et proportionnalité

- Minimisation : aucun nom, adresse ou numéro ; seuls le mois et l'année de naissance ; pseudonyme facultatif.
- Bases légales adaptées : contrat pour le jeu, obligation légale pour l'âge, la modération et le contact, consentement pour la mesure, la publicité et les notifications.
- Durées limitées par table, purge automatique quotidienne (RETENTION).
- Information : politique de confidentialité en 6 langues, version courte lisible par un mineur.
- Droits : export JSON et suppression dans le jeu, sans démarche externe ; retrait du consentement en 2 clics.
- Sous-traitants sous contrat (art. 28), hébergement UE.

## (c) Risques pour les droits et libertés

| Risque | Vraisemblance | Gravité | Risque résiduel |
|---|---|---|---|
| Contact d'un mineur par un adulte malveillant via le chat | moyenne | élevée | faible |
| Dépense excessive d'un mineur | moyenne | moyenne | faible |
| Profilage publicitaire d'un mineur | faible | élevée | faible |
| Fausse déclaration d'âge | élevée | moyenne | moyen (limite connue de l'auto-déclaration) |
| Violation de données (fuite de la base) | faible | moyenne | faible |
| Usage des données de mesure au-delà de la finalité (ciblage des joueurs vulnérables) | faible | élevée | faible |
| Sanction injustifiée par un outil automatique | faible | moyenne | faible |

## (d) Mesures envisagées pour faire face aux risques

| Risque | Mesures |
|---|---|
| Contact d'un mineur par un adulte malveillant via le chat | Messages prédéfinis seulement sous 16 ans ; filtre des données personnelles et des liens pour tous ; blocage ; signalement en 2 clics ; modération humaine ; aucun message privé. |
| Dépense excessive d'un mineur | Plafond mensuel par pays côté serveur ; aucune offre mise en avant ; pas de monnaie premium ; aucun contenu aléatoire payant ; contrôle parental du store. |
| Profilage publicitaire d'un mineur | Aucune publicité personnalisée sous 18 ans ; aucune publicité sous l'âge du consentement ; SDK chargé après consentement uniquement. |
| Fausse déclaration d'âge | Écran d'âge neutre (aucun indice) ; âge non modifiable sans support ; protections par défaut si âge inconnu. |
| Violation de données (fuite de la base) | Données pseudonymes et minimales ; jetons hachés ; chiffrement ; durées de conservation courtes ; hébergement UE. |
| Usage des données de mesure au-delà de la finalité (ciblage des joueurs vulnérables) | Validateur d'expériences : aucun segment fondé sur l'âge, la dépense, les échecs ; joueurs protégés dans la variante de référence ; seuls des agrégats sortent du tableau de bord. |
| Sanction injustifiée par un outil automatique | Le filtre bloque l'envoi sans sanctionner ; toute mesure sur un compte est humaine et motivée ; recours examiné par une autre personne. |

- Hébergement en région UE (Scaleway fr-par), chiffrement au repos et en transit (TLS).
- Comptes pseudonymes (UUID), jetons stockés hachés (SHA-256), aucun nom réel collecté.
- Accès d'administration et de modération par clés individuelles, journalisées ; principe du moindre privilège.
- Purge quotidienne automatique selon les durées de conservation ; effacement des comptes sous 30 jours au plus.
- Schéma fermé pour la mesure d'audience (aucun texte libre) ; filtre de données personnelles dans le chat.
- SDK tiers chargés seulement après consentement ; liste blanche des hôtes réseau.
- Sauvegardes chiffrées conservées 30 jours au plus, soumises aux mêmes échéances d'effacement.

## Conclusion et suivi

Risque résiduel jugé acceptable, sous réserve de la fausse déclaration d'âge (limite connue). Pas de consultation préalable de la CNIL requise (art. 36) si cette conclusion est confirmée. Revue à chaque nouveau traitement, nouveau SDK, ou au plus tard tous les 12 mois. Avis du délégué ou d'un conseil à recueillir avant le lancement.
