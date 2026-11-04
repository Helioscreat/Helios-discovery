import type { NotificationParams } from "./remote";

/**
 * Notifications (cahier des charges §7) : opt-in, au plus 2 par jour, aucune entre 22 h et 8 h (heure locale),
 * désactivables par catégorie, aucune notification commerciale pour un joueur protégé (AGE-11).
 */
export type NotificationCategory = "lives" | "team" | "season" | "offers";
export const CATEGORIES: NotificationCategory[] = ["lives", "team", "season", "offers"];

export interface NotificationPrefs {
  /** Accord donné dans le jeu, après explication (avant toute demande de permission système). */
  optIn: boolean;
  categories: Record<NotificationCategory, boolean>;
}

export const DEFAULT_PREFS: NotificationPrefs = { optIn: false, categories: { lives: false, team: false, season: false, offers: false } };

/** Catégories proposées : la catégorie « offres » n'existe pas pour un joueur protégé. */
export function categoriesFor(protectedPlayer: boolean): NotificationCategory[] {
  return protectedPlayer ? CATEGORIES.filter((c) => c !== "offers") : CATEGORIES;
}

export interface NotificationRequest {
  category: NotificationCategory;
  /** Instant souhaité (ms UTC). */
  at: number;
  key: string;
}

/** Heure locale (0–23) d'un instant, avec le décalage du fuseau en minutes. */
const localHour = (t: number, tzOffsetMin: number) => new Date(t + tzOffsetMin * 60_000).getUTCHours();
const localDay = (t: number, tzOffsetMin: number) => Math.floor((t + tzOffsetMin * 60_000) / 86_400_000);

/** Reporte un instant tombant dans la plage de silence à la fin de celle-ci (8 h locales). */
export function outOfQuietHours(t: number, tzOffsetMin: number, p: NotificationParams): number {
  const h = localHour(t, tzOffsetMin);
  const quiet = p.quietStartHour > p.quietEndHour ? h >= p.quietStartHour || h < p.quietEndHour : h >= p.quietStartHour && h < p.quietEndHour;
  if (!quiet) return t;
  const local = t + tzOffsetMin * 60_000;
  const dayStart = Math.floor(local / 86_400_000) * 86_400_000;
  let end = dayStart + p.quietEndHour * 3_600_000;
  if (h >= p.quietStartHour) end += 86_400_000;
  return end - tzOffsetMin * 60_000;
}

/**
 * Planifie des notifications : rien sans opt-in ; catégorie désactivée ou interdite → rien ;
 * plage de silence → report à 8 h ; quota journalier (heure locale) → au-delà, abandon.
 */
export function plan(reqs: NotificationRequest[], prefs: NotificationPrefs, protectedPlayer: boolean, tzOffsetMin: number, p: NotificationParams): NotificationRequest[] {
  if (!prefs.optIn) return [];
  const allowed = new Set(categoriesFor(protectedPlayer).filter((c) => prefs.categories[c]));
  const perDay = new Map<number, number>();
  const out: NotificationRequest[] = [];
  for (const r of [...reqs].sort((a, b) => a.at - b.at)) {
    if (!allowed.has(r.category)) continue;
    const at = outOfQuietHours(r.at, tzOffsetMin, p);
    const d = localDay(at, tzOffsetMin);
    const n = perDay.get(d) ?? 0;
    if (n >= p.maxPerDay) continue;
    perDay.set(d, n + 1);
    out.push({ ...r, at });
  }
  return out;
}
