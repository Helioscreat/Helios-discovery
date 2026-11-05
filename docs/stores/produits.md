# Articles à créer dans Play Console et App Store Connect

Généré depuis packages/economy (catalogue et storeProduct). L'identifiant de produit doit être recopié exactement : le jeu et le serveur l'utilisent tel quel. Le prix de référence sert au plafond des mineurs ; le prix affiché au joueur est celui du store, à fixer au même niveau (prix TTC).

| Identifiant | Google Play | Consommé après crédit | App Store | Prix de référence TTC | Nom (fr) | Nom (en) | Description (fr) |
|---|---|---|---|---|---|---|---|
| starter_pack | Produit intégré | Non | Non consommable | 0,99 € | Pack de bienvenue | Welcome pack | Un pack disponible une seule fois par compte, sans limite de temps. |
| extra_moves | Produit intégré | Oui | Consommable | 0,99 € | +5 coups | +5 moves | Ajoute 5 coups au niveau en cours. |
| lives_1h | Produit intégré | Oui | Consommable | 0,99 € | Vies illimitées 1 h | Unlimited lives 1 h | Aucune vie n'est perdue pendant 1 heure. |
| lives_3h | Produit intégré | Oui | Consommable | 1,99 € | Vies illimitées 3 h | Unlimited lives 3 h | Aucune vie n'est perdue pendant 3 heures. |
| lives_24h | Produit intégré | Oui | Consommable | 4,99 € | Vies illimitées 24 h | Unlimited lives 24 h | Aucune vie n'est perdue pendant 24 heures. |
| boosters_s | Produit intégré | Oui | Consommable | 4,99 € | Pack de boosters S | Booster pack S | Un assortiment de boosters. |
| boosters_m | Produit intégré | Oui | Consommable | 9,99 € | Pack de boosters M | Booster pack M | Un assortiment de boosters. |
| boosters_l | Produit intégré | Oui | Consommable | 19,99 € | Pack de boosters L | Booster pack L | Un assortiment de boosters et 3 h de vies illimitées. |
| boosters_xl | Produit intégré | Oui | Consommable | 49,99 € | Pack de boosters XL | Booster pack XL | Un grand assortiment de boosters et 24 h de vies illimitées. |
| gardener_monthly | Abonnement (forfait de base « mensuel », mensuel, renouvelé automatiquement) | Non | Abonnement renouvelable (groupe « jardinier », 1 mois) | 4,99 € | Abonnement Jardinier | Gardener subscription | Chaque jour de l'abonnement, un Marteau et 30 minutes de vies illimitées. |
| pass_premium | Produit intégré | Oui | Consommable | 4,99 € | Passe Premium | Premium pass | Une récompense à chaque palier de la saison en cours, une décoration et un cadre d'avatar cosmétiques. |
| pass_premium_plus | Produit intégré | Oui | Consommable | 9,99 € | Passe Premium+ | Premium+ pass | Le passe Premium, plus 10 paliers d'avance et 20 % d'XP en plus pendant la saison en cours. |

## Google Play : accès du serveur

- Google Cloud : créer un compte de service dans un projet lié à Play Console et activer l'API Google Play Android Developer.
- Play Console > Utilisateurs et autorisations : inviter l'adresse du compte de service avec les droits « Afficher les données financières » et « Gérer les commandes et les abonnements », pour l'application Helios Discovery.
- Créer une clé JSON pour ce compte de service et la placer dans le coffre de secrets du serveur (variable GOOGLE_PLAY_SERVICE_ACCOUNT_JSON). Ne jamais la mettre dans le dépôt.
- Remboursements : aucun réglage. Le serveur interroge chaque heure l'API des achats annulés (voidedpurchases) avec ce même compte de service.

## App Store : accès du serveur

- App Store Connect > Accords, taxes et banques : signer l'accord des apps payantes et renseigner la fiscalité et le compte bancaire.
- App Store Connect > Utilisateurs et accès > Intégrations > Achats intégrés : générer une clé ; noter l'identifiant de la clé (APPLE_KEY_ID) et l'identifiant de l'émetteur (APPLE_ISSUER_ID).
- Placer le fichier .p8 dans le coffre de secrets du serveur (APPLE_PRIVATE_KEY). Il ne se télécharge qu'une fois.
- App Store Connect > App > Informations sur l'app > Notifications du serveur App Store : version 2, URL de production et de Sandbox = adresse du serveur suivie de /v1/stores/apple/notifications. Chaque notification est relue auprès de l'API d'Apple avant d'avoir un effet.

## Recette

- Google : ajouter des testeurs de licence (Play Console > Paramètres > Test des licences) et publier une version en test interne.
- Apple : créer un compte Sandbox et tester depuis TestFlight ; le serveur interroge automatiquement l'environnement Sandbox si la transaction n'existe pas en production.
- Vérifier pour chaque type : achat, annulation, paiement en attente (Google : « Paiement lent »), approbation parentale (Apple : « Demander l'autorisation »), remboursement.
