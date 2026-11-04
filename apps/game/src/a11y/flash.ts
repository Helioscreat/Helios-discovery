/**
 * Limiteur de flashs (WCAG 2.3.1) : au plus `max` flashs par fenêtre glissante de `windowMs`.
 * Le rendu demande l'autorisation avant tout effet de luminance plein écran ou de zone ;
 * en cas de refus, il joue une variante sans variation de luminosité.
 */
export class FlashLimiter {
  private stamps: number[] = [];

  constructor(readonly max = 3, readonly windowMs = 1000) {}

  allow(now: number): boolean {
    while (this.stamps.length > 0 && now - this.stamps[0] >= this.windowMs) this.stamps.shift();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }

  /** Nombre maximal de flashs observés dans une fenêtre quelconque d'une série d'horodatages. */
  static peakRate(stamps: number[], windowMs = 1000): number {
    const s = [...stamps].sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; i < s.length; i++) {
      while (s[i] - s[j] >= windowMs) j++;
      best = Math.max(best, i - j + 1);
    }
    return best;
  }
}
