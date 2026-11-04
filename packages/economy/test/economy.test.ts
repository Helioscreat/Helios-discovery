import { describe, expect, it } from "vitest";
import {
  adsLeft, applyVerified, buyPass, CATALOG, canPlay, canSpin, chestProbabilities, claim, claimable, closeSeason, continueOffer,
  credit, currentZone, DAY, daysLeft, discountPercent, doTask, estimateTier, featuredOffers, LIFE_REGEN_MS, login, MAX_LIVES,
  MockStore, MockVerifier, monthlySpendCents, newFreeRewards, newIsland, newSeasonState, newWallet, nextLifeIn, openPostChest,
  passOffer, postChestsAvailable, purchaseGate, recordResult, rewardAd, rewardTable, selectOffers, servedCatalog, skuById,
  spendRecap, spinWheel, tickLives, TIERS, unlockedRewards, validateCatalog, validateSeason, WHEEL, wheelProbabilities, XP_PER_TIER,
  ZONES, zoneCost, type Account, type Sku,
} from "../src";

const T0 = Date.UTC(2026, 10, 4, 10, 0, 0);
const ctx = { now: T0, priceHistory: [], limitedHistory: [] };

describe("catalogue et validateurs de configuration", () => {
  it("le catalogue livré est valide", () => {
    expect(validateCatalog(CATALOG, ctx)).toEqual([]);
  });

  it("[T-COM-01] un minuteur exige une date de fin réelle ; à la fin, l'article n'est plus servi", () => {
    const bad: Sku = { ...skuById("boosters_s"), id: "x", showTimer: true };
    expect(validateCatalog([bad], ctx).join()).toMatch(/minuteur/);
    const ok: Sku = { ...bad, endAt: T0 + DAY };
    expect(validateCatalog([ok], ctx)).toEqual([]);
    expect(servedCatalog([ok], { now: T0 + DAY + 1 })).toEqual([]);
  });

  it("[T-COM-02] aucun champ de stock ou de rareté", () => {
    const bad = { ...skuById("boosters_s"), id: "y", remaining: 3 } as unknown as Sku;
    expect(validateCatalog([bad], ctx).join()).toMatch(/interdit/);
  });

  it("[T-COM-03] « limitée » au plus une fois par article sur 12 mois", () => {
    const s: Sku = { ...skuById("boosters_m"), labelLimited: true, endAt: T0 + 3 * DAY };
    expect(validateCatalog([s], { ...ctx, limitedHistory: [{ skuId: "boosters_m", at: T0 - 200 * DAY }] }).join()).toMatch(/12 derniers mois/);
    expect(validateCatalog([s], { ...ctx, limitedHistory: [{ skuId: "boosters_m", at: T0 - 400 * DAY }] })).toEqual([]);
  });

  it("[T-COM-11] une réduction se calcule sur le prix le plus bas réellement pratiqué pendant 30 jours", () => {
    const s: Sku = { ...skuById("boosters_l"), referenceEurCents: 1499, discountFromCents: 1999 };
    expect(validateCatalog([s], ctx).join()).toMatch(/30 derniers jours/);
    const hist = [{ skuId: "boosters_l", eurCents: 1999, from: T0 - 60 * DAY, to: T0 - 1 }];
    expect(validateCatalog([s], { ...ctx, priceHistory: hist })).toEqual([]);
    expect(discountPercent(s)).toBe(25);
    const hist2 = [...hist, { skuId: "boosters_l", eurCents: 1699, from: T0 - 10 * DAY, to: T0 - 5 * DAY }];
    expect(validateCatalog([s], { ...ctx, priceHistory: hist2 }).join()).toMatch(/prix le plus bas/);
  });

  it("[T-RNG-01] aucun contenu aléatoire dans un article payant", () => {
    const bad = { ...skuById("boosters_s"), id: "box", random: [{ weight: 1 }] } as Sku;
    expect(validateCatalog([bad], ctx).join()).toMatch(/hasard payant/);
    for (const s of CATALOG) expect(JSON.stringify(s)).not.toMatch(/random|weight|probab/i);
  });

  it("[T-DIG-02] fermeture : préavis de 90 jours au moins ; dès l'annonce, plus rien n'est vendu", () => {
    expect(validateCatalog(CATALOG, { ...ctx, sunset: { announcedAt: T0 + DAY, closesAt: T0 + 60 * DAY } }).join()).toMatch(/90 jours/);
    expect(servedCatalog(CATALOG, { now: T0 + 2 * DAY, sunset: { announcedAt: T0 + DAY, closesAt: T0 + 120 * DAY } })).toEqual([]);
  });
});

