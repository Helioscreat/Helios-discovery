/**
 * Tests d'interface de bout en bout : build de production servi par `vite preview`, piloté par Playwright (Chromium).
 * Les crochets `window.__helios` (?test=1) servent à atteindre un écran ; les gestes eux-mêmes sont réels
 * (glisser sur le canvas, clavier, clics) sauf mention contraire.
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SCREENS } from "../src/ui/registry";

import { chromium, type Browser, type Page } from "playwright-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4180;
const URL = `http://127.0.0.1:${PORT}/?test=1`;
const PHONES = [
  { name: "393x727", width: 393, height: 727 },
  { name: "375x667", width: 375, height: 667 },
  { name: "412x915", width: 412, height: 915 },
];

let server: ChildProcess;
let browser: Browser;

beforeAll(async () => {
  execSync("npx vite build --logLevel error", { cwd: ROOT, stdio: "inherit" });
  server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  for (let k = 0; k < 100; k++) {
    try {
      if ((await fetch(URL)).ok) break;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  // CHROMIUM_PATH permet d'utiliser un Chromium déjà installé (CI, conteneur) ; sinon celui de Playwright.
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

async function phone(vp = PHONES[0], settings?: Record<string, unknown>) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: false, locale: "fr-FR" });
  if (settings) await ctx.addInitScript((s: Record<string, unknown>) => localStorage.setItem("helios.settings.v1", JSON.stringify(s)), settings);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  // Toute erreur de console compte (ex. empreinte d'un niveau régénéré différente du niveau validé).
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(URL);
  await page.waitForSelector(".home");
  return { page, ctx, errors };
}

const hook = <T>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

async function startLevel(page: Page, n: number) {
  await page.evaluate((lvl: number) => window.__helios!.startLevel(lvl), n);
  await page.waitForSelector("canvas");
  await page.waitForTimeout(300);
}

/** Centre écran de la case `pos` sur le canvas. */
async function cellCenter(page: Page, pos: number) {
  const box = (await page.locator("canvas").boundingBox())!;
  const { w, h } = await page.evaluate(() => ({ w: window.__helios!.session()!.state.width, h: window.__helios!.session()!.state.height }));
  return { x: box.x + ((pos % w) + 0.5) * (box.width / w), y: box.y + (Math.floor(pos / w) + 0.5) * (box.height / h) };
}

async function waitIdle(page: Page, ms = 2500) {
  await page.waitForTimeout(ms);
}

const movesText = (page: Page) => page.locator('[data-testid="moves"]').innerText();

