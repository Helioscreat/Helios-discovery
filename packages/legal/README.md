# @helios/legal — documents juridiques et déclarations des stores

Tous les documents sont **générés** depuis des sources uniques. Pour modifier un document, modifie sa source, puis lance `npm run legal`. Un test échoue si un fichier généré n'est pas à jour.

| Source | Contenu | Alimente |
|---|---|---|
| `src/publisher.ts` | Identité de l'éditeur, hébergeur, médiateur, autorités | Mentions légales, CGU, CGV, confidentialité, registre, fiche éditeur des stores |
| `src/inventory.ts` | Types de données (`@collects`), traitements, stockage sur l'appareil | Confidentialité, registre, AIPD, Sécurité des données, PrivacyInfo.xcprivacy |
| `@helios/config` | Durées de conservation, sous-traitants, plafonds par pays | Confidentialité, CGV, registre |
| `@helios/economy` | Catalogue, durée de saison | CGV, IARC |
| `src/phrases/*.ts` | Textes en fr, en, nl, de, es, it (mêmes clés, mêmes variables) | Documents joueurs |
| `deploy/build.json` | Public cible, SDK natifs | Contrôle Familles |

## Fichiers produits

| Fichier | Public |
|---|---|
| `docs/legal/<langue>/{privacy,terms,essentials,sales,notice,accessibility}.md` | Relecture juridique |
| `apps/game/public/legal/<langue>/*.html` | Joueurs : liés depuis Paramètres > Aide au jeu et depuis l'écran de consentement ; à publier aussi sur le site (URL de la politique de confidentialité demandée par les stores) |
| `docs/legal/internal/registre.md`, `aipd.md` | Interne (RGPD art. 30 et 35) |
| `docs/stores/data-safety.md`, `PrivacyInfo.xcprivacy`, `iarc.md`, `fiche-editeur.md` | Formulaires de Play Console et d'App Store Connect |

## Avant publication

```bash
npm run legal:release
```

Cette commande échoue tant qu'il reste des valeurs `⟦À COMPLÉTER⟧` (raison sociale, SIREN, médiateur, etc.). Ensuite :

1. Faire relire les 6 documents français par un avocat, puis les traductions par un traducteur juridique.
2. Désigner un médiateur de la consommation (C. consom. L612-1) et reporter ses coordonnées.
3. Réévaluer la désignation d'un délégué à la protection des données (art. 37) avec l'AIPD.
4. Reporter les réponses de `docs/stores/` dans les deux consoles et archiver les captures (T-DSA-06).
