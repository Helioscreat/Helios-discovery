# @helios/game — client de jeu

L'application associe deux couches :
- **Phaser 3.90** pour la grille (canvas WebGL) ;
- **Preact** pour tous les écrans à texte, en HTML accessible : menus, modales, boutons, réglages. Les lecteurs d'écran ne savent pas lire un canvas.

Elle sera emballée pour Android et iOS par Capacitor au livrable 5.

```bash
npm run dev          # serveur de développement
npm run build        # build de production (dist/)
npm test             # tests unitaires (contrastes, formes, textes, profil)
npm run test:e2e     # tests d'interface : build + vite preview + Chromium (Playwright)
```

Pour les tests d'interface, il faut un Chromium : `npx playwright install chromium`, ou la variable `CHROMIUM_PATH`.

## Ce qui est provisoire

- `src/game/levels.ts` : 45 niveaux de démonstration, remplacés au livrable 4 par les niveaux faits main et le générateur.
- `src/game/profile.ts` : progression et inventaire stockés en local. Ils passeront côté serveur au livrable 5.
- Aucune boutique ni monétisation : l'écran d'échec propose seulement « Réessayer » et « Abandonner ». L'option « +5 coups » arrive au livrable 5.

## Règles d'interface vérifiées automatiquement

| Exigence | Test |
|---|---|
| Le refus est aussi visible que l'acceptation : même taille, même fond, même graisse, contraste ≥ 4,5:1 (COM-04) | `e2e/ui.e2e.test.ts` |
| Libellés de refus neutres, pris dans une liste blanche (COM-06) | `test/compliance.test.ts` |
| Aucun texte n'incite à acheter ni à « demander aux parents » ; le personnage n'apparaît sur aucun écran d'achat (AGE-10) | `test/compliance.test.ts` |
| Contrastes WCAG 2.1 AA des jetons de couleur (ACC-02) | `test/compliance.test.ts` |
| Formes distinctes par couleur, au plus 3 flashs par seconde, texte à 150 % sans débordement, commandes dans les 60 % inférieurs de l'écran (ACC-04) | les deux fichiers |

## Accessibilité

- Chaque couleur de pièce a une forme distincte. Le mode daltonien renforce les contours.
- Taille du texte : 100, 125 ou 150 %.
- Sous-titres des sons. Une région `aria-live` fait les annonces pour les lecteurs d'écran.
- Jeu au clavier : les flèches déplacent le curseur, Entrée choisit une pièce puis une voisine, Échap annule.
- Option « réduire les animations » (préférence système par défaut). L'indice après 5 s et les vibrations se désactivent.
- Modales : rôle `dialog`, focus piégé dans la boîte, Échap pour refuser.
