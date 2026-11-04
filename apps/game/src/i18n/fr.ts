/**
 * Catalogue de référence (français). Règles éditoriales, vérifiées par les tests :
 *  - aucune incitation directe à acheter ni à « demander aux parents » (AGE-10) ;
 *  - les clés `decline.*` sont les libellés de refus : liste blanche neutre (COM-06) ;
 *  - aucune urgence ni rareté (« vite », « plus que », « dernière chance »).
 */
export const fr = {
  "app.title": "Helios Discovery",
  "app.loading": "Chargement…",

  "home.title": "Archipel d'Aérine",
  "home.subtitle": "Rends ses rayons au soleil Helios en restaurant les jardins.",
  "home.play": "Jouer le niveau {n}",
  "home.levels": "Niveaux",
  "home.level": "Niveau {n}",
  "home.locked": "Niveau {n}, verrouillé",
  "home.settings": "Paramètres",

  "level.start.title": "Niveau {n}",
  "level.start.goals": "Objectifs",
  "level.start.moves": "{n} coups",
  "level.start.kit": "Utiliser un Kit de départ ({count} en réserve)",
  "level.start.kit.locked": "Kit de départ : débloqué au niveau {n}",
  "level.start.play": "Jouer",
  "level.badge.hard": "Difficile",
  "level.badge.veryHard": "Très difficile",

  "hud.moves": "Coups",
  "hud.score": "Score",
  "hud.goals": "Objectifs",
  "goal.collect": "{name} : {done} sur {count}",
  "goal.score": "Score : {done} sur {count}",

  "piece.0": "Baie",
  "piece.1": "Pétale",
  "piece.2": "Feuille",
  "piece.3": "Goutte",
  "piece.4": "Prune",
  "piece.5": "Nuage",
  "special.rocketH": "Fusée horizontale",
  "special.rocketV": "Fusée verticale",
  "special.bomb": "Bombe",
  "special.dragonfly": "Libellule",
  "special.prism": "Prisme",

  "booster.hammer": "Marteau",
  "booster.hammer.desc": "Efface une case au choix.",
  "booster.bomb": "Bombe",
  "booster.bomb.desc": "Efface un carré de 3 × 3 cases au choix.",
  "booster.rainbow": "Arc-en-ciel",
  "booster.rainbow.desc": "Efface toutes les pièces de la couleur choisie.",
  "booster.fireCross": "Croix de feu",
  "booster.fireCross.desc": "Efface la ligne et la colonne de la case choisie.",
  "booster.shuffler": "Mélangeur",
  "booster.shuffler.desc": "Mélange la grille sans utiliser de coup.",
  "booster.starterKit": "Kit de départ",
  "booster.starterKit.desc": "Place une Fusée, une Bombe et un Prisme avant le début du niveau.",
  "booster.count": "{name}, {count} en réserve",
  "booster.locked": "{name}, débloqué au niveau {n}",
  "booster.empty": "{name}, aucun en réserve. Gagne-en avec les quêtes et les coffres d'étoiles.",
  "booster.target": "Choisis une case pour : {name}",

  "tutorial.booster.title": "Nouveau booster : {name}",
  "tutorial.booster.body": "{desc} Pépin t'en offre 3 pour commencer. Tu en gagneras d'autres en jouant.",
  "tutorial.ok": "Compris",

  "end.win.title": "Niveau réussi !",
  "end.win.stars": "{n} étoiles sur 3",
  "end.win.score": "Score : {n}",
  "end.continue": "Continuer",
  "end.fail.title": "Niveau non terminé",
  "end.fail.remaining": "Objectifs restants :",
  "end.fail.retry": "Réessayer",

  "quit.title": "Quitter le niveau ?",
  "quit.body": "Ta progression sur ce niveau sera perdue. Quitter maintenant ne coûte pas de vie si tu n'as joué aucun coup.",
  "quit.confirm": "Quitter",

  "decline.back": "Retour",
  "decline.cancel": "Annuler",
  "decline.close": "Fermer",
  "decline.giveUp": "Abandonner",

  "menu.pause": "Menu",

  "settings.title": "Paramètres",
  "settings.section.audio": "Son et vibrations",
  "settings.section.display": "Affichage",
  "settings.section.help": "Aide au jeu",
  "settings.sound": "Effets sonores",
  "settings.vibration": "Vibrations",
  "settings.captions": "Sous-titres des sons",
  "settings.colorblind": "Mode daltonien (contours renforcés)",
  "settings.reducedMotion": "Réduire les animations",
  "settings.hints": "Indice après 5 secondes",
  "settings.textScale": "Taille du texte",
  "settings.textScale.option": "{n} %",
  "settings.language": "Langue",

  "caption.match": "Alignement",
  "caption.cascade": "Cascade × {n}",
  "caption.rocket": "Fusée",
  "caption.bomb": "Explosion",
  "caption.dragonfly": "Libellule en vol",
  "caption.prism": "Prisme",
  "caption.combo": "Combo",
  "caption.shuffle": "Mélange de la grille",
  "caption.invalid": "Échange impossible",
  "caption.win": "Victoire",
  "caption.fail": "Plus de coups",

  "a11y.board": "Grille de jeu, {w} colonnes et {h} lignes. Flèches pour déplacer le curseur, Entrée pour choisir une pièce puis une voisine.",
  "a11y.cursor": "Ligne {y}, colonne {x} : {piece}",
  "a11y.selected": "Pièce sélectionnée",
  "a11y.movesLeft": "{n} coups restants",
} as const;

export type MessageKey = keyof typeof fr;