describe("vies", () => {
  it("[T-ECO-01] seule une défaite coûte une vie ; 5 au maximum ; +1 toutes les 30 min", () => {
    let w = newWallet(T0);
    w = recordResult(w, T0, "won");
    expect(w.lives).toBe(5);
    w = recordResult(w, T0, "quitBeforeFirstMove");
    expect(w.lives).toBe(5);
    w = recordResult(w, T0, "lost");
    expect(w.lives).toBe(4);
    w = recordResult(w, T0, "quitAfterMoves");
    expect(w.lives).toBe(3);
    expect(tickLives(w, T0 + LIFE_REGEN_MS - 1).lives).toBe(3);
    expect(tickLives(w, T0 + LIFE_REGEN_MS).lives).toBe(4);
    expect(tickLives(w, T0 + 10 * LIFE_REGEN_MS).lives).toBe(MAX_LIVES);
    expect(nextLifeIn(w, T0 + 10 * 60_000)).toBe(LIFE_REGEN_MS - 10 * 60_000);
  });

  it("vies illimitées : aucune vie consommée pendant la durée achetée", () => {
    let w = credit(newWallet(T0), { unlimitedLivesMin: 60 }, T0);
    for (let k = 0; k < 6; k++) w = recordResult(w, T0 + k * 60_000, "lost");
    expect(w.lives).toBe(5);
    expect(canPlay({ ...w, lives: 0 }, T0 + 30 * 60_000)).toBe(true);
  });
});

describe("+5 coups", () => {
  it("[T-COM-13] prix fixe, identique à chaque tentative et pour tous ; jamais proposé en payant à un joueur protégé", () => {
    const a = continueOffer("adult", 5000), b = continueOffer("adult", 5000);
    expect(a).toEqual(b);
    expect(a.skuId).toBe("extra_moves");
    expect(skuById("extra_moves").referenceEurCents).toBe(99);
    expect(continueOffer("minor", 5000).skuId).toBeNull();
    expect(continueOffer("unknown", 5000).skuId).toBeNull();
    expect(continueOffer("adult", 100).coins).toBeNull();
    expect(continueOffer.length).toBe(2); // ni tentative, ni échecs, ni dépense en paramètre
  });
});

describe("offres", () => {
  it("[T-COM-07] le moteur d'offres ne dépend que du pays, de la progression et du catalogue", () => {
    expect(selectOffers.length).toBe(1);
    const base = { country: "FR", levelReached: 30, catalog: CATALOG, ownedOnce: [] as string[] };
    const ref = JSON.stringify(selectOffers(base));
    for (let k = 0; k < 200; k++) {
      // Profil hostile : échecs, dépense, durée de session ajoutés à l'entrée → ignorés.
      const noisy = { ...base, fails: k, spent: k * 1000, sessionMin: k * 7 } as typeof base;
      expect(JSON.stringify(selectOffers(noisy))).toBe(ref);
    }
  });

  it("aucune offre mise en avant pour un joueur protégé", () => {
    expect(featuredOffers({ country: "FR", levelReached: 30, catalog: CATALOG, ownedOnce: [] }, true)).toEqual([]);
  });
});

