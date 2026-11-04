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
  /** Formulaire de contact en ligne (point de contact DSA, demandes RGPD). */
  contactForm: string;
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
  name: todo("raison sociale"),
  legalForm: "SASU",
  capital: todo("capital social"),
  address: todo("adresse du siège"),
  registry: todo("RCS (ville et numéro)"),
  siren: todo("SIREN"),
  vat: todo("numéro de TVA intracommunautaire"),
  director: todo("directeur ou directrice de la publication (le président de la SASU)"),
  email: "contact@helios-discovery.example",
  phone: todo("téléphone"),
  contactForm: "https://helios-discovery.example/contact",
  website: "https://helios-discovery.example",
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
