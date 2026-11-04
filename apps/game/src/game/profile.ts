import { ALL_BOOSTERS, BOOSTER_UNLOCK_LEVEL, FREE_ON_UNLOCK, type Booster } from "@helios/core";

/**
 * Profil local PROVISOIRE (livrable 3). Au livrable 5, l'inventaire et la progression
 * passent côté serveur (source de vérité, reçus vérifiés) ; ce module deviendra un cache.
 */
export interface Profile {
  levelReached: number;
  inventory: Record<Booster, number>;
  /** Boosters dont les 3 exemplaires offerts et le tutoriel ont déjà été donnés. */
  granted: Booster[];
  stars: Record<number, number>;
  /** Nombre d'essais par niveau (sert uniquement à varier la suite des pièces qui tombent). */
  attempts: Record<number, number>;
}

export function newProfile(): Profile {
  return {
    levelReached: 1,
    inventory: Object.fromEntries(ALL_BOOSTERS.map((b) => [b, 0])) as Record<Booster, number>,
    granted: [],
    stars: {},
    attempts: {},
  };
}

/**
 * Accorde les exemplaires gratuits des boosters débloqués au niveau `level` ou avant,
 * une seule fois par booster. Renvoie ceux qui viennent d'être accordés (tutoriel à montrer).
 */
export function grantUnlocks(p: Profile, level: number): Booster[] {
  const fresh = ALL_BOOSTERS.filter((b) => level >= BOOSTER_UNLOCK_LEVEL[b] && !p.granted.includes(b));
  for (const b of fresh) {
    p.inventory[b] += FREE_ON_UNLOCK;
    p.granted.push(b);
  }
  return fresh;
}

export function consume(p: Profile, b: Booster): boolean {
  if (p.inventory[b] <= 0) return false;
  p.inventory[b]--;
  return true;
}

const KEY = "helios.profile.v1";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...newProfile(), ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    /* stockage indisponible */
  }
  return newProfile();
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible */
  }
}
