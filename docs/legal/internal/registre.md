# Registre des activités de traitement (RGPD art. 30)

Version 2026-11-v1 du 2026-11-04. Document interne, généré depuis packages/legal/src/inventory.ts.

## Responsable du traitement (art. 30(1)(a))

| Rubrique | Valeur |
|---|---|
| Nom | ⟦À COMPLÉTER : raison sociale⟧ |
| Forme | SASU |
| Adresse | ⟦À COMPLÉTER : adresse du siège⟧ |
| Contact | contact@helios-discovery.example ; https://helios-discovery.example/contact |
| Représentant dans l'UE | Sans objet (établi en France) |
| Délégué à la protection des données | Non désigné (à réévaluer : suivi régulier et systématique à grande échelle ?) |

## Traitement « account »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Fournir le jeu : compte pseudonyme, progression, synchronisation. Base : Art. 6(1)(b) exécution du contrat — Exécution du contrat (CGU) |
| (c) Personnes concernées | Joueurs |
| (c) Catégories de données | Identifiant pseudonyme du compte (UUID) ; Pays (déduit de la langue de l'appareil) ; Pseudonyme choisi pour l'équipe |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | durée du compte, puis effacement sous 30 jours |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Aucun nom réel demandé ; pseudonyme filtré ; aucun profil public au-delà du pseudonyme. |
| Décision automatisée (art. 22) | Non |

## Traitement « age »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Adapter le jeu à l'âge : protections des mineurs, âge du consentement. Base : Art. 6(1)(c) obligation légale — RGPD art. 8 ; règlement (UE) 2022/2065 (DSA) art. 28 |
| (c) Personnes concernées | Joueurs |
| (c) Catégories de données | Mois et année de naissance |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | durée du compte, puis effacement sous 30 jours |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Seuls le mois et l'année sont conservés ; la tranche d'âge seule est gardée sur l'appareil. |
| Décision automatisée (art. 22) | Non |

## Traitement « consent »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Recueillir et prouver le consentement. Base : Art. 6(1)(c) obligation légale — RGPD art. 7(1) ; directive 2002/58 art. 5(3) |
| (c) Personnes concernées | Joueurs |
| (c) Catégories de données | Choix de consentement, date et version de la notice |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | consents : 5 ans |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Sous l'âge du consentement national : aucune finalité soumise au consentement n'est proposée. |
| Décision automatisée (art. 22) | Non |

## Traitement « purchases »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Achats intégrés : livraison, plafond mensuel des mineurs, remboursements, comptabilité. Base : Art. 6(1)(b) exécution du contrat — Exécution du contrat (CGV) ; obligation comptable (C. com. L123-22) pour la conservation |
| (c) Personnes concernées | Joueurs qui achètent |
| (c) Catégories de données | Achats (article, prix, date, numéro de commande du store) |
| (d) Destinataires | Scaleway SAS ; Google Ireland Ltd (Google Play) ; Apple Distribution International |
| (e) Transferts hors UE et garanties | Google Ireland Ltd (Google Play) : groupe établi aux États-Unis, cadre UE–États-Unis (décision du 10/07/2023) et clauses contractuelles types ; Apple Distribution International : groupe établi aux États-Unis, cadre UE–États-Unis (décision du 10/07/2023) et clauses contractuelles types |
| (f) Délais d'effacement | ledger : 10 ans |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Plafond mensuel de dépense ; aucune offre mise en avant ; contrôle parental du store. |
| Décision automatisée (art. 22) | Non |

## Traitement « chat »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Chat d'équipe, blocage de joueurs. Base : Art. 6(1)(b) exécution du contrat — Exécution du contrat (fonction d'équipe) |
| (c) Personnes concernées | Joueurs membres d'une équipe |
| (c) Catégories de données | Équipe rejointe ; Messages du chat d'équipe ; Joueurs bloqués |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | messages : 90 jours ; durée du compte, puis effacement sous 30 jours |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Sous 16 ans : messages prédéfinis uniquement. Filtre des données personnelles et du langage pour tous. |
| Décision automatisée (art. 22) | Non |

## Traitement « moderation »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Signalements, modération, décisions motivées, recours. Base : Art. 6(1)(c) obligation légale — DSA art. 16, 17, 20 et 23 |
| (c) Personnes concernées | Joueurs signalants et signalés |
| (c) Catégories de données | Signalements envoyés (motif, précisions) ; Décisions de modération et leurs motifs ; Recours contre une décision ; Avis envoyés au joueur dans le jeu (décisions, résultats de recours) |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | reports : 2 ans ; decisions : 2 ans ; appeals : 2 ans ; notifications : 6 mois |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Toute décision est prise par une personne ; le recours est examiné par une autre personne. |
| Décision automatisée (art. 22) | Non |

## Traitement « support »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Point de contact unique et support. Base : Art. 6(1)(c) obligation légale — DSA art. 11 et 12 ; RGPD art. 12 (exercice des droits) |
| (c) Personnes concernées | Joueurs, autorités, toute personne |
| (c) Catégories de données | Message envoyé au point de contact ; Adresse e-mail pour la réponse (facultative) |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | tickets : 1 an |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | L'e-mail est facultatif ; il est effacé avec la demande. |
| Décision automatisée (art. 22) | Non |

## Traitement « rights »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Exercice des droits : export, suppression du compte. Base : Art. 6(1)(c) obligation légale — RGPD art. 15, 17 et 20 |
| (c) Personnes concernées | Joueurs |
| (c) Catégories de données | Demande de suppression et échéance |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | durée du compte, puis effacement sous 30 jours |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Export et suppression accessibles depuis les paramètres, sans démarche externe. |
| Décision automatisée (art. 22) | Non |

## Traitement « analytics »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Mesure d'audience first-party pour améliorer les niveaux. Base : Art. 6(1)(a) consentement — Consentement (RGPD art. 6(1)(a) ; directive 2002/58 art. 5(3)) |
| (c) Personnes concernées | Joueurs ayant consenti |
| (c) Catégories de données | Événements de jeu (niveau joué, réussi, échoué ; boosters ; durée de session) |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | events : 13 mois |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Proposé seulement au-dessus de l'âge du consentement ; aucune donnée publicitaire ; schéma fermé sans texte libre. |
| Décision automatisée (art. 22) | Non |

## Traitement « protection »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Indicateurs agrégés de protection (revenus des mineurs, plafonds atteints, sessions longues). Base : Art. 6(1)(f) intérêt légitime — Intérêt légitime : vérifier que le jeu protège ses joueurs ; seuls des agrégats sont produits |
| (c) Personnes concernées | Joueurs |
| (c) Catégories de données | Achats (article, prix, date, numéro de commande du store) ; Événements de jeu (niveau joué, réussi, échoué ; boosters ; durée de session) |
| (d) Destinataires | Scaleway SAS |
| (e) Transferts hors UE et garanties | Aucun transfert hors UE |
| (f) Délais d'effacement | ledger : 10 ans ; events : 13 mois |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Aucune mesure individuelle n'est prise à partir de ces indicateurs. |
| Décision automatisée (art. 22) | Non |

## Traitement « ads »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Vidéos récompensées facultatives (Google AdMob) et plateforme de consentement (Google UMP). Base : Art. 6(1)(a) consentement — Consentement (RGPD art. 6(1)(a) ; directive 2002/58 art. 5(3)) |
| (c) Personnes concernées | Joueurs ayant consenti |
| (c) Catégories de données | Identifiant publicitaire et données techniques de l'appareil (SDK Google Mobile Ads) |
| (d) Destinataires | Google Ireland Ltd (AdMob, UMP) |
| (e) Transferts hors UE et garanties | Google Ireland Ltd (AdMob, UMP) : groupe établi aux États-Unis, cadre UE–États-Unis (décision du 10/07/2023) et clauses contractuelles types |
| (f) Délais d'effacement | aucune donnée conservée sur nos serveurs (SDK du prestataire) |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Mineurs : jamais de publicité personnalisée (DSA art. 28(2)) ; sous l'âge du consentement : aucune publicité. |
| Décision automatisée (art. 22) | Non |

## Traitement « notifications »

| Rubrique (art. 30(1)) | Contenu |
|---|---|
| (a) Responsable | ⟦À COMPLÉTER : raison sociale⟧ |
| (b) Finalité | Notifications facultatives (vies, équipe, saison). Base : Art. 6(1)(a) consentement — Consentement (opt-in, ePrivacy art. 13) |
| (c) Personnes concernées | Joueurs ayant activé les notifications |
| (c) Catégories de données | Jeton de notification de l'appareil (FCM, APNs) |
| (d) Destinataires | Google Ireland Ltd (Firebase Cloud Messaging) ; Apple Distribution International (APNs) |
| (e) Transferts hors UE et garanties | Google Ireland Ltd (Firebase Cloud Messaging) : groupe établi aux États-Unis, cadre UE–États-Unis (décision du 10/07/2023) et clauses contractuelles types ; Apple Distribution International (APNs) : groupe établi aux États-Unis, cadre UE–États-Unis (décision du 10/07/2023) et clauses contractuelles types |
| (f) Délais d'effacement | aucune donnée conservée sur nos serveurs (SDK du prestataire) |
| (g) Mesures de sécurité | Voir la section « Mesures de sécurité » |
| Mineurs | Aucune notification commerciale pour un joueur protégé ; au plus 2 par jour, jamais entre 22 h et 8 h. |
| Décision automatisée (art. 22) | Non |

## Mesures de sécurité (art. 30(1)(g) et 32)

- Hébergement en région UE (Scaleway fr-par), chiffrement au repos et en transit (TLS).
- Comptes pseudonymes (UUID), jetons stockés hachés (SHA-256), aucun nom réel collecté.
- Accès d'administration et de modération par clés individuelles, journalisées ; principe du moindre privilège.
- Purge quotidienne automatique selon les durées de conservation ; effacement des comptes sous 30 jours au plus.
- Schéma fermé pour la mesure d'audience (aucun texte libre) ; filtre de données personnelles dans le chat.
- SDK tiers chargés seulement après consentement ; liste blanche des hôtes réseau.
- Sauvegardes chiffrées conservées 30 jours au plus, soumises aux mêmes échéances d'effacement.

## Sous-traitants (art. 28)

| Nom | Rôle | Pays | Garantie | Contrat (DPA) |
|---|---|---|---|---|
| Scaleway SAS | Hébergement du serveur et de la base de données (région fr-par) | FR | UE | https://www.scaleway.com/en/contracts/ |
| Google Ireland Ltd (Google Play) | Paiement et vérification des achats (Android) | IE | DPF + CCT | https://business.safety.google/processorterms/ |
| Apple Distribution International | Paiement et vérification des achats (iOS) | IE | DPF + CCT | https://www.apple.com/legal/internet-services/ |
| Google Ireland Ltd (AdMob, UMP) | Publicité récompensée et plateforme de consentement certifiée | IE | DPF + CCT | https://business.safety.google/adsprocessorterms/ |
| Google Ireland Ltd (Firebase Cloud Messaging) | Envoi des notifications (Android), après opt-in | IE | DPF + CCT | https://firebase.google.com/terms/data-processing-terms |
| Apple Distribution International (APNs) | Envoi des notifications (iOS), après opt-in | IE | DPF + CCT | https://www.apple.com/legal/internet-services/ |