describe("[T-COM-04] modales de choix : le refus est aussi visible que l'acceptation", () => {
  const openers: Record<string, (page: Page) => Promise<void>> = {
    "level-start": async (page) => {
      await page.evaluate(() => window.__helios!.chooseLevel(1));
    },
    quit: async (page) => {
      await startLevel(page, 3);
      await page.getByRole("button", { name: "Menu" }).click();
    },
    "end-fail": async (page) => {
      await startLevel(page, 3);
      await page.evaluate(() => window.__helios!.forceStatus("lost"));
    },
    "purchase-sheet": async (page) => {
      await page.evaluate(() => window.__helios!.openOverlay({ kind: "purchase", skuId: "boosters_m" }));
      await page.waitForFunction(() => document.querySelector("[data-price]")?.getAttribute("data-price") !== "");
    },
    "subscription-sheet": async (page) => {
      await page.evaluate(() => window.__helios!.openOverlay({ kind: "subscription", skuId: "gardener_monthly" }));
      await page.waitForFunction(() => document.querySelector("[data-price]")?.getAttribute("data-price") !== "");
    },
    "pass-sheet": async (page) => {
      await page.evaluate(() => window.__helios!.openOverlay({ kind: "pass-sheet", tier: "premium" }));
      await page.waitForFunction(() => document.querySelector("[data-modal] [data-price]")?.getAttribute("data-price") !== "");
    },
    lives: async (page) => {
      await page.evaluate(() => window.__helios!.openOverlay({ kind: "lives", level: 1 }));
    },
  };

  it("chaque modale « choice » du registre est couverte par ce test", () => {
    expect(SCREENS.filter((s) => s.kind === "choice").map((s) => s.name).sort()).toEqual(Object.keys(openers).sort());
  });

  for (const scale of [100, 150])
    for (const name of Object.keys(openers)) {
      it(`${name} (texte ${scale} %) : taille, contraste et graisse identiques`, async () => {
        const { page, ctx, errors } = await phone(PHONES[0], { textScale: scale });
        await openers[name](page);
        const modal = page.locator(`[data-modal="${name}"]`);
        await modal.waitFor();
        expect(await modal.locator("[data-dual-choice]").count()).toBe(1);
        const m = await modal.evaluate((el: Element) => {
          const lum = (rgb: string) => {
            const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((c) => {
              const s = c / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const info = (sel: string) => {
            const b = el.querySelector<HTMLElement>(sel)!;
            const r = b.getBoundingClientRect();
            const cs = getComputedStyle(b);
            const l1 = lum(cs.color), l2 = lum(cs.backgroundColor);
            return {
              area: r.width * r.height, top: r.top, bottom: r.bottom,
              fontSize: cs.fontSize, fontWeight: cs.fontWeight, bg: cs.backgroundColor,
              contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
            };
          };
          return { accept: info('[data-choice="accept"]'), decline: info('[data-choice="decline"]'), vh: innerHeight };
        });
        expect(m.decline.area / m.accept.area).toBeGreaterThanOrEqual(0.95);
        expect(m.accept.area / m.decline.area).toBeGreaterThanOrEqual(0.95);
        expect(m.decline.fontSize).toBe(m.accept.fontSize);
        expect(m.decline.fontWeight).toBe(m.accept.fontWeight);
        expect(m.decline.bg).toBe(m.accept.bg);
        expect(m.decline.contrast).toBeGreaterThanOrEqual(4.5);
        expect(m.accept.contrast).toBeGreaterThanOrEqual(4.5);
        for (const b of [m.accept, m.decline]) expect(b.bottom).toBeLessThanOrEqual(m.vh);
        expect(errors).toEqual([]);
        await ctx.close();
      });
    }

  it("aucune case pré-cochée sur l'écran de début de niveau (Kit de départ)", async () => {
    const c2 = await browser.newContext({ viewport: { width: 393, height: 727 }, locale: "fr-FR" });
    await c2.addInitScript(() => localStorage.setItem("helios.profile.v1", JSON.stringify({ levelReached: 41, granted: ["hammer", "bomb", "rainbow", "fireCross", "shuffler", "starterKit"], inventory: { hammer: 3, bomb: 3, rainbow: 3, fireCross: 3, shuffler: 3, starterKit: 3 }, stars: {} })));
    const p2 = await c2.newPage();
    await p2.goto(URL);
    await p2.waitForSelector(".home");
    await p2.evaluate(() => window.__helios!.chooseLevel(41));
    const box = p2.locator('[data-modal="level-start"] input[type="checkbox"]');
    await box.waitFor();
    expect(await box.isChecked()).toBe(false);
    await c2.close();
  });
});

describe("[T-ACC-04] accessibilité de l'interface", () => {
  for (const vp of PHONES)
    it(`jeu à une main (${vp.name}) : toutes les commandes de jeu dans les 60 % inférieurs de l'écran`, async () => {
      const { page, ctx } = await phone(vp);
      await startLevel(page, 12);
      const rects = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".game button, .game canvas")].map((el) => {
          const r = el.getBoundingClientRect();
          return { what: el.getAttribute("aria-label") ?? el.tagName, top: r.top, bottom: r.bottom };
        }),
      );
      expect(rects.length).toBeGreaterThanOrEqual(7);
      for (const r of rects) {
        expect(r.top, r.what).toBeGreaterThanOrEqual(vp.height * 0.4 - 1);
        expect(r.bottom, r.what).toBeLessThanOrEqual(vp.height + 1);
      }
      await ctx.close();
    });

  it("texte à 150 % : aucun texte tronqué ni défilement horizontal (accueil, début de niveau, partie, paramètres)", async () => {
    const { page, ctx } = await phone(PHONES[1], { textScale: 150 });
    const check = async (where: string) => {
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`défilement horizontal ${document.documentElement.scrollWidth}>${innerWidth}`);
        for (const el of document.querySelectorAll<HTMLElement>("h1,h2,h3,p,li,label,button,span,legend")) {
          if (el.clientWidth === 0 || getComputedStyle(el).position === "absolute") continue;
          if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName} « ${el.innerText.slice(0, 30)} » ${el.scrollWidth}>${el.clientWidth}`);
        }
        return out;
      });
      expect(bad, where).toEqual([]);
    };
    await check("accueil");
    await page.evaluate(() => window.__helios!.chooseLevel(1));
    await page.locator('[data-modal="level-start"]').waitFor();
    await check("début de niveau");
    await page.locator('[data-choice="accept"]').click();
    await page.waitForSelector("canvas");
    await check("partie");
    await page.evaluate(() => window.__helios!.openOverlay({ kind: "settings" }));
    await page.locator('[data-modal="settings"]').waitFor();
    await check("paramètres");
    await page.evaluate(() => window.__helios!.openOverlay({ kind: "quit" }));
    await page.locator('[data-modal="quit"]').waitFor();
    await check("quitter");
    await page.evaluate(() => window.__helios!.forceStatus("lost"));
    await page.locator('[data-modal="end-fail"]').waitFor();
    await check("fin de niveau (échec)");
    await ctx.close();
  });

  it("flashs : au plus 3 par seconde pendant une réaction en chaîne massive", async () => {
    const { page, ctx } = await phone();
    await startLevel(page, 12);
    await page.evaluate(() => {
      const h = window.__helios!;
      h.session()!.profile.inventory.hammer = 3;
      h.mutate((st) => st.cells.forEach((p, i) => { if (p) p.special = i % 2 ? "rocketH" : "rocketV"; }));
    });
    const ok = await page.evaluate(() => window.__helios!.booster("hammer", 40));
    expect(ok).toBe(true);
    const flashes = await page.evaluate(() => window.__helios!.flashes);
    expect(flashes.length).toBeGreaterThan(0);
    const peak = (() => {
      const s = [...flashes].sort((a, b) => a - b);
      let best = 0;
      for (let i = 0, j = 0; i < s.length; i++) {
        while (s[i] - s[j] >= 1000) j++;
        best = Math.max(best, i - j + 1);
      }
      return best;
    })();
    expect(peak).toBeLessThanOrEqual(3);
    await ctx.close();
  });

  it("mode daltonien et taille de texte : appliqués depuis les paramètres", async () => {
    const { page, ctx } = await phone();
    await page.getByRole("button", { name: "Paramètres" }).click();
    await page.getByRole("switch", { name: /daltonien/ }).check();
    await page.getByRole("radio", { name: "125 %" }).check();
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--scale") === "1.25");
    const r = await page.evaluate(() => ({ cb: document.documentElement.dataset.colorblind, scale: document.documentElement.style.getPropertyValue("--scale") }));
    expect(r).toEqual({ cb: "true", scale: "1.25" });
    await ctx.close();
  });
});

describe("gestes de jeu réels", () => {
  it("glisser une pièce sur le canvas joue le coup", async () => {
    const { page, ctx, errors } = await phone();
    await startLevel(page, 5);
    const before = await movesText(page);
    const m = (await page.evaluate(() => window.__helios!.hint()))!;
    const a = await cellCenter(page, m.from), b = await cellCenter(page, m.to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await waitIdle(page);
    expect(Number(await movesText(page))).toBe(Number(before) - 1);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("toucher-toucher : deux pièces voisines touchées l'une après l'autre", async () => {
    const { page, ctx } = await phone();
    await startLevel(page, 6);
    const before = Number(await movesText(page));
    const m = (await page.evaluate(() => window.__helios!.hint()))!;
    const a = await cellCenter(page, m.from), b = await cellCenter(page, m.to);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await waitIdle(page);
    expect(Number(await movesText(page))).toBe(before - 1);
    await ctx.close();
  });

  it("clavier seul : flèches + Entrée jouent un coup, le curseur est annoncé", async () => {
    const { page, ctx } = await phone();
    await startLevel(page, 4);
    const before = Number(await movesText(page));
    const m = (await page.evaluate(() => window.__helios!.hint()))!;
    const st = await page.evaluate(() => ({ w: window.__helios!.session()!.state.width, first: window.__helios!.session()!.state.mask.indexOf(true) }));
    await page.locator("canvas").focus();
    const go = async (from: number, to: number) => {
      const dx = (to % st.w) - (from % st.w), dy = Math.floor(to / st.w) - Math.floor(from / st.w);
      for (let k = 0; k < Math.abs(dx); k++) await page.keyboard.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
      for (let k = 0; k < Math.abs(dy); k++) await page.keyboard.press(dy > 0 ? "ArrowDown" : "ArrowUp");
    };
    await go(st.first, m.from);
    await page.keyboard.press("Enter");
    await go(m.from, m.to);
    await page.keyboard.press("Enter");
    await waitIdle(page);
    expect(Number(await movesText(page))).toBe(before - 1);
    expect(await page.locator('[data-testid="announcer"]').innerText()).not.toBe("");
    await ctx.close();
  });

  it("boosters : tutoriel au déblocage, 3 exemplaires offerts, utilisation sans consommer de coup", async () => {
    const { page, ctx, errors } = await phone();
    await page.evaluate(() => window.__helios!.chooseLevel(12));
    for (let k = 0; k < 2; k++) {
      const tuto = page.locator('[data-modal="booster-tutorial"]');
      await tuto.waitFor();
      await tuto.getByRole("button").click();
    }
    await page.locator('[data-modal="level-start"] [data-choice="accept"]').click();
    await page.waitForSelector("canvas");
    await page.waitForTimeout(300);
    const hammer = page.locator('[data-booster="hammer"]');
    const movesBefore = await movesText(page);
    expect(await hammer.getAttribute("aria-label")).toContain("3");
    expect(await page.locator('[data-booster="rainbow"]').isDisabled()).toBe(true);
    await hammer.click();
    expect(await hammer.getAttribute("aria-pressed")).toBe("true");
    const c = await cellCenter(page, 40);
    await page.mouse.click(c.x, c.y);
    await waitIdle(page);
    expect(await hammer.getAttribute("aria-label")).toContain("2");
    expect(await movesText(page)).toBe(movesBefore);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe("niveaux réels et obstacles", () => {
  it("le niveau 13 présente le Gel avec son tutoriel ; les objectifs d'obstacle s'affichent", async () => {
    const { page, ctx, errors } = await phone();
    await page.evaluate(() => window.__helios!.chooseLevel(13));
    // Au niveau 13, les tutoriels des boosters déjà débloqués (Marteau, Bombe) passent d'abord.
    for (let k = 0; k < 2; k++) {
      const tuto = page.locator('[data-modal="booster-tutorial"]');
      await tuto.waitFor();
      await tuto.getByRole("button").click();
    }
    await page.locator('[data-modal="level-start"]').waitFor();
    expect(await page.locator('[data-testid="level-tutorial"]').innerText()).toMatch(/Gel/);
    await page.locator('[data-choice="accept"]').click();
    await page.waitForSelector("canvas");
    expect(await page.locator(".hud .goals").innerText()).toMatch(/Gel : 0 sur \d+/);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("niveaux avec caisses, chaînes, lierre, objets, bulles, coffres, portails et tapis : 10 coups sans erreur", async () => {
    const { page, ctx, errors } = await phone();
    // Niveaux générés (> 150) : le manifeste est chargé à la demande.
    await page.waitForFunction(() => /\d/.test(document.querySelector(".pager span")?.textContent ?? "") && document.querySelectorAll(".pager .btn:not([disabled])").length > 0);
    for (const n of [77, 126, 131, 212, 275]) {
      await startLevel(page, n);
      if (n === 275) {
        const st = await page.evaluate(() => ({ p: window.__helios!.session()!.state.portals?.length ?? 0, c: window.__helios!.session()!.state.conveyors?.length ?? 0 }));
        expect(st.p).toBeGreaterThan(0);
        expect(st.c).toBe(1);
      }
      for (let k = 0; k < 10; k++) {
        const m = await page.evaluate(() => (window.__helios!.session()!.state.status === "playing" ? window.__helios!.hint() : null));
        if (!m) break;
        const a = await cellCenter(page, m.from), b = await cellCenter(page, m.to);
        await page.mouse.click(a.x, a.y);
        await page.mouse.click(b.x, b.y);
        await page.waitForTimeout(1200);
      }
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe("performance (indicatif)", () => {
  it("mesure la cadence d'affichage pendant 8 coups animés", async () => {
    const { page, ctx } = await phone();
    await startLevel(page, 12);
    await page.evaluate(() => {
      (window as unknown as { __frames: number[] }).__frames = [];
      const tick = (t: number) => {
        (window as unknown as { __frames: number[] }).__frames.push(t);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    for (let k = 0; k < 8; k++) {
      const m = await page.evaluate(() => window.__helios!.hint());
      if (!m) break;
      const a = await cellCenter(page, m.from), b = await cellCenter(page, m.to);
      await page.mouse.click(a.x, a.y);
      await page.mouse.click(b.x, b.y);
      await page.waitForTimeout(1500);
    }
    const frames = await hook<number[]>(page, "window.__frames");
    const deltas = frames.slice(1).map((t, i) => t - frames[i]).sort((x, y) => x - y);
    const fps = (1000 * (frames.length - 1)) / (frames[frames.length - 1] - frames[0]);
    const p95 = deltas[Math.floor(deltas.length * 0.95)];
    process.stdout.write(`\n[perf] Chromium headless (rendu logiciel) : ${fps.toFixed(1)} i/s en moyenne, 95e centile ${p95.toFixed(1)} ms par image\n`);
    expect(fps).toBeGreaterThan(20);
    await ctx.close();
  });
});

// ───────────────────────── livrable 5 : boutique, fiches d'achat, abonnement, passe ─────────────────────────
import { createRequire } from "node:module";
import { CATALOG } from "@helios/economy";
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

async function adult(page: Page) {
  await page.evaluate(() => window.__helios!.setAge("adult"));
}

describe("écrans d'achat", () => {
  it("[T-COM-09] chaque fiche d'achat affiche description, contenu et quantités, prix TTC du store et durée", async () => {
    const { page, ctx, errors } = await phone();
    await adult(page);
    for (const sku of CATALOG) {
      const overlay = sku.kind === "subscription" ? { kind: "subscription", skuId: sku.id } : sku.kind === "seasonPass" ? { kind: "pass-sheet", tier: sku.passTier } : { kind: "purchase", skuId: sku.id };
      await page.evaluate((o) => window.__helios!.openOverlay(o as never), overlay);
      const modal = page.locator("[data-modal]");
      await modal.waitFor();
      await page.waitForFunction(() => (document.querySelector("[data-modal] [data-field='price'] [data-price]")?.getAttribute("data-price") ?? "") !== "");
      for (const f of ["description", "quantity", "price", "duration"]) {
        const txt = (await modal.locator(`[data-field="${f}"]`).first().innerText()).trim();
        expect(txt.length, `${sku.id} · ${f}`).toBeGreaterThan(3);
      }
      expect(await modal.locator("[data-field='price']").innerText(), sku.id).toMatch(/€/);
      if (sku.kind !== "subscription" && sku.kind !== "seasonPass") {
        const lines = await modal.locator("[data-field='quantity'] li").count();
        const expected = Object.keys(sku.contents.boosters ?? {}).length + (sku.contents.unlimitedLivesMin ? 1 : 0) + (sku.contents.coins ? 1 : 0) + (sku.contents.extraMoves ? 1 : 0);
        expect(lines, sku.id).toBe(expected);
      }
      await page.evaluate(() => window.__helios!.openOverlay({ kind: "none" }));
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it("[T-COM-12] chaque fiche mentionne la rétractation et renvoie vers la procédure de remboursement du store", async () => {
    const { page, ctx } = await phone();
    await adult(page);
    for (const o of [{ kind: "purchase", skuId: "lives_3h" }, { kind: "subscription", skuId: "gardener_monthly" }, { kind: "pass-sheet", tier: "premiumPlus" }]) {
      await page.evaluate((x) => window.__helios!.openOverlay(x as never), o);
      expect(await page.locator("[data-testid='withdrawal']").innerText()).toMatch(/rétractation/);
      expect(await page.locator("[data-testid='refund-link']").getAttribute("href")).toMatch(/^https:\/\/(support\.google\.com|reportaproblem\.apple\.com)/);
    }
    await ctx.close();
  });

  it("[T-COM-14] abonnement : prix, durée, renouvellement, résiliation et lien direct ; lien accessible ensuite depuis les paramètres", async () => {
    const { page, ctx } = await phone();
    await adult(page);
    await page.evaluate(() => window.__helios!.openOverlay({ kind: "subscription", skuId: "gardener_monthly" }));
    const m = page.locator("[data-modal='subscription-sheet']");
    await page.waitForFunction(() => document.querySelector("[data-modal] [data-price]")?.getAttribute("data-price") !== "");
    for (const f of ["price", "duration", "renewal", "cancel"]) expect((await m.locator(`[data-field="${f}"]`).innerText()).length).toBeGreaterThan(5);
    expect(await m.locator("[data-testid='manage-sub']").getAttribute("href")).toMatch(/play\.google\.com\/store\/account\/subscriptions\?sku=gardener_monthly/);
    await m.locator("[data-choice='accept']").click();
    await page.locator("[data-modal='toast']").waitFor();
    await page.locator("[data-modal='toast'] button").click();
    await page.getByRole("button", { name: "Paramètres" }).click();
    const link = page.locator("[data-testid='purchases-settings'] a", { hasText: "résilier" });
    expect(await link.getAttribute("href")).toMatch(/subscriptions/);
    expect(await page.locator("[data-testid='spend-recap']").innerText()).toMatch(/4,99/);
    await ctx.close();
  });

  it("[T-COM-15] chaque prix affiché (boutique, passe, écran d'échec) porte la devise du store", async () => {
    const { page, ctx } = await phone();
    await adult(page);
    const check = async (where: string) => {
      const prices = await page.evaluate(() => [...document.querySelectorAll("[data-price]")].map((e) => e.getAttribute("data-price") ?? ""));
      expect(prices.length, where).toBeGreaterThan(0);
      for (const p of prices) expect(p, where).toMatch(/\d.*(€|EUR)/);
    };
    await page.evaluate(() => window.__helios!.goto("shop"));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-price]")].every((e) => e.getAttribute("data-price")));
    await check("boutique");
    await page.evaluate(() => window.__helios!.goto("pass"));
    await check("passe");
    await page.evaluate(() => window.__helios!.goto("home"));
    await startLevel(page, 3);
    await page.evaluate(() => window.__helios!.forceStatus("lost"));
    await page.locator("[data-modal='end-fail']").waitFor();
    await check("échec");
    await ctx.close();
  });

  it("[T-AGE-06] joueur protégé : aucune option payante à l'échec, aucune offre mise en avant, aucune fenêtre d'offre automatique", async () => {
    const { page, ctx } = await phone();
    // Âge inconnu par défaut (écran d'âge au livrable 6) : traité comme protégé.
    for (const n of [2, 3, 4, 5, 6]) {
      await startLevel(page, n);
      await page.evaluate(() => window.__helios!.forceStatus("lost"));
      await page.locator("[data-modal='end-fail']").waitFor();
      expect(await page.locator("[data-testid='continue-paid']").count()).toBe(0);
      expect(await page.locator("[data-modal]").count()).toBe(1);
      await page.locator("[data-modal='end-fail'] [data-choice='decline']").click();
      expect(await page.locator("[data-modal]").count()).toBe(0);
    }
    await page.evaluate(() => window.__helios!.goto("shop"));
    expect(await page.locator("[data-testid='shop-protected']").count()).toBe(1);
    await page.evaluate(() => window.__helios!.goto("pass"));
    // Passe : consultable, et proposé hors des 3 derniers jours seulement.
    await ctx.close();
  });

  it("[T-ACC-01] parcours d'achat accessible : 0 violation axe-core sérieuse ou critique (boutique, fiches, abonnement, passe)", async () => {
    const { page, ctx } = await phone();
    await adult(page);
    const audit = async (where: string) => {
      await page.addScriptTag({ path: axePath });
      const res = await page.evaluate(async () => {
        const r = await (window as unknown as { axe: { run: (c?: unknown, o?: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
      });
      expect(res, where).toEqual([]);
    };
    await page.evaluate(() => window.__helios!.goto("shop"));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-price]")].every((e) => e.getAttribute("data-price")));
    await audit("boutique");
    await page.locator("[data-sku='boosters_m'] button").click();
    await audit("fiche d'achat");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__helios!.openOverlay({ kind: "subscription", skuId: "gardener_monthly" }));
    await audit("abonnement");
    await page.evaluate(() => window.__helios!.openOverlay({ kind: "none" }));
    await page.evaluate(() => window.__helios!.goto("pass"));
    await audit("passe");
    await page.evaluate(() => window.__helios!.openOverlay({ kind: "pass-sheet", tier: "premium" }));
    await audit("fiche du passe");
    // Parcours clavier : on atteint le bouton « Payer » au clavier depuis la fiche.
    let reached = false;
    for (let k = 0; k < 40 && !reached; k++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.getAttribute("data-choice") === "accept");
    }
    expect(reached).toBe(true);
    await ctx.close();
  });
});

describe("parcours de jeu méta", () => {
  it("achat d'un pack (adulte) : boosters crédités une fois, dépense visible dans le récapitulatif", async () => {
    const { page, ctx } = await phone();
    await adult(page);
    await page.evaluate(() => window.__helios!.goto("shop"));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-price]")].every((e) => e.getAttribute("data-price")));
    await page.locator("[data-sku='boosters_s'] button").click();
    await page.locator("[data-modal='purchase-sheet'] [data-choice='accept']").click();
    await page.locator("[data-modal='toast']").waitFor();
    const inv = await page.evaluate(() => JSON.parse(localStorage.getItem("helios.profile.v1")!).inventory.hammer);
    expect(inv).toBe(3);
    const ledger = await page.evaluate(() => window.__helios!.meta().account.ledger.length);
    expect(ledger).toBe(1);
    await ctx.close();
  });

  it("vies : une défaite coûte une vie ; sans vie, l'écran des vies s'affiche au lieu du niveau", async () => {
    const { page, ctx } = await phone();
    for (let k = 0; k < 5; k++) {
      await startLevel(page, 2);
      await page.evaluate(() => window.__helios!.forceStatus("lost"));
      await page.locator("[data-modal='end-fail'] [data-choice='decline']").click();
    }
    expect(await page.evaluate(() => window.__helios!.meta().account.wallet.lives)).toBe(0);
    await page.evaluate(() => window.__helios!.chooseLevel(2));
    await page.locator("[data-modal='lives']").waitFor();
    await ctx.close();
  });

  it("+5 coups payés (adulte) : la partie reprend sur la même grille avec 5 coups", async () => {
    const { page, ctx } = await phone();
    await adult(page);
    await startLevel(page, 3);
    const before = await page.evaluate(() => JSON.stringify(window.__helios!.session()!.state.cells.map((c) => c?.id)));
    await page.evaluate(() => window.__helios!.forceStatus("lost"));
    await page.waitForFunction(() => document.querySelector("[data-testid='continue-paid'] [data-price]")?.getAttribute("data-price") !== "");
    await page.locator("[data-testid='continue-paid']").click();
    await page.waitForFunction(() => window.__helios!.session()!.state.status === "playing");
    expect(await movesText(page)).toBe("5");
    expect(await page.evaluate(() => JSON.stringify(window.__helios!.session()!.state.cells.map((c) => c?.id)))).toBe(before);
    await ctx.close();
  });

  it("roue gratuite : un tour par jour, probabilités affichées ; île : une tâche se réalise avec des étoiles", async () => {
    const { page, ctx } = await phone();
    await page.evaluate(() => window.__helios!.goto("rewards"));
    expect(await page.locator("[data-testid='wheel-odds'] tbody tr").count()).toBe(7);
    await page.getByRole("button", { name: "Tourner la roue" }).click();
    expect(await page.getByRole("button", { name: "Prochain tour demain" }).isDisabled()).toBe(true);
    await page.evaluate(() => { window.__helios!.meta().island.stars = 10; });
    await page.evaluate(() => window.__helios!.goto("island"));
    await page.getByRole("button", { name: "Décoration 2" }).click();
    expect(await page.evaluate(() => Object.keys(window.__helios!.meta().island.done).length)).toBe(1);
    await ctx.close();
  });
});
