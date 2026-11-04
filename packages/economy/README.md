# @helios/economy — économie, passe de saison, récompenses gratuites, île

Module pur et déterministe : le temps (`now`, en ms) est toujours passé en paramètre, et les tirages sont seedés. Au déploiement, le serveur (livrable 6) en sera la source de vérité : reçus vérifiés, plafond des mineurs, tirages.

| Module | Rôle | Exigences |
|---|---|---|
| `catalog.ts` | Articles vendus en euros, sans monnaie premium ; prix en pièces (gagnées en jouant, jamais achetables) | COM-15, RNG-01 |
| `validate.ts` | Validation de la config : minuteur lié à une fin réelle, pas de rareté, « limitée » une fois par an, réduction au prix le plus bas des 30 derniers jours, fermeture avec 90 jours de préavis | COM-01/02/03/11, DIG-02 |
| `wallet.ts` | Vies (5, +1 toutes les 30 min, seule une défaite coûte), vies illimitées, pièces, abonnement ; aucun achat n'expire | ECO-01, COM-16 |
| `continue.ts` | « +5 coups » à prix fixe ; jamais payant pour un joueur protégé (< 18 ans ou âge inconnu) | COM-13, AGE-06 |
| `offers.ts` | Moteur d'offres fermé : il ne voit que le pays, la progression et le catalogue | COM-07 |
| `receipts.ts` | Reçus idempotents, remboursements, achats en attente, grand livre, récapitulatif mensuel | COM-17, AGE-08, WELL-01 |
| `store.ts` | Interface Google Play / StoreKit, magasin simulé, liens de résiliation et de remboursement, plafond mensuel des mineurs | COM-10/12/14, AGE-07 |
| `season.ts` | Passe de 20 jours : 40 paliers × 250 XP, liste complète, estimation par la médiane, achat tardif, clôture automatique, coffres gratuits | SEA-01 à 04, RNG-02 |
| `rewards.ts` | Roue gratuite (1 tour par jour, probabilités affichées), série (un jour manqué = un cran de recul), quêtes, pubs plafonnées à 5 par jour avec récompense fixe | RNG-02/03, ECO-02/03 |
| `island.ts` | 6 zones de 12 tâches, 3 décorations gratuites par tâche plus une décoration cosmétique du passe | COM-08 |

## Ce qui est simulé en attendant le serveur et les stores

- **Vérification des reçus :** `MockVerifier` reproduit les états renvoyés par les stores. Les implémentations réelles (Google Play Developer API, App Store Server API) demandent les identifiants de l'éditeur.
- **Paiement :** `MockStore` formate les prix comme un store. Le jeu ne lit jamais un prix codé en dur.
- **Tranche d'âge :** elle reste « inconnue » tant que l'écran d'âge (livrable 6) n'existe pas, et un âge inconnu est traité comme protégé. Dans la version actuelle, aucun joueur ne voit donc d'option payante à l'échec ni d'offre mise en avant, sauf via le crochet de test.
- **Pubs récompensées :** la règle est en place (5 par jour, récompense fixe), mais le SDK publicitaire arrive avec le consentement au livrable 6.
