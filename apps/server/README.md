# @helios/server — serveur de l'éditeur (à héberger dans l'UE)

Il repose sur `node:http` et `node:sqlite`, sans dépendance tierce. Le schéma SQL de `src/db.ts` est standard et se transpose à PostgreSQL pour la production, hébergée en région UE.

```bash
npm run build -w @helios/server
PORT=8787 ALLOWED_ORIGINS=https://jeu.example DB_PATH=/data/helios.db MODERATORS=cle-a,cle-b ADMIN_KEYS=cle-admin \
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
| `POST /v1/events` | Mesure d'audience first-party, refusée sans consentement ; schéma fermé (événement, champ ou texte libre inconnu : 422) | GDPR-03/04 |
| `GET /v1/config?country=` | Config distante résolue pour un pays (monétisation, notifications, âge de consentement) | DFA-01 |
| `POST /v1/admin/config` | Publication d'une nouvelle config, validée (bornes, expériences) et versionnée ; en-tête `x-admin-key` | DFA-01, ANA-02 |
| `GET /v1/admin/dashboard` | Entonnoir par niveau, conversion Premium, rétention J1/J7/J30, indicateurs de protection et alertes | ANA-01 |
| `GET /admin` | Page du tableau de bord (sans données ; les chiffres exigent la clé), `X-Frame-Options: DENY` | ANA-01 |

Chaque table du schéma est classée dans `PERSONAL_TABLES`, `PSEUDONYMIZED_TABLES` ou `TECHNICAL_TABLES`. Un test échoue si une nouvelle table n'est pas classée. L'export et l'effacement s'appuient sur ce même classement.

## Déploiement

Image Docker publiée par GitHub Actions (`ghcr.io/helioscreat/helios-discovery-server`), déployée avec `deploy/docker-compose.yml` (serveur + Caddy pour le HTTPS). Marche à suivre : `docs/deploiement-serveur.md`. Sauvegardes quotidiennes (`BACKUP_DIR`), conservées 30 jours ; arrêt propre sur SIGTERM.

## Avant la production

- **Vérification des reçus :** `src/stores.ts` interroge la Google Play Developer API (compte de service) et l'App Store Server API (clé d'achats intégrés). Chaque reçu doit appartenir au compte qui l'envoie ; il n'est crédité qu'une fois ; les achats Google sont acquittés par le serveur juste après le crédit. Variables (dans un coffre de secrets) :
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (ou `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE`), `GOOGLE_PLAY_PACKAGE` ;
  - `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (ou `APPLE_PRIVATE_KEY_FILE`), `APPLE_BUNDLE_ID` ;
  - avec `NODE_ENV=production`, les reçus simulés sont toujours refusés.
  La création des produits et des accès est décrite dans `docs/stores/produits.md`. Remboursements : Google, tâche horaire sur l'API des achats annulés ; Apple, `POST /v1/stores/apple/notifications` (notifications V2), relues auprès de l'App Store Server API avant tout effet. Le jeu lit `GET /v1/me/purchases` au lancement et retire le contenu remboursé.
- **Base de données :** au lancement, SQLite sur un volume chiffré, une seule instance. Passer à PostgreSQL managé en région UE avant d'ajouter un second serveur. Les sauvegardes respectent la même échéance d'effacement (30 jours).
- **Modération :** gérer les clés des modérateurs (`MODERATORS`) dans un coffre de secrets. Le back-office se branche sur les routes `/v1/moderation/*`.
- **Durées de conservation et purge :** la purge tourne chaque jour (`runRetentionJob`). Les durées viennent de `RETENTION` (`@helios/config`), la même source que la politique de confidentialité (GDPR-09).
- **Clés d'administration :** `ADMIN_KEYS` dans un coffre de secrets ; en production, placer `/admin` et `/v1/admin/*` derrière un accès réseau restreint (VPN ou liste d'adresses).
- **Mesure d'audience :** les événements ne contiennent ni identifiant publicitaire ni texte libre ; le tableau de bord ne sort que des agrégats.
