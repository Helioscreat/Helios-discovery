import { en } from "./en";
import { fr, type MessageKey } from "./fr";

export type Locale = "fr" | "en";
export const CATALOGS: Record<Locale, Record<MessageKey, string>> = { fr, en };
export type { MessageKey };

let current: Locale = "fr";

export function detectLocale(langs: readonly string[]): Locale {
  for (const l of langs) {
    const base = l.toLowerCase().slice(0, 2);
    if (base === "fr" || base === "en") return base;
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