describe("reçus et grand livre", () => {
  const prices = Object.fromEntries(CATALOG.map((s) => [s.id, s.referenceEurCents]));
  const acc0 = (): Account => ({ wallet: newWallet(T0), ledger: [] });

  it("[T-COM-17] reçu falsifié rejeté ; reçu valide rejoué crédité une seule fois ; remboursement répercuté", async () => {
    const v = new MockVerifier(prices, () => T0);
    const fake = await v.verify({ platform: "mock", orderId: "O1", skuId: "boosters_s", token: "forged" });
    expect(applyVerified(acc0(), fake, T0).ok).toBe(false);
    const good = await v.verify({ platform: "mock", orderId: "O2", skuId: "boosters_s", token: "signed:O2:boosters_s" });
    let r = applyVerified(acc0(), good, T0);
    expect(r.ok && r.credited).toBe(true);
    const acc = r.account;
    expect(acc.wallet.boosters.hammer).toBe(3);
    r = applyVerified(acc, good, T0);
    expect(r.ok && r.credited).toBe(false);
    expect(r.account.wallet.boosters.hammer).toBe(3);
    v.setState("O2", "refunded");
    const refunded = applyVerified(acc, await v.verify({ platform: "mock", orderId: "O2", skuId: "boosters_s", token: "signed:O2:boosters_s" }), T0);
    expect(refunded.account.wallet.boosters.hammer).toBe(0);
    expect(refunded.account.ledger[0].state).toBe("refunded");
  });

  it("[T-AGE-08] un achat en attente d'approbation parentale ne crédite rien", async () => {
    const v = new MockVerifier(prices, () => T0);
    v.setState("P1", "pending");
    const r = applyVerified(acc0(), await v.verify({ platform: "mock", orderId: "P1", skuId: "boosters_m", token: "signed:P1:boosters_m" }), T0);
    expect(r.ok && !r.credited).toBe(true);
    expect(r.account.wallet.boosters.hammer).toBe(0);
  });

  it("[T-COM-16] les achats n'expirent pas : un solde vieilli de 5 ans reste intact", () => {
    const w = credit(newWallet(T0), { boosters: { bomb: 4 } }, T0);
    const later = tickLives(w, T0 + 5 * 365 * DAY);
    expect(later.boosters.bomb).toBe(4);
    expect(Object.keys(w)).not.toContain("expiresAt");
  });

  it("[T-AGE-07] plafond mensuel des joueurs protégés (20 € par défaut), remis à zéro le mois suivant", () => {
    const ledger = [{ orderId: "a", skuId: "boosters_l", eurCents: 1902, at: T0, state: "credited" as const }];
    expect(purchaseGate("minor", ledger, skuById("extra_moves"), [], T0)).toEqual({ allowed: false, reason: "cap" });
    expect(purchaseGate("adult", ledger, skuById("extra_moves"), [], T0)).toEqual({ allowed: true });
    expect(purchaseGate("minor", ledger, skuById("extra_moves"), [], Date.UTC(2026, 11, 1, 0, 0, 1))).toEqual({ allowed: true });
    expect(purchaseGate("minor", ledger, skuById("extra_moves"), [], T0, 3000)).toEqual({ allowed: true });
  });

  it("[T-WELL-01] récapitulatif mensuel = somme des reçus vérifiés du mois (remboursements exclus)", () => {
    const ledger = [
      { orderId: "a", skuId: "x", eurCents: 499, at: T0, state: "credited" as const },
      { orderId: "b", skuId: "x", eurCents: 999, at: T0 + DAY, state: "credited" as const },
      { orderId: "c", skuId: "x", eurCents: 1999, at: T0 + DAY, state: "refunded" as const },
      { orderId: "d", skuId: "x", eurCents: 99, at: Date.UTC(2026, 9, 3), state: "credited" as const },
    ];
    expect(monthlySpendCents(ledger, T0 + 2 * DAY)).toBe(1498);
    expect(spendRecap(ledger)).toEqual([{ month: "2026-11", eurCents: 1498, purchases: 2 }, { month: "2026-10", eurCents: 99, purchases: 1 }]);
  });

  it("[T-COM-10] prix toujours lus depuis le store, dans sa devise (ex. couronnes suédoises)", async () => {
    const sek = await new MockStore(CATALOG, "sv-SE", "SEK", 11.5).products(["extra_moves"]);
    expect(sek[0].price).toMatch(/kr/);
    const eur = await new MockStore(CATALOG).products(["extra_moves"]);
    expect(eur[0].price).toMatch(/0,99\s€/);
  });
});

