# @helios/config — paramètres pilotables et registres de gouvernance

Une seule source pour ce que le serveur applique, ce que le client affiche et ce que les documents juridiques citeront (livrable 8).

| Module | Contenu | Exigences |
|---|---|---|
| `remote.ts` | `DEFAULT_CONFIG` et surcharges par pays : plafond mensuel des mineurs, publicité (activée, maximum par jour), offres mises en avant, achat tardif du passe, articles désactivés, âge de consentement. `validateConfig` borne chaque valeur (plafond ≤ 50 €, pubs ≤ 5/jour, notifications ≤ 2/jour, heures calmes couvrant 22 h–8 h). | DFA-01, AGE-11 |
| `remote.ts` (expériences) | `validateExperiments` : un test de prix exige une annonce publique (URL https) et un écart ≤ 20 % ; aucun segment fondé sur l'âge, la dépense, les échecs ou la durée de session ; un test de difficulté est refusé sur tout niveau publié (`PUBLISHED_THROUGH_LEVEL`, aligné sur le manifeste des niveaux) : le niveau N est identique pour tous. `assignVariant` place toujours les joueurs protégés dans la variante de référence. | ANA-02, FAIR-01 |
| `notifications.ts` | Préférences opt-in (tout désactivé par défaut), catégories (pas d'offres pour un joueur protégé), planificateur : quota par jour et heures calmes à l'heure locale. | NOT-01 |
| `governance.ts` | `RETENTION` (durée par table, utilisée par la purge du serveur), `SUBPROCESSORS` (hôtes, garanties, DPA, chargement après consentement), `EU_REGIONS`, `CHANGELOG`. | GDPR-08, GDPR-09, DIG-01 |

Changer une valeur ici change le serveur, le client et les tests en même temps. Une config publiée à chaud (`POST /v1/admin/config`) passe par le même validateur.
