/**
 * Registre des écrans et modales. Les tests de conformité s'appuient dessus :
 *  - toute modale `choice` doit utiliser DualChoice (COM-04) ;
 *  - aucun écran `purchase` ne peut faire apparaître le personnage-guide (AGE-10).
 * Ajouter un écran = l'ajouter ici, sinon le test d'interface échoue.
 */
export interface ScreenInfo {
  name: string;
  kind: "choice" | "info" | "screen";
  purchase: boolean;
  usesCharacter: boolean;
}

export const SCREENS: ScreenInfo[] = [
  { name: "home", kind: "screen", purchase: false, usesCharacter: false },
  { name: "game", kind: "screen", purchase: false, usesCharacter: false },
  { name: "level-start", kind: "choice", purchase: false, usesCharacter: false },
  { name: "quit", kind: "choice", purchase: false, usesCharacter: false },
  { name: "end-fail", kind: "choice", purchase: false, usesCharacter: false },
  { name: "end-win", kind: "info", purchase: false, usesCharacter: false },
  { name: "booster-tutorial", kind: "info", purchase: false, usesCharacter: true },
  { name: "settings", kind: "info", purchase: false, usesCharacter: false },
  { name: "shop", kind: "screen", purchase: true, usesCharacter: false },
  { name: "pass", kind: "screen", purchase: true, usesCharacter: false },
  { name: "rewards", kind: "screen", purchase: false, usesCharacter: false },
  { name: "island", kind: "screen", purchase: false, usesCharacter: false },
  { name: "purchase-sheet", kind: "choice", purchase: true, usesCharacter: false },
  { name: "subscription-sheet", kind: "choice", purchase: true, usesCharacter: false },
  { name: "pass-sheet", kind: "choice", purchase: true, usesCharacter: false },
  { name: "lives", kind: "choice", purchase: false, usesCharacter: false },
  { name: "toast", kind: "info", purchase: false, usesCharacter: false },
  { name: "age-gate", kind: "screen", purchase: false, usesCharacter: false },
  { name: "consent", kind: "choice", purchase: false, usesCharacter: false },
  { name: "contact", kind: "screen", purchase: false, usesCharacter: false },
  { name: "team", kind: "screen", purchase: false, usesCharacter: false },
  { name: "report", kind: "choice", purchase: false, usesCharacter: false },
  { name: "delete-account", kind: "choice", purchase: false, usesCharacter: false },
  { name: "parental", kind: "info", purchase: false, usesCharacter: false },
  { name: "profile", kind: "info", purchase: false, usesCharacter: false },
];
