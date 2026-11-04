import { nextU32, seedRng } from "@helios/core";

/**
 * Simulation de progression d'un joueur gratuit (critère FAIR-02).
 *
 * Hypothèses, explicites et réglables :
 *  - le joueur gagne au plus `winsPerDay` niveaux par jour (« 10 niveaux par jour ») ;
 *  - seules les défaites coûtent une vie ; il dispose chaque jour de `livesPerDay` défaites
 *    (5 vies au réveil + recharge de 30 min pendant ses sessions : 20 par défaut, prudent) ;
 *  - la probabilité de réussir un essai est le taux mesuré par le bot (`rates[n]`), sans booster ;
 *  - option : `boosterBoost` ajoute ce gain de probabilité aux essais où le joueur utilise un booster
 *    gagné gratuitement (`freeBoostersPerDay` par jour), pour mesurer la marge apportée par le jeu gratuit.
 * « Bloqué plus de 2 jours » = le niveau n'est toujours pas réussi au 3e jour suivant le premier essai.
 */
export interface SimOptions {
  players: number;
  winsPerDay: number;
  livesPerDay: number;
  freeBoostersPerDay: number;
  boosterBoost: number;
  /**
   * Aide gratuite proposée à tous après `pityAfterFails` échecs consécutifs sur un même niveau (0 = aucune) :
   * un booster offert, qui ajoute `pityBoost` à la probabilité de l'essai suivant. Le niveau ne change pas
   * (FAIR-01) et l'aide ne dépend jamais des dépenses : seulement du nombre d'échecs, pour tout le monde.
   */
  pityAfterFails: number;
  pityBoost: number;
  seed: string;
}

export const DEFAULT_SIM: SimOptions = {
  players: 1000, winsPerDay: 10, livesPerDay: 20, freeBoostersPerDay: 0, boosterBoost: 0, pityAfterFails: 0, pityBoost: 0, seed: "fair-02",
};

export interface SimResult {
  players: number;
  levels: number;
  /** Joueurs bloqués plus de 2 jours au moins une fois. */
  playersBlocked: number;
  /** Plus longue durée (jours) passée sur un niveau, tous joueurs confondus. */
  maxDaysOnLevel: number;
  /** Niveaux ayant bloqué au moins un joueur plus de 2 jours, avec le nombre de joueurs concernés. */
  blockingLevels: [number, number][];
  /** Jours médians pour finir tous les niveaux simulés. */
  medianDays: number;
}

export function simulateFreePlayers(rates: Map<number, number>, opts: SimOptions = DEFAULT_SIM): SimResult {
  const levels = [...rates.keys()].sort((a, b) => a - b);
  const rng = seedRng(opts.seed);
  const u = () => nextU32(rng) / 4294967296;
  let playersBlocked = 0, maxDays = 0;
  const blocking = new Map<number, number>();
  const finishDays: number[] = [];
  for (let p = 0; p < opts.players; p++) {
    let day = 0, wins = 0, fails = 0, boosters = 0, blocked = false;
    for (const n of levels) {
      const firstDay = day;
      const rate = rates.get(n)!;
      let failsHere = 0;
      for (;;) {
        if (wins >= opts.winsPerDay || fails >= opts.livesPerDay) {
          day++;
          wins = 0;
          fails = 0;
          boosters += opts.freeBoostersPerDay;
        }
        let pr = rate;
        // Le joueur garde ses boosters gratuits pour les niveaux où il a déjà échoué 3 fois.
        if (boosters > 0 && opts.boosterBoost > 0 && failsHere >= 3) {
          boosters--;
          pr = Math.min(1, rate + opts.boosterBoost);
        }
        if (opts.pityAfterFails > 0 && failsHere > 0 && failsHere % opts.pityAfterFails === 0) pr = Math.min(1, pr + opts.pityBoost);
        if (u() < pr) { wins++; break; }
        fails++;
        failsHere++;
      }
      const spent = day - firstDay;
      maxDays = Math.max(maxDays, spent);
      if (spent > 2) {
        blocked = true;
        blocking.set(n, (blocking.get(n) ?? 0) + 1);
      }
    }
    if (blocked) playersBlocked++;
    finishDays.push(day);
  }
  finishDays.sort((a, b) => a - b);
  return {
    players: opts.players,
    levels: levels.length,
    playersBlocked,
    maxDaysOnLevel: maxDays,
    blockingLevels: [...blocking.entries()].sort((a, b) => b[1] - a[1]),
    medianDays: finishDays[Math.floor(finishDays.length / 2)],
  };
}

/** Lit les taux du bot d'un rapport CSV (colonnes N et taux_bot). */
export function ratesFromCsv(csv: string): Map<number, number> {
  const [head, ...rows] = csv.trim().split("\n");
  const cols = head.split(",");
  const iN = cols.indexOf("N"), iR = cols.indexOf("taux_bot");
  const out = new Map<number, number>();
  for (const r of rows) {
    const c = r.split(",");
    out.set(Number(c[iN]), Number(c[iR]));
  }
  return out;
}
