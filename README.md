# Helios Discovery

Match-3 free-to-play original où l'on restaure une île céleste. Moteur de grille déterministe en TypeScript, Phaser 3 + Capacitor, 10 000 niveaux (150 faits main, le reste généré et validé par bot). Conçu pour le droit de l'UE : aucun hasard payant, prix en euros, protection des mineurs, RGPD, DSA.

- `docs/GDD.md` — game design document résumé
- `compliance/matrix.yaml` — matrice de conformité (source de vérité)
- `docs/matrice-conformite.md` — version lisible, générée par `npm run matrix`

```bash
npm install
npm test                 # tests unitaires de tous les paquets
npm run test:e2e         # tests d'interface (Chromium) avec le serveur réel
npm run matrix:coverage  # couverture de la matrice de conformité
npm run legal            # régénère les documents juridiques
npm run legal:release    # échoue s'il reste des valeurs à compléter
```

| Paquet | Rôle |
|---|---|
| `packages/core` | Moteur de grille déterministe : spéciales, combos, obstacles, boosters |
| `packages/bot` | Bots de validation (glouton, Monte-Carlo) et calibrage |
| `packages/levels` | Niveaux 1–150 faits main, générateur 151–10 000, CLI `generate` |
| `packages/economy` | Vies, boutique, passe de saison, récompenses gratuites, île |
| `packages/compliance` | Règles d'âge, de consentement, de filtrage et de modération |
| `packages/legal` | Documents juridiques en 6 langues, registre, AIPD, déclarations des stores, générés depuis des sources uniques |
| `packages/config` | Config distante par pays, notifications, durées de conservation, sous-traitants, notes de version |
| `apps/game` | Client Phaser + Preact, en 6 langues (fr, en, nl, de, es, it) |
| `apps/server` | Serveur de l'éditeur, à héberger dans l'UE |
