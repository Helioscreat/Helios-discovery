# Google UMP : configuration du message RGPD dans AdMob

Le formulaire de consentement publicitaire est rendu par Google à partir de la configuration saisie dans AdMob > Confidentialité et messages. Le jeu l'appelle (packages/compliance umpPlan, apps/game/src/game/ump.ts) mais n'en contrôle ni le texte ni les boutons. Cette liste est à vérifier à chaque modification du message et avant chaque publication.

## Message « Réglementations européennes » (RGPD)

- Créer un message pour l'application Android et pour l'application iOS (même configuration).
- Langues : fr, en, nl, de, es, it (mêmes langues que le jeu).
- Activer le bouton « Ne pas autoriser » sur le premier écran, au même niveau que « Autoriser » (GDPR-02, COM-04) ; vérifier sur une capture que les deux boutons ont la même taille et le même contraste.
- Garder « Gérer les options » pour le choix finalité par finalité.
- Partenaires publicitaires : liste personnalisée réduite à Google ; n'ajouter aucun autre partenaire sans mettre à jour la politique de confidentialité et le registre.
- Lien vers la politique de confidentialité : https://helioscreat.github.io/Helios-discovery/legal/fr/privacy.html (et la langue de chaque message).
- Désactiver le message explicatif IDFA d'AdMob : le jeu ne demande l'autorisation App Tracking Transparency qu'à un majeur dont UMP a recueilli le consentement (AGE-05).

## Comportement attendu dans le jeu

| Joueur | Appel à UMP | Formulaire | Publicité possible |
|---|---|---|---|
| Âge inconnu ou sous l'âge du consentement du pays | Aucun | Aucun | Aucune |
| Pays où la publicité est coupée (config distante) | Aucun | Aucun | Aucune |
| Mineur au-dessus de l'âge du consentement | tagForUnderAgeOfConsent = vrai | Aucun (statut NOT_REQUIRED) | Limitée, non personnalisée |
| Majeur | tagForUnderAgeOfConsent = faux | Si Google l'exige (premier lancement, nouvelle version du message) | Selon le choix ; limitée en cas de refus |

Le point d'entrée « Choix publicitaires (Google) » apparaît dans Paramètres > Confidentialité quand UMP l'exige (privacyOptionsRequirementStatus = REQUIRED).

## Recette avant publication

- Déclarer les appareils de test (testDeviceIdentifiers) et forcer la géographie EEE (debugGeography) dans une version de recette uniquement.
- Vérifier sur Android et iOS : premier lancement d'un majeur (formulaire), d'un mineur de 16 ans (aucun formulaire), d'un joueur de 14 ans en France (aucun appel réseau vers Google).
- Vérifier que « Choix publicitaires » rouvre le formulaire et que le nouveau choix est pris en compte sans redémarrage.

## Limite connue

Le plugin Capacitor n'expose pas la chaîne TC : le serveur ne journalise que le statut renvoyé par UMP et sa date (table consents, colonne ads_status). La preuve détaillée du choix reste sur l'appareil (clés IABTCF_*) et chez Google.
