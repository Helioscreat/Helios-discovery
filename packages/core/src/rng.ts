/**
 * PRNG déterministe sfc32 (Small Fast Counter, 128 bits d'état).
 * L'état est un tuple de 4 entiers non signés 32 bits : sérialisable tel quel en JSON.
 * Toutes les fonctions qui tirent MUTENT l'état passé en argument.
 */
export type RngState = [number, number, number, number];

/** Dérive un état initial d'une chaîne (cyrb128), puis chauffe le générateur. */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const s: RngState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  for (let i = 0; i < 15; i++) nextU32(s);
  return s;
}

export function nextU32(s: RngState): number {
  let a = s[0], b = s[1], c = s[2], d = s[3];
  const t0 = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  const t = (t0 + d) | 0;
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

/** Entier uniforme dans [0, n). Biais < 2^-32 · n, négligeable pour n ≤ 100. */
export function nextInt(s: RngState, n: number): number {
  return Math.floor((nextU32(s) / 4294967296) * n);
}

export function pick<T>(s: RngState, items: readonly T[]): T {
  return items[nextInt(s, items.length)];
}

/** Mélange de Fisher-Yates, en place. */
export function shuffleInPlace<T>(s: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
