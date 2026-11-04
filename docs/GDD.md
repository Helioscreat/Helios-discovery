# Helios Discovery — GDD résumé (livrable 1)

Version 0.1 — 2026-11-04. Statut : brouillon de conception. Les points marqués **[À CONFIRMER]**
reposent sur des hypothèses par défaut faute de réponse aux questions bloquantes.

---

## 0. Hypothèses retenues

| Sujet | Hypothèse par défaut | Conséquence si elle change |
|---|---|---|
| Moteur | Phaser 3 + TypeScript, Capacitor pour Android/iOS | Unity : le cœur `core/` se porte en C#, la matrice reste valable |
| Pays | FR, BE, DE, ES, IT, NL | Ajout de pays : table d'âge, langues, CGV locales |
| Public | 13 ans et plus, **non destiné aux enfants** au sens de Google Families | Si enfants visés : politique Familles, SDK certifiés, plus de pub ni d'analytics tiers |
| Publicité | Vidéos récompensées uniquement (AdMob), facultatives, 5/jour max | Sans pub : la CMP TCF devient inutile |
| Éditeur | SASU, micro-entreprise (< 10 salariés, CA ≤ 2 M€) | Petite ou moyenne entreprise : l'EAA et l'art. 28 du DSA deviennent des obligations (déjà implémentés) |
| Monnaie premium | **Supprimée.** Tout se vend directement en euros via le store ; les pièces se gagnent uniquement en jouant | Réactivable par config (`pricing.model = "gems"`) ; les règles COM-15/16 s'activent alors |
| Âge des protections commerciales | **< 18 ans** (DSA art. 28, directive 2005/29 annexe I pt 28) | — |
| Âge du consentement RGPD | Table par pays (FR 15, BE 13, DE 16, ES 14, IT 14, NL 16 ; défaut 16) | — |

**Correction par rapport à ma réponse précédente.** Dans l'EEE, Google impose une CMP certifiée et
intégrée au TCF v2.2 à tout éditeur qui diffuse des annonces AdMob, y compris non personnalisées.
L'option « vidéos récompensées seulement » n'allège donc pas la CMP. J'utilise le SDK Google UMP,
qui est une CMP certifiée et gratuite. Confiance élevée sur l'exigence de Google ; la dispense
éventuelle des annonces « limitées » reste à faire valider.

---

## 1. Vision et piliers

Un match-3 calme et généreux. Le joueur restaure une île céleste. La qualité du jeu donne envie
de revenir ; la pression n'y est pour rien.

1. **Ressenti.** Des cascades lisibles, un son qui monte, une fin de niveau festive.
2. **Équité.** Le niveau N est identique pour tous. Rien ne dépend de la dépense.
3. **Transparence.** Chaque achat est décrit, chiffré en euros et réversible selon les règles du store.
4. **Progression gratuite complète.** Les niveaux, les zones, les histoires et les mécaniques s'obtiennent tous sans payer.

**Conflit dans le cahier des charges.** La section 8.2 exige que « tout le contenu soit atteignable
gratuitement », alors que la section 6 prévoit des « décorations exclusives » pour le passe premium.
Ma résolution : chaque tâche de rénovation garde 3 variantes gratuites. Les variantes premium sont
une 4ᵉ variante **purement cosmétique**, étiquetée « Passe Premium », sans effet sur la progression,
le score ou l'XP. À faire valider par l'avocat : cette lecture de « contenu » (contenu de
progression) est défendable mais n'est pas tranchée par un texte.

---

## 2. Univers

- **Titre :** Helios Discovery. Helios, le soleil de l'archipel, s'est voilé ; chaque zone restaurée lui rend un rayon.
- **Île :** l'archipel d'Aérine, une île céleste dont les jardins se sont fanés. 1 zone = 12 tâches
  et une mini-histoire en 4 scènes.
- **Guide :** Pépin, un esprit-graine qui parle peu et s'émerveille beaucoup. Pépin ne parle
  **jamais** de la boutique et n'apparaît sur aucun écran d'achat (règle AGE-10).