describe("sources gratuites", () => {
  it("[T-RNG-02] roue gratuite : probabilités affichées = table du tirage, somme 100 %, distribution respectée", () => {
    const p = wheelProbabilities();
    expect(p.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 10);
    const counts = new Array(WHEEL.length).fill(0);
    let s = newFreeRewards();
    for (let d = 0; d < 20000; d++) {
      const r = spinWheel(s, T0 + d * DAY, "joueur")!;
      counts[r.index]++;
      s = r.state;
    }
    const chi2 = counts.reduce((a, c, k) => a + (c - p[k] * 20000) ** 2 / (p[k] * 20000), 0);
    expect(chi2).toBeLessThan(22.46); // p = 0,001 pour 6 ddl
    expect(chestProbabilities().reduce((a, x) => a + x, 0)).toBeCloseTo(1, 10);
  });

  it("[T-RNG-03] un seul tour par jour, jamais rachetable ni échangeable contre une pub (récompense de pub fixe)", () => {
    let s = spinWheel(newFreeRewards(), T0, "j")!.state;
    expect(canSpin(s, T0 + 3600_000)).toBe(false);
    expect(spinWheel(s, T0 + 3600_000, "j")).toBeNull();
    const ad = rewardAd(s, T0)!;
    expect(ad.contents).toEqual({ coins: 50 });
    expect(CATALOG.some((x) => JSON.stringify(x).includes("wheel"))).toBe(false);
  });

  it("[T-ECO-02] pubs récompensées : 5 par jour au plus", () => {
    let s = newFreeRewards();
    for (let k = 0; k < 5; k++) s = rewardAd(s, T0 + k)!.state;
    expect(rewardAd(s, T0 + 10)).toBeNull();
    expect(adsLeft(s, T0 + DAY)).toBe(5);
  });

  it("série de connexions : un jour manqué recule d'un cran (pas de remise à zéro)", () => {
    let s = newFreeRewards();
    for (let d = 0; d < 4; d++) s = login(s, T0 + d * DAY).state;
    expect(s.streakDay).toBe(4);
    s = login(s, T0 + 6 * DAY).state; // 2 jours manqués
    expect(s.streakDay).toBe(4);
  });

  it("[T-ECO-03] chaque booster s'obtient gratuitement dans les 30 premiers jours (roue + série)", () => {
    const got = new Set<string>();
    let s = newFreeRewards();
    for (let d = 0; d < 30; d++) {
      const r = spinWheel(s, T0 + d * DAY, "free-player")!;
      s = r.state;
      Object.keys(r.contents.boosters ?? {}).forEach((b) => got.add(b));
      const l = login(s, T0 + d * DAY);
      s = l.state;
      Object.keys(l.reward?.boosters ?? {}).forEach((b) => got.add(b));
    }
    // Piste gratuite du passe jusqu'au palier 16 (atteint par un joueur occasionnel en une saison de 20 jours).
    for (const r of rewardTable()) if (r.track === "free" && r.tier <= 16) Object.keys(r.contents.boosters ?? {}).forEach((b) => got.add(b));
    for (const b of ["hammer", "bomb", "fireCross", "rainbow", "shuffler", "starterKit"]) expect(got.has(b), b).toBe(true);
  });
});

