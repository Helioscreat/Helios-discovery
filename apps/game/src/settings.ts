import { DEFAULT_PREFS, type NotificationPrefs } from "@helios/config";
import type { Locale } from "./i18n";

export interface Settings {
  sound: boolean;
  vibration: boolean;
  captions: boolean;
  colorblind: boolean;
  reducedMotion: boolean;
  hints: boolean;
  textScale: 100 | 125 | 150;
  locale: Locale | null;
  /** Notifications : opt-in, désactivées par défaut, par catégorie. */
  notifications: NotificationPrefs;
}

export const TEXT_SCALES = [100, 125, 150] as const;

export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    sound: true,
    vibration: true,
    captions: false,
    colorblind: false,
    reducedMotion: prefersReducedMotion,
    hints: true,
    textScale: 100,
    locale: null,
    notifications: DEFAULT_PREFS,
  };
}

const KEY = "helios.settings.v1";

/** Préférences locales à l'appareil. Le stockage peut être indisponible (navigation privée) : on retombe sur les défauts. */
export function loadSettings(): Settings {
  const prefersReduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = defaultSettings(prefersReduced);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...base, ...parsed };
    if (!TEXT_SCALES.includes(merged.textScale)) merged.textScale = 100;
    return merged;
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : réglage conservé pour la session seulement */
  }
}

type Listener = (s: Settings) => void;

export class SettingsStore {
  private listeners = new Set<Listener>();
  constructor(public value: Settings) {}

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    saveSettings(this.value);
    for (const l of this.listeners) l(this.value);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
