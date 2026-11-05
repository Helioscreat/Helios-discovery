/**
 * Identité de l'éditeur : SOURCE UNIQUE des mentions légales, des CGU/CGV, de la politique de confidentialité,
 * du registre et de la fiche éditeur des stores (DSA art. 30-31).
 * Les valeurs ⟦…⟧ sont à compléter avant publication : `npm run check:release -w @helios/legal` échoue tant qu'il en reste.
 */
export const PLACEHOLDER = /⟦[^⟧]*⟧/g;
const todo = (what: string) => `⟦À COMPLÉTER : ${what}⟧`;

export interface Publisher {
  name: string;
  legalForm: string;
  capital: string;
  address: string;
  registry: string;
  siren: string;
  vat: string;
  director: string;
  email: string;
  phone: string;
  /** Site public où sont hébergés les documents. */
  website: string;
  contactLanguages: string[];
  /** Médiateur de la consommation (C. consom. L612-1) : obligatoire pour un professionnel français. */
  mediator: { name: string; url: string; address: string };
  host: { name: string; address: string; phone: string };
  /** Autorité de contrôle chef de file (établissement principal en France). */
  supervisor: { name: string; url: string };
  /** Autorité de surveillance du marché pour l'accessibilité des services (directive 2019/882, transposition française). */
  accessibilityAuthority: string;
  /** Taille : micro ou petite entreprise (exemptions DSA art. 19 et 29, EAA art. 4(5)). */
  size: "micro" | "small" | "medium";
}

export const PUBLISHER: Publisher = {
  name: "L'AFFRERE",
  legalForm: "SAS",
  capital: "1 000 €",
  address: "23B La Croix du Milieu, 16470 Saint-Michel, France",
  registry: "RCS Angoulême 990 851 503",
  siren: "990 851 503",
  /** Calculé depuis le SIREN (clé FR) ; à confirmer sur l'avis de situation ou auprès du SIE. */
  vat: "FR94990851503",
  /** Président de la SAS (Kbis du 05/09/2025). */
  director: "Jérémy FLEURANT",
  email: "fleurant.m@icloud.com",
  phone: todo("téléphone"),
  /** GitHub Pages du dépôt (publié par .github/workflows/pages.yml) ; à remplacer par le domaine de l'éditeur s'il en a un. */
  website: "https://helioscreat.github.io/Helios-discovery",
  /** Langues acceptées par le point de contact (DSA art. 12), identiques à celles du serveur. */
  contactLanguages: ["fr", "en", "nl", "de", "es", "it"],
  mediator: { name: todo("médiateur de la consommation"), url: todo("site du médiateur"), address: todo("adresse du médiateur") },
  host: { name: "Scaleway SAS", address: "8 rue de la Ville l'Évêque, 75008 Paris, France", phone: todo("téléphone de l'hébergeur (à vérifier)") },
  supervisor: { name: "Commission nationale de l'informatique et des libertés (CNIL)", url: "https://www.cnil.fr/fr/plaintes" },
  accessibilityAuthority: todo("autorité compétente en France pour l'accessibilité des services (à vérifier dans la loi de transposition)"),
  size: "micro",
};

/** Date de version des documents (affichée en tête de chaque document). */
export const LEGAL_VERSION = { date: "2026-11-04", label: "2026-11-v1" };

export const placeholdersIn = (s: string): string[] => s.match(PLACEHOLDER) ?? [];
