# @helios/levels — niveaux, générateur, validation

```bash
npm run generate -- generate --from 151 --to 10000 --validate          # depuis la racine
node packages/levels/dist/cli.cjs design --from 1 --to 150             # recalibre les niveaux faits main
```

Options de `generate` :
- `--out` : dossier de sortie, `out` par défaut ;
- `--workers` : nombre de workers, par défaut le nombre de cœurs ;
- `--runs` : parties de bot par niveau, 200 par défaut ;
- `--audit` : part des niveaux rejoués sur des parties neuves, 0,1 par défaut ;
- `--no-json` : ne pas écrire les fichiers JSON des niveaux.

## Sorties

| Fichier | Contenu |
|---|---|
| `levels/NNNNN.json` | Niveau complet : grille, couleurs, coups, objectifs, graine, validation |
| `report.csv` | N, type, difficulté, cible, taux bot, coups, coups restants moyens, taux d'audit, tentatives, statut, forme, couleurs, objectifs |
| `manifest.json` | `[N, tentative, échelle, coups, empreinte]` par niveau : le jeu régénère chaque niveau à l'identique et vérifie l'empreinte |
| `summary.json` | Durée, part dans la fourchette, niveaux infaisables, résultat de l'audit |

Le dépôt contient `data/handmade/` (les 150 JSON faits main et leur rapport) et `data/generated/` (rapport, manifeste, résumé). Les 9 850 JSON générés ne sont pas commités : ils se reconstruisent à l'identique à partir du manifeste.

## Comment un niveau est validé

1. **Grille.** Le niveau N ne dépend que de `(N, version de contenu, tentative, échelle)`. Sa graine vaut `hash(N, version, tentative)`. La grille de départ est identique pour tous. Seule la suite des pièces qui tombent varie d'un essai à l'autre, sans aucun lien avec le profil ni les dépenses du joueur.
2. **Bot.** Un bot glouton stochastique joue 200 parties indépendantes. Sa politique ignore les coups restants : une partie se déroule à l'identique quel que soit le budget. Le taux de réussite pour un budget de M coups est donc exactement la part des parties gagnées en M coups ou moins. Une seule série de parties suffit pour tous les budgets.
3. **Budget.** On retient le plus petit M dont le taux atteint au moins la cible. Un niveau n'est jamais calibré sous la cible, ce qui protège le critère FAIR-02.
4. **Fourchette.** Si le taux sort de ±10 points autour de la cible, l'échelle des objectifs est ajustée et le niveau régénéré (tentative suivante, 7 au plus). Un pré-test de 40 parties écarte rapidement les candidats très éloignés.
5. **Faisabilité.** Si le glouton ne gagne jamais, un bot Monte-Carlo cherche une victoire. S'il n'en trouve pas, le niveau est rejeté et rendu plus facile.
6. **Audit.** Un niveau sur dix est rejoué sur 200 parties neuves pour mesurer l'écart hors échantillon.

| Profil | Position dans le bloc de 10 | Cible |
|---|---|---|
| Détente | 1 | 90 % |
| Facile | 2–3 | 85 % |
| Moyen | 4–6, 8–9 | 60 % |
| Difficile (badge) | 7 | 35 % |
| Très difficile (badge) | 10 | 20 % |

Niveaux 1 à 15 (accueil) : 92 à 95 %, sans badge. Tous les niveaux tutoriels sont à 95 %.

## Éléments

| Élément | Introduit au niveau | Règle |
|---|---|---|
| Gel (1 à 3 couches) | 13 | Un alignement ou une explosion sur la case enlève une couche |
| Caisses (1 à 3 PV) | 33 | Fixes ; abîmées par un alignement voisin ou une explosion ; les cases en dessous se remplissent en diagonale |
| Chaînes | 52 | La pièce ne bouge pas ; un alignement qui l'inclut brise la chaîne |
| Graines de lumière (objets à faire descendre) | 71 | Indestructibles ; sortent par le bas de la grille |
| Cages | 92 | La pièce ne bouge pas et ne s'aligne pas ; un alignement voisin ouvre la cage |
| Lierre | 112 | Gagne une case par coup si aucun lierre n'est détruit ; jamais sur une case d'apparition, ni sous 50 % de pièces libres |

Les Bulles, Portails, Tapis roulants, Générateurs et Coffres à clé ne sont pas encore implémentés (voir le compte rendu du livrable 4).
