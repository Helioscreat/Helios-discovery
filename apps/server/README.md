# @helios/server — serveur de l'éditeur (à héberger dans l'UE)

Il repose sur `node:http` et `node:sqlite`, sans dépendance tierce. Le schéma SQL de `src/db.ts` est standard et se transpose à PostgreSQL pour la production, hébergée en région UE.

```bash
npm run build -w @helios/server
PORT=8787 ALLOWED_ORIGINS=https://jeu.example DB_PATH=/data/helios.db MODERATORS=cle-a,cle-b \
  npm start -w @helios/server
```

| Route | Rôle | Exigence |
|---|---|---|
| `POST /v1/accounts` | Compte pseudonyme (UUID), jeton stocké haché | GDPR-01 |
| `POST /v1/me/age` | Âge déclaré une seule fois (409 ensuite), seul le mois de naissance est conservé | AGE-01/02 |
| `POST /v1/me/consent` | Consentement normalisé selon l'âge et journalisé avec la version de la notice | GDPR-02/04/11, AGE-04 |
| `POST /v1/purchases/authorize` / `verify` | Plafond mensuel des mineurs, reçus vérifiés et crédités une seule fois | AGE-07, COM-17 |
| `/v1/teams/:id/messages` | Chat d'équipe : messages prédéfinis seulement sous 16 ans, filtre, blocage | AGE-09, DSA-07 |
| `POST /v1/reports` | Signalement d'un message ou d'un profil, avec accusé de réception | DSA-02 |
| `POST /v1/moderation/decisions` | Décision motivée (art. 17(3)), appliquée et notifiée | DSA-03 |
| `POST /v1/appeals` + `/resolve` | Recours traité par un modérateur différent | DSA-04 |
| `GET/POST /v1/contact` | Point de contact unique : e-mail, formulaire, langues ; accessible sans compte | DSA-01 |
| `GET /v1/me/export` | Export JSON de toutes les tables personnelles | GDPR-06 |
| `POST /v1/me/delete` | Verrouillage immédiat, effacement sous 7 jours (au plus 30) ; grand livre pseudonymisé | GDPR-07 |
| `POST /v1/events` | Mesure d'audience first-party, refusée sans consentement | GDPR-03/04 |

Chaque table du schéma est classée dans `PERSONAL_TABLES`, `PSEUDONYMIZED_TABLES` ou `TECHNICAL_TABLES`. Un test échoue si une nouvelle table n'est pas classée. L'export et l'effacement s'appuient sur ce même classement.

## Avant la production

- **Vérification des reçus :** remplacer `MockVerifier` par les vérificateurs Google Play Developer API et App Store Server API, qui demandent les identifiants de l'éditeur.
- **Base de données :** utiliser PostgreSQL managé en région UE, avec chiffrement au repos et sauvegardes conservées 30 jours au plus. Les sauvegardes doivent respecter la même échéance d'effacement.
- **Modération :** gérer les clés des modérateurs (`MODERATORS`) dans un coffre de secrets. Le back-office se branche sur les routes `/v1/moderation/*`.
- **Durées de conservation et purge :** elles arrivent au livrable 7 (GDPR-09).
