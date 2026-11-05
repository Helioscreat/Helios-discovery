# Signature Android : clé d'envoi et version pour Play Console

Play Console demande une version de l'app (fichier AAB signé) avant de permettre la création des produits intégrés.
Google conserve la clé de signature finale (« signature d'application par Google Play ») ; tu gardes seulement la **clé d'envoi**, qui sert à prouver que les versions viennent de toi.

## 1. Créer la clé d'envoi (une seule fois, sur ton ordinateur)

Il faut Java (Android Studio l'installe). Dans un terminal :

```bash
keytool -genkeypair -v -keystore helios-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=L'AFFRERE SAS, O=L'AFFRERE SAS, C=FR"
```

`keytool` demande deux mots de passe (fichier et clé) : choisis-les longs et note-les dans ton gestionnaire de mots de passe.
**Garde une copie de `helios-upload.jks` en lieu sûr** (hors du dépôt). Si elle est perdue, Google permet de la réinitialiser, mais c'est une démarche manuelle.

## 2. Donner la clé à GitHub Actions (secrets du dépôt)

Encoder le fichier en base64 :

```bash
base64 -i helios-upload.jks | tr -d '\n' > helios-upload.b64
```

Puis, dans GitHub : dépôt > Settings > Secrets and variables > Actions > New repository secret, créer :

| Secret | Valeur |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contenu de `helios-upload.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du fichier |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé |

Supprime ensuite `helios-upload.b64` de ton ordinateur.

## 3. Compiler une version

Onglet Actions > « Version Android » > Run workflow (laisser « Annonces de test » coché pour les tests internes).
Le fichier `app-release.aab` est disponible 30 jours dans la rubrique Artifacts de la compilation.

## 4. L'envoyer à Play Console

Play Console > Helios Discovery > Tester et publier > Tests > Test interne > Créer une version :
accepter la signature d'application par Google Play, envoyer `app-release.aab`, ajouter des testeurs, enregistrer.
Les produits intégrés et l'abonnement peuvent ensuite être créés (prompt Play Console, étapes 2 et 3).
