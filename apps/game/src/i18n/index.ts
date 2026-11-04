import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { it } from "./it";
import { nl } from "./nl";
import { fr, type MessageKey } from "./fr";

export type Locale = "fr" | "en" | "nl" | "de" | "es" | "it";
export const CATALOGS: Record<Locale, Record<MessageKey, string>> = { fr, en, nl, de, es, it };
/** Nom de chaque langue dans sa propre langue (sélecteur des paramètres). */
export const NATIVE_NAMES: Record<Locale, string> = { fr: "Français", en: "English", nl: "Nederlands", de: "Deutsch", es: "Español", it: "Italiano" };
/** Locale BCP 47 utilisée pour les dates. */
export const DATE_LOCALE: Record<Locale, string> = { fr: "fr-FR", en: "en-GB", nl: "nl-NL", de: "de-DE", es: "es-ES", it: "it-IT" };
export type { MessageKey };

let current: Locale = "fr";

export function detectLocale(langs: readonly string[]): Locale {
  for (const l of langs) {
    const base = l.toLowerCase().slice(0, 2);
    if (base in CATALOGS) return base as Locale;
  }
  return "en";
}

export function setLocale(l: Locale): void {
  current = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

export const getLocale = () => current;

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const s = CATALOGS[current][key] ?? fr[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
