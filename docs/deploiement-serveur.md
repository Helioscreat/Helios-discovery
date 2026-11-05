# Déploiement du serveur (région UE)

## Choix retenu pour le lancement
Une seule machine Scaleway à Paris (fr-par), avec la base SQLite intégrée à Node sur un volume, des sauvegardes quotidiennes conservées 30 jours, et Caddy pour le HTTPS.
Cela suffit pour un lancement (un seul serveur, quelques milliers de joueurs actifs) et reste simple à exploiter.
**Limite** : un seul serveur. Il faudra passer à PostgreSQL managé avant d'en ajouter un second ; le schéma SQL est standard.

L'image est construite, testée et publiée automatiquement : `ghcr.io/helioscreat/helios-discovery-server:latest` (workflow « Image du serveur »).

## 1. Prérequis
- Un nom de domaine pour l'API (par exemple `api.helios-discovery.fr`). GitHub Pages ne peut pas héberger l'API.
- Un compte Scaleway au nom de L'AFFRERE SAS.

## 2. La machine
1. Scaleway > Instances > Créer : région **Paris (fr-par)**, petite instance (par exemple DEV1-S ou PLAY2-NANO), image Ubuntu 24.04, clé SSH.
2. Ajouter un volume Block Storage de 10 Go monté sur `/srv/helios`. Vérifier que le chiffrement au repos est actif pour ce volume.
3. Groupe de sécurité : n'ouvrir que les ports 22 (SSH, limité à ton adresse si possible), 80 et 443.
4. Chez ton registraire, créer un enregistrement DNS A `api` → adresse IP publique de la machine.

## 3. Installation
```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo mkdir -p /opt/helios /srv/helios/data/secrets /srv/helios/caddy && sudo chown -R 1000:1000 /srv/helios/data
```
Copier dans `/opt/helios` : `deploy/docker-compose.yml`, `deploy/Caddyfile`, et `deploy/server.env.example` renommé `server.env` (puis `chmod 600 server.env`).
Remplir `server.env` : domaine, clés de modération et d'administration (`openssl rand -hex 32`), accès Google Play et App Store (voir `docs/stores/produits.md`).
Placer la clé Apple `.p8` dans `/srv/helios/data/secrets/AuthKey.p8` (`chmod 600`).

```bash
cd /opt/helios && sudo docker compose --env-file server.env up -d
curl https://api.exemple.fr/v1/health
```
La dernière commande doit répondre `{"ok":true}`. Les journaux du serveur indiquent les stores configurés (« Vérification des achats : google, apple »).

## 4. Brancher le jeu et les stores
- GitHub > Settings > Secrets and variables > Actions > Variables : `VITE_API_URL` = `https://api.exemple.fr`, puis recompiler la version Android.
- App Store Connect > Notifications du serveur App Store (version 2) : `https://api.exemple.fr/v1/stores/apple/notifications` (production et Sandbox).

## 5. Exploitation
- Mise à jour : `sudo docker compose pull && sudo docker compose up -d` (arrêt propre, la base est fermée correctement).
- Sauvegardes : `/srv/helios/data/backups/helios-AAAA-MM-JJ.db`, une par jour, 30 jours au plus. Pour une copie hors de la machine, synchroniser ce dossier vers un bucket Scaleway Object Storage en fr-par avec une règle d'expiration à 30 jours.
- Restauration : arrêter `api`, remplacer `/srv/helios/data/helios.db` par une sauvegarde, redémarrer.
- Tableau de bord : `https://api.exemple.fr/admin`, avec une clé de `ADMIN_KEYS`.