- **Pièces :** une couleur et une forme chacune, pour que les couleurs se distinguent aussi en mode daltonien.

| Pièce | Couleur | Forme |
|---|---|---|
| Baie | rouge #D7263D | cercle |
| Pétale | jaune #F4C430 | étoile 5 branches |
| Feuille | vert #2E9E4F | triangle |
| Goutte | bleu #1B6CD1 | goutte |
| Prune | violet #7B3FA0 | losange |
| Nuage | blanc-rose #F5B8C9 | carré arrondi |

Chaque forme reste identifiable en niveaux de gris (test ACC-04).

**Zones prévues :** 1. Le Quai des nuages, 2. Le Verger suspendu, 3. La Serre de verre,
4. Le Moulin à vent, 5. La Cascade inversée… Il faut environ 600 étoiles par zone ; le nombre de
zones est calibré au livrable 5.

---

## 3. Boucles de jeu

- **Boucle courte (≈ 2 min) :** niveau, puis étoiles, pièces et XP de saison.
- **Boucle moyenne :** les étoiles servent aux tâches de rénovation, qui font avancer l'histoire de la zone.
- **Boucle longue :** passe de saison de 20 jours, équipe, collection de décorations.

---

## 4. Gameplay

### 4.1 Grille
- Grille jusqu'à 9×9, avec masque de cases actives pour les formes irrégulières. De 4 à 6 couleurs.
- Les pièces tombent vers le bas. Une case inactive coupe la colonne en segments indépendants ; chaque segment est rempli par sa case la plus haute. (La chute en diagonale autour des trous viendra au livrable 4 si les formes de grille l'exigent.)
- L'échange n'est valide que s'il crée un alignement ou s'il implique deux spéciales.
- **Mélange automatique** quand aucun coup n'est possible. Il ne consomme pas de coup et garantit au moins un coup après le mélange.
- **Indice** après 5 s sans action. Il est désactivable.

### 4.2 Résolution et déterminisme
- Les tirages aléatoires passent par un **PRNG seedé** (sfc32) stocké dans l'état de la partie.
- L'état (grille, PRNG, coups, objectifs) est entièrement sérialisable en JSON.
- La même seed et la même suite de coups donnent le même résultat, au bit près.
- **Ordre de résolution d'une étape :**
  1. détecter les alignements ;
  2. classer les formes ;
  3. créer les spéciales ;
  4. effacer et appliquer les dégâts aux obstacles ;
  5. déclencher les spéciales en file FIFO ;
  6. appliquer la gravité ;
  7. remplir ;
  8. recommencer jusqu'à stabilité.
- Le moteur n'émet que des **événements** (`matched`, `spawned`, `fell`…). Le rendu les anime sans jamais modifier l'état.

### 4.3 Spéciales

Priorité de classement quand un alignement correspond à plusieurs formes : 5 en ligne > L/T > 4 en
ligne > carré 2×2 > 3 en ligne.

| Forme | Spéciale | Effet |
|---|---|---|
| 4 en ligne | Fusée | Efface la ligne (alignement vertical) ou la colonne (alignement horizontal). Orientation perpendiculaire à l'alignement, comme l'usage du genre |
| L ou T | Bombe | Efface le carré 3×3 |
| Carré 2×2 | Libellule | Efface sa case et une croix de 4 voisins, puis vole vers une case objectif |
| 5 en ligne | Prisme | Échangé avec une pièce, efface toutes les pièces de cette couleur |

- **Position de la spéciale :** la case déplacée par le joueur si elle fait partie de l'alignement. Sinon, en cascade, la case la plus en bas puis la plus à gauche de l'alignement.
- **Cible de la Libellule :** la case objectif restante la plus prioritaire, départagée par le PRNG de la partie (donc déterministe).

### 4.4 Combos (échange de deux spéciales)

| Combo | Effet |
|---|---|
| Fusée + Fusée | Croix : la ligne et la colonne |
| Fusée + Bombe | 3 lignes et 3 colonnes centrées |
| Bombe + Bombe | Zone 5×5 |
| Prisme + Fusée | Toutes les pièces de la couleur de la Fusée deviennent des Fusées (orientation tirée au PRNG), puis se déclenchent |
| Prisme + Bombe | *(non spécifié, complété)* La couleur de la Bombe devient des Bombes |
| Prisme + Libellule | *(complété)* La couleur de la Libellule devient des Libellules |
| Prisme déclenché par une explosion | *(complété)* Efface la couleur la plus présente sur la grille |
| Prisme + Prisme | Toute la grille est effacée. Les obstacles reçoivent 1 point de dégât |
| Libellule + Libellule | *(complété)* 3 Libellules partent vers 3 cibles |
| Libellule + Fusée ou Bombe | La Libellule transporte l'effet et le déclenche sur sa cible |

### 4.5 Ressenti
- La hauteur du son suit le rang de la cascade (gamme pentatonique, plafonnée au 8ᵉ degré).
- Les vibrations sont courtes et se désactivent dans les paramètres.
- **Fin de niveau :** chaque coup restant devient une Fusée posée sur une case aléatoire (PRNG de la partie), puis se déclenche. Le bonus de score est affiché.
- **Budget de performance :** 60 fps visés sur un appareil de référence de type Android Go à 2 Go de RAM (modèle à fixer). Au plus 300 particules actives, atlas de textures unique et pool d'objets.

### 4.6 Accessibilité
- Formes distinctes par couleur, toujours affichées. Le mode daltonien renforce les contours.
- 3 tailles de texte (100 / 125 / 150 %), sous-titres pour toute voix ou son porteur de sens.
- **Aucun flash de plus de 3 par seconde :** les effets lumineux sont limités dans le moteur de particules (test automatisé).
- **Jouable d'une main :** les commandes sont dans les 60 % inférieurs de l'écran, et le glisser fonctionne comme le tap-tap.
- **Architecture DOM pour les écrans à texte.** Les lecteurs d'écran ne lisent pas un canvas WebGL. Les menus, la boutique, les écrans d'achat, le consentement, l'âge et les paramètres sont donc en **HTML/ARIA** superposé au canvas. Seule la grille est en canvas.

---

## 5. Objectifs et obstacles

**Objectifs :** score, collecte de couleurs, gel, objets à faire descendre, pièces à libérer, et objectifs mixtes (2 ou 3 types).

**Introduction des obstacles :** chaque obstacle arrive par un niveau tutoriel dédié, toujours en position détente ou facile (taux visé 95 %).

| Niveau | Élément | Règle |
|---|---|---|
| 2–6 | Fusée, Libellule, Bombe, Prisme, combos | Tutoriels des spéciales |
| 8, 12, 18, 25, 32, 40 | Boosters | Tutoriel et 3 exemplaires offerts |
| 13 | Gel (1 à 3 couches) | Un alignement ou une explosion sur la case enlève une couche |
| 33 | Caisses (1 à 3 PV) | Fixes ; abîmées par un alignement voisin ou une explosion ; les cases en dessous se remplissent en diagonale |
| 52 | Chaînes | La pièce s'aligne mais ne bouge pas ; un alignement qui l'inclut brise la chaîne |
| 71 | Graines de lumière (objets à faire descendre) | Indestructibles ; sortent par le bas |
| 92 | Cages | La pièce ne bouge pas et ne s'aligne pas ; un alignement voisin ouvre la cage |
| 112 | Lierre | Gagne une case par coup sans lierre détruit ; jamais sur une case d'apparition, ni sous 50 % de pièces libres |
| 120–150 | Combinaisons | Caisses sur gel, chaînes sur gel, cages sur gel… |

L'écart entre deux éléments est de 19 à 21 niveaux, conforme à la fourchette de 15 à 25.

**Écart au cahier des charges.** Les Bulles, Portails, Tapis roulants, Générateurs et Coffres à clé ne sont pas encore implémentés. Ils sont prévus entre les niveaux 130 et 230, ce qui demande une version 2 du contenu (régénération déterministe des niveaux 151 et suivants). Tant qu'ils manquent, aucun nouvel élément n'apparaît après le niveau 112 : la règle « un élément tous les 15 à 25 niveaux jusqu'au niveau 300 » n'est pas respectée.

## 6. Difficulté et générateur (livrable 4, implémenté)

Voir `packages/levels/README.md` pour le détail.

- **Niveaux 1–150 :** conçus à la main dans `packages/levels/src/handmade.ts` (grilles dessinées, objectifs et couleurs choisis niveau par niveau). Seul le nombre de coups est calibré par le bot. Les JSON sont dans `data/handmade/`.
- **Niveaux 151–10 000 :** `seed = hash(N, version, tentative)`. La forme, les couleurs, les objectifs et les obstacles sont dérivés de N et d'un fond de difficulté logarithmique plafonné à N = 2000.
- **Règle d'équité (FAIR-01) :** la grille de départ est identique pour tous. Seule la suite des pièces qui tombent varie d'un essai à l'autre, selon le numéro d'essai. Elle ne dépend jamais du profil ni des dépenses.
- **Calibrage :** 200 parties de bot par niveau. On retient le plus petit nombre de coups dont le taux de réussite atteint la cible (borne basse). Si le taux sort de ±10 points, l'échelle des objectifs est ajustée et le niveau régénéré. Un niveau sur dix est contrôlé sur 200 parties neuves.
- **Critère FAIR-02 et tension du cahier des charges :** voir le compte rendu du livrable 4 (aide gratuite après plusieurs échecs, à décider).

## 7. Économie (sans monnaie premium)

### 7.1 Vies
- 5 au maximum, +1 toutes les 30 min, soit au plus 48 vies régénérées par jour.
- **Seule une défaite coûte une vie.** Quitter un niveau avant le premier coup ne coûte rien.

### 7.2 Pièces (monnaie douce, jamais achetable)

| Source | Valeur indicative (à calibrer au livrable 5) |
|---|---|
| Victoire | 20 + 10 par étoile |
| Quête quotidienne | 100 |
| Série de connexion (jours 1 à 7) | 50 / 75 / 100 / 125 / 150 / 200 / 1 booster au choix |
| Roue quotidienne gratuite | probabilités affichées |
| Pub récompensée | 50 pièces ou 1 vie (récompense fixe, jamais aléatoire) |

**Dépenses en pièces :** boosters (300 à 900 pièces), « +5 coups » (900 pièces, prix fixe),
recharge de vies (600 pièces).

### 7.3 Boutique (euros TTC, prix lu dans le store, devise locale)

| Article | Prix indicatif | Contenu (affiché en entier avant l'achat) |
|---|---|---|
| Pack débutant | 0,99 € | 3 Marteaux, 2 Bombes, 1 Kit de départ, 1 h de vies illimitées. Achat unique, **disponible en permanence** tant qu'il n'est pas acheté, sans minuteur |
| +5 coups | 0,99 € ou 900 pièces | Prix **identique à chaque tentative** |
| Vies illimitées | 1 h 0,99 € / 3 h 1,99 € / 24 h 4,99 € | Durée en temps réel affichée |
| Pack boosters S / M / L / XL | 4,99 / 9,99 / 19,99 / 49,99 € | Quantités exactes par booster |
| Abonnement « Jardinier » | 4,99 €/mois | 1 booster au choix par jour et 30 min de vies illimitées par jour. Prix, durée, renouvellement et lien de résiliation affichés avant la souscription |
| Passe Premium / Premium+ | 4,99 € / 9,99 € | Voir §8 |

- **Réductions :** un « −X % » n'est autorisé que par rapport au prix unitaire réellement pratiqué
  pendant les 30 jours précédents (directive 98/6/CE art. 6 bis, issue de la directive Omnibus).
  Le validateur de config refuse toute autre référence.
- **Joueurs de moins de 18 ans :** l'écran d'échec ne propose que les options gratuites (pièces,
  pub récompensée, Abandonner). La boutique reste accessible depuis le menu uniquement.
  Plafond de 20 €/mois appliqué côté serveur avant le lancement du flux d'achat du store.

### 7.4 Écran d'échec (« +5 coups »)
- **Message neutre :** « Il reste : 4 gels, 12 feuilles. » Pas de minuteur, pas de « Presque ! », pas d'animation d'urgence.
- **Boutons :** « Continuer (+5 coups) — 0,99 € / 900 pièces » et « Abandonner », de même taille, même contraste et même poids typographique.
- **Série de victoires :**
  - une défaite fait reculer la série d'**un cran** au lieu de la remettre à zéro ;
  - l'écran d'échec n'affiche pas la série « en danger ».
  - Cela corrige le couplage entre aversion à la perte et achat.

### 7.5 Hasard
- Le hasard n'existe que dans des récompenses **gratuites** : roue quotidienne (1 tour par jour,
  aucun tour supplémentaire, ni payant ni contre une pub), coffres d'étoiles, coffres bonus
  après le palier 40.
- Les probabilités affichées proviennent de la **même config** que le tirage côté serveur.
- **Aucun tour de roue contre une pub.** Visionner une pub pourrait être qualifié de contrepartie
  (doctrine belge sur la « mise » non tranchée). Confiance moyenne ; décision prudente.

---

## 8. Passe de saison (20 jours)

**Correction du calibrage du cahier des charges.** Avec 150 XP par palier, un joueur actif finit en
environ 11 jours.

| Hypothèse | XP par jour |
|---|---|
| 10 victoires × (20 + 2,5 étoiles × 5 + 4 de bonus moyen Difficile/Très difficile) | 365 |
| 3 quêtes quotidiennes × 50 | 150 |
| Quête hebdomadaire 300 / 7 | 43 |
| **Joueur actif** | **≈ 558** |
| Joueur occasionnel (3 victoires, 1 quête, la quête hebdomadaire) | ≈ 203 |

**Retenu : 40 paliers × 250 XP = 10 000 XP.**

| Profil | Palier atteint ou durée |
|---|---|
| Joueur actif | palier 40 en ≈ 18 jours |
| Joueur occasionnel | palier ≈ 16 en 20 jours |
| Premium+ actif (départ au palier 10, +20 % d'XP) | palier 40 en ≈ 11 jours |

- **Piste gratuite :** 20 récompenses (une tous les 2 paliers).
- **Premium :** 40 récompenses, une décoration cosmétique et un cadre d'avatar.
- **Avant l'achat :**
  - liste complète des récompenses de chaque piste ;
  - dates exactes de début et de fin ;
  - jours restants ;
  - estimation fondée sur la **médiane de l'XP par jour du joueur sur 3 jours** (pas le maximum),
    arrondie vers le bas : « au rythme actuel, vous atteindrez environ le palier X ».
- **Achat tardif :** les récompenses des paliers déjà atteints sont débloquées.
  - Dans les 3 derniers jours, si l'estimation est inférieure à 40, l'écran l'écrit explicitement :
    « À votre rythme, vous n'atteindrez probablement pas le palier 40 avant la fin de la saison
    (palier estimé : X). »
  - L'achat n'est **pas proposé du tout** aux moins de 18 ans dans les 3 derniers jours.
- **Fin de saison :** tout ce qui a été gagné et non réclamé est crédité automatiquement.
- **Après le palier 40 :** un coffre gratuit tous les 300 XP, probabilités affichées.
- **Mini-événements (2 par saison, 3 jours chacun) :** une course contre 15 joueurs de niveau
  proche (classement, récompenses fixes par rang) et une collecte. Aucun achat lié.

---

## 9. Social et rétention

- **Équipes de 30 :** demandes de vies (1 par heure), coffre d'équipe alimenté par les étoiles.
- **Chat :**
  - **Moins de 16 ans :** désactivé par défaut, et seuls les messages prédéfinis sont possibles
    même après activation.
  - **16 ans et plus :** texte libre filtré.
  - Partout : bouton Signaler sur chaque message et chaque profil, blocage, modération humaine,
    décision motivée et recours.
- **Pseudonymes :** filtrés (grossièretés, données personnelles : formats d'e-mail, de téléphone, d'URL).
- **Notifications :**
  - opt-in, 2 par jour au maximum ;
  - aucune entre 22 h et 8 h (heure locale de l'appareil) ;
  - 4 catégories : vies pleines, équipe, saison, offres ;
  - catégorie « offres » **inexistante** pour les moins de 18 ans.
- **Bien-être :**
  - rappel de temps de jeu facultatif (30 min, 1 h ou 2 h) ;
  - récapitulatif des dépenses mensuelles dans Paramètres > Achats ;
  - alerte interne d'exploitation si une session dure plus de 3 h.

---

## 10. Architecture technique

```
helios-discovery/
  packages/core        moteur de grille TS pur (sans DOM), PRNG, état sérialisable, événements
  packages/levels      schémas, niveaux 1–150, générateur
  packages/bot         bots glouton et Monte-Carlo, CLI generate, rapport CSV
  packages/config      schémas de la config distante, validateurs (COM-01/03/11, RNG-01, ANA-02)
  apps/game            Phaser 3 (grille) + couche UI DOM accessible (Preact), Capacitor
  apps/server          Node + Fastify + PostgreSQL, hébergé dans l'UE (Scaleway Paris ou OVHcloud)
  apps/moderation      back-office de modération (signalements, décisions motivées, recours)
  compliance/          matrix.yaml (source de vérité), contrôle de couverture
  docs/                GDD, modèles juridiques (livrable 8)
```

**Tiers et moment de leur initialisation :**

| Tiers | Usage | Initialisé quand | Transfert hors UE |
|---|---|---|---|
| Google Play Billing / StoreKit 2 | achats | au premier achat | assuré par le store |
| Google UMP | CMP | premier lancement, **après** l'écran d'âge | Google (DPF + CCT) |
| Google AdMob | pub récompensée | après le choix de consentement | Google (DPF + CCT) |
| FCM / APNs | notifications | après l'opt-in aux notifications | Google, Apple |
| Analytics | **first-party** (serveur UE) | après consentement « mesure » | aucun |
| Crash reports | **first-party** (serveur UE) | dès le lancement, sans tiers (intérêt légitime, données minimales) | aucun |

L'analytics et les crash reports sont internalisés. Cela supprime deux sous-traitants et rend le
test réseau « zéro requête tierce avant consentement » facile à tenir.

**Vérification des reçus :** Google Play Developer API (`purchases.products/subscriptions`) et
App Store Server API, avec les notifications serveur pour les remboursements et renouvellements.
Le crédit n'est accordé qu'après vérification serveur.

**Conflit à arbitrer par l'avocat : suppression du compte et obligations comptables.** Les pièces
comptables se conservent 10 ans en France (C. com. L123-22). À la suppression, les transactions
sont donc conservées sous forme pseudonymisée et dissociée du profil : montant, date, SKU, pays,
identifiant de commande du store. Toutes les autres données sont effacées sous 30 jours. Les
sauvegardes ont une rotation de 30 jours au plus.

---

## 11. Risques ouverts

| # | Risque | Confiance | Ce qui ferait changer la décision |
|---|---|---|---|
| R1 | 60 fps en WebView sur Android bas de gamme | moyenne | Mesure sur appareil réel au livrable 2 ; repli WebGL basse qualité ou passage à Unity |
| R2 | Bot ≠ humain : un taux bot de 20 % peut donner un tout autre taux humain | élevée sur l'existence de l'écart | Recalibrage global par l'analytics (même ajustement pour tous les joueurs, donc équitable) |
| R3 | Annonces « limitées » AdMob après refus total : conformité ePrivacy | moyenne | Avis de l'avocat ; sinon aucune pub après refus |
| R4 | Lecture de « contenu atteignable gratuitement » face aux cosmétiques premium | moyenne | Avis de l'avocat ; sinon les cosmétiques premium deviennent gagnables gratuitement après la saison |
| R5 | Âge déclaratif contournable | élevée | Exigences futures du DFA ou de la Commission (vérification d'âge) |
| R6 | Statut DSA du chat d'équipe (hébergeur ou plateforme) | moyenne | Avis de l'avocat ; le dispositif complet est implémenté dans les deux cas |
