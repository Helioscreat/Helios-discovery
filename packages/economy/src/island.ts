/**
 * Méta-progression : l'archipel d'Aérine. Les étoiles gagnées dans les niveaux servent à restaurer les zones.
 * Une zone = 12 tâches + une mini-histoire en 4 scènes (débloquées aux tâches 3, 6, 9 et 12).
 * Chaque tâche propose 3 variantes de décoration gratuites ; une 4e variante purement cosmétique est
 * réservée au passe Premium (étiquetée, sans effet sur la progression : COM-08, résolution du livrable 1).
 */
export interface Task {
  id: string;
  /** Coût en étoiles. */
  stars: number;
  variants: [string, string, string];
  premiumVariant?: string;
}

export interface Zone {
  id: string;
  nameKey: string;
  tasks: Task[];
  scenes: [string, string, string, string];
}

const task = (zone: string, k: number, stars: number, premium = false): Task => ({
  id: `${zone}.t${k}`,
  stars,
  variants: [`${zone}.t${k}.v1`, `${zone}.t${k}.v2`, `${zone}.t${k}.v3`],
  ...(premium ? { premiumVariant: `${zone}.t${k}.premium` } : {}),
});

function zone(id: string, base: number): Zone {
  return {
    id,
    nameKey: `zone.${id}`,
    tasks: Array.from({ length: 12 }, (_, k) => task(id, k + 1, base + Math.floor(k / 3) * Math.round(base / 3), k % 4 === 3)),
    scenes: [`${id}.s1`, `${id}.s2`, `${id}.s3`, `${id}.s4`],
  };
}

/** Coûts calibrés pour qu'un joueur gratuit (≈ 2,3 étoiles par victoire) termine une zone en 25 à 60 niveaux. */
export const ZONES: Zone[] = [
  zone("quay", 4),
  zone("orchard", 6),
  zone("greenhouse", 8),
  zone("mill", 10),
  zone("cascade", 12),
  zone("observatory", 14),
];

export const zoneCost = (z: Zone) => z.tasks.reduce((a, t) => a + t.stars, 0);

export interface IslandState {
  /** Étoiles disponibles (gagnées − dépensées). */
  stars: number;
  /** Tâches réalisées → variante choisie. */
  done: Record<string, string>;
}

export const newIsland = (): IslandState => ({ stars: 0, done: {} });

/** Zone courante : la première dont toutes les tâches ne sont pas faites. */
export function currentZone(s: IslandState): Zone | null {
  return ZONES.find((z) => z.tasks.some((t) => !(t.id in s.done))) ?? null;
}

/** Prochaine tâche de la zone courante (les tâches se font dans l'ordre). */
export function nextTask(s: IslandState): Task | null {
  const z = currentZone(s);
  return z ? z.tasks.find((t) => !(t.id in s.done)) ?? null : null;
}

/**
 * Réalise une tâche avec la variante choisie. Variante premium : seulement avec le passe actif ;
 * elle remplace une décoration, jamais une étape de progression.
 */
export function doTask(s: IslandState, taskId: string, variant: string, hasPremium: boolean): IslandState | null {
  const t = nextTask(s);
  if (!t || t.id !== taskId || s.stars < t.stars) return null;
  const free = t.variants.includes(variant);
  const premium = variant === t.premiumVariant && hasPremium;
  if (!free && !premium) return null;
  return { stars: s.stars - t.stars, done: { ...s.done, [t.id]: variant } };
}

/** Change la décoration d'une tâche déjà faite (gratuit) : une variante gratuite, ou premium avec le passe. */
export function changeVariant(s: IslandState, taskId: string, variant: string, hasPremium: boolean): IslandState | null {
  const t = ZONES.flatMap((z) => z.tasks).find((x) => x.id === taskId);
  if (!t || !(taskId in s.done)) return null;
  if (!t.variants.includes(variant) && !(variant === t.premiumVariant && hasPremium)) return null;
  return { ...s, done: { ...s.done, [taskId]: variant } };
}

/** Scènes d'histoire débloquées dans une zone (une toutes les 3 tâches). */
export function unlockedScenes(s: IslandState, z: Zone): string[] {
  const n = z.tasks.filter((t) => t.id in s.done).length;
  return z.scenes.slice(0, Math.floor(n / 3));
}
