# @helios/core — moteur de grille

TypeScript pur, sans DOM ni dépendance. Le moteur est déterministe : la même graine et les mêmes coups donnent le même état, au bit près. L'état est sérialisable en JSON. Le rendu (Phaser, livrable 3) ne fait que consommer les événements.

```ts
import { createGame, applyMove, getHint } from "@helios/core";

const st = createGame({ width: 9, height: 9, colors: 5, moves: 25,
  goals: [{ type: "collect", color: 2, count: 30 }], seed: "niveau-151:v1" });
const { state, events, accepted } = applyMove(st, getHint(st)!); // version pure
```

| Fichier | Rôle |
|---|---|
| `rng.ts` | PRNG sfc32 seedé (état de 4 × 32 bits dans `GameState.rng`) |
| `board.ts` | Coordonnées, clonage, empreinte, notation ASCII (tests, niveaux faits main) |
| `match.ts` | Détection et classement : 5 en ligne > L/T > 4 en ligne > carré 2×2 > 3 en ligne |
| `effects.ts` | Zones d'effet (ligne, colonne, 3×3, 5×5, croix, 3 lignes + 3 colonnes) |
| `resolve.ts` | Phase de résolution (file FIFO des activations), gravité, remplissage, cascades |
| `moves.ts` | Validité des échanges, liste des coups, indice, mélange automatique |
| `game.ts` | Création de partie, application d'un coup, combos, bonus de fin, objectifs |

## Règles d'une phase

1. Les cases touchées sont marquées « condamnées ». Une spéciale touchée est mise en file et s'activera à son tour.
2. La file est vidée dans l'ordre d'arrivée (FIFO). Chaque activation peut toucher d'autres cases.
3. Les pièces condamnées sont supprimées. On compte ensuite le score (10 par pièce × rang de cascade, plus un bonus par spéciale créée) et l'avancement des objectifs.
4. Les spéciales créées par les alignements sont posées après la suppression. Leur case est la case jouée si elle fait partie du groupe, sinon la case la plus basse puis la plus à gauche.

Notation ASCII : `a`…`f` = couleurs ; suffixe `-` Fusée horizontale, `|` Fusée verticale, `*` Bombe, `^` Libellule ; `P` Prisme ; `_` case vide ; `#` case inactive.

## Tests

```bash
npm test             # depuis la racine du dépôt
npm run typecheck
```

93 tests :
- formes d'alignement et priorités ;
- effet de chaque spéciale et réactions en chaîne ;
- les 11 combos et les 6 boosters (dont le Kit de départ) ;
- les 6 obstacles (gel, caisses, chaînes, cages, lierre, objets à faire descendre), la gravité avec glissement en diagonale et 200 parties aléatoires avec obstacles ;
- règles d'échange ;
- gravité avec trous, mélange automatique, indice ;
- victoire, bonus de fin, défaite, objectifs ;
- PRNG (khi²), déterminisme, reprise après sérialisation ;
- absence de `Math.random` ou d'horloge dans le moteur ;
- 300 parties aléatoires jouées jusqu'au bout, avec vérification des invariants après chaque coup.

## Performance mesurée

Environ 10 000 coups par seconde sur un cœur (Node 22, hors environnement de test), en choisissant chaque coup par l'indice glouton. C'est quatre fois plus qu'au livrable 2. Deux optimisations y contribuent : l'évaluation locale des coups candidats, et la gravité appliquée en une passe par colonne.