describe("passe de saison", () => {
  const def = { id: "s1", startAt: T0, durationDays: 20 };

  it("[T-SEA-01] 20 jours exactement ; dates de début et de fin connues dès l'ouverture", () => {
    expect(validateSeason(def)).toEqual([]);
    expect(validateSeason({ ...def, durationDays: 21 }).join()).toMatch(/20/);
    expect(daysLeft(def, T0)).toBe(20);
    expect(daysLeft(def, T0 + 19.5 * DAY)).toBe(1);
  });

  it("[T-SEA-02] liste complète des récompenses (40 premium, 20 gratuites) ; estimation sur la médiane, arrondie vers le bas", () => {
    const table = rewardTable();
    expect(table.filter((r) => r.track === "premium")).toHaveLength(40);
    expect(table.filter((r) => r.track === "free")).toHaveLength(20);
    let st = newSeasonState(def);
    st = { ...st, xp: 1300, xpByDay: [100, 900, 300] };
    const now = T0 + 2 * DAY + 1;
    // médiane 300 (et non 900) × 17 jours restants (le jour courant est déjà compté)
    expect(estimateTier(def, st, now)).toBe(Math.floor((1300 + 300 * 17) / XP_PER_TIER));
  });

  it("[T-SEA-03] achat tardif : paliers atteints débloqués ; 3 derniers jours : avertissement chiffré, jamais proposé à un joueur protégé", () => {
    let st = { ...newSeasonState(def), xp: 12 * XP_PER_TIER, xpByDay: [3000] };
    expect(unlockedRewards(st).filter((r) => r.track === "premium")).toHaveLength(0);
    st = buyPass(st, "premium");
    expect(unlockedRewards(st).filter((r) => r.track === "premium")).toHaveLength(12);
    const late = { ...newSeasonState(def), xp: 31 * XP_PER_TIER, xpByDay: new Array(18).fill(400) };
    const view = passOffer(def, late, T0 + 18 * DAY, false);
    expect(view.offered).toBe(true);
    expect(view.warning?.estimatedTier).toBeLessThan(TIERS);
    expect(passOffer(def, late, T0 + 18 * DAY, true).offered).toBe(false);
  });

  it("[T-SEA-04] fin de saison : tout le non-réclamé est crédité ; coffres post-40 gratuits, sans article payant", () => {
    let st = { ...buyPass(newSeasonState(def), "premium"), xp: 15 * XP_PER_TIER };
    st = claim(st, claimable(st)[0]);
    const before = claimable(st).length;
    const { state, credited } = closeSeason(st);
    expect(credited).toHaveLength(before);
    expect(claimable(state)).toHaveLength(0);
    const over = { ...newSeasonState(def), xp: TIERS * XP_PER_TIER + 650 };
    expect(postChestsAvailable(over)).toBe(2);
    expect(openPostChest(over, "x")).not.toBeNull();
    expect(CATALOG.some((s) => s.id.includes("chest"))).toBe(false);
  });

  it("calibrage : joueur actif (≈ 558 XP/jour) au palier 40 en ≈ 18 jours ; occasionnel vers le palier 16", () => {
    expect(Math.ceil((TIERS * XP_PER_TIER) / 558)).toBe(18);
    expect(Math.floor((203 * 20) / XP_PER_TIER)).toBe(16);
  });
});

describe("île", () => {
  it("[T-COM-08] toute la progression de l'île est atteignable sans achat ; aucune tâche n'exige une variante premium", () => {
    let s = { ...newIsland(), stars: 1e6 };
    for (const z of ZONES)
      for (const t of z.tasks) {
        const next = doTask(s, t.id, t.variants[0], false);
        expect(next, t.id).not.toBeNull();
        s = next!;
      }
    expect(currentZone(s)).toBeNull();
    const total = ZONES.reduce((a, z) => a + zoneCost(z), 0);
    // Étoiles d'un joueur gratuit : ≥ 1 par victoire ; 2,3 en moyenne. Les 6 zones coûtent moins que 600 niveaux.
    expect(total).toBeLessThan(600 * 2.3);
  });

  it("la variante premium est refusée sans passe, acceptée avec", () => {
    const z = ZONES[0];
    let s = { ...newIsland(), stars: 1000 };
    for (const t of z.tasks.slice(0, 3)) s = doTask(s, t.id, t.variants[1], false)!;
    const t4 = z.tasks[3];
    expect(t4.premiumVariant).toBeDefined();
    expect(doTask(s, t4.id, t4.premiumVariant!, false)).toBeNull();
    expect(doTask(s, t4.id, t4.premiumVariant!, true)).not.toBeNull();
  });
});
