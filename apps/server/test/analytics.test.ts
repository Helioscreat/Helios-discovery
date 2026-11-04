import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, RETENTION } from "@helios/config";
import { createApi, openDb, Service } from "../src";

let now = Date.UTC(2026, 10, 4, 12);
const DAY = 86_400_000;
const db = openDb();
const svc = new Service(db, {
  clock: () => now,
  deletionDelayMs: 7 * DAY,
  moderators: ["mod-a", "mod-b"],
  contact: { email: "contact@helios-discovery.example", languages: ["fr"] },
  minorCapCents: 2000,
  adminKeys: ["admin-1"],
});
const server = createApi(svc, { allowedOrigins: [] });
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function call(method: string, path: string, body?: unknown, token?: string, admin?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(admin ? { "x-admin-key": admin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function player(age: number, country = "FR", consent = true) {
  const a = (await call("POST", "/v1/accounts", { country })).json as { id: string; token: string };
  await call("POST", "/v1/me/age", { birth: `${new Date(now).getUTCFullYear() - age}-01-15` }, a.token);
  if (consent) await call("POST", "/v1/me/consent", { analytics: true }, a.token);
  return a;
}

describe("événements de mesure", () => {
  it("refusés sans consentement ; schéma fermé (événement ou champ inconnu, texte libre refusés)", async () => {
    const no = await player(30, "FR", false);
    expect((await call("POST", "/v1/events", { name: "level_start", data: { n: 1 } }, no.token)).status).toBe(403);
    const yes = await player(30);
    expect((await call("POST", "/v1/events", { name: "level_start", data: { n: 1, boosters: 0 } }, yes.token)).status).toBe(200);
    expect((await call("POST", "/v1/events", { name: "mouse_moves", data: {} }, yes.token)).status).toBe(422);
    expect((await call("POST", "/v1/events", { name: "level_win", data: { n: 1, email: "x@y.z" } }, yes.token)).status).toBe(422);
    expect((await call("POST", "/v1/events", { name: "purchase", data: { sku: "Bonjour, je suis Léa", eurCents: 99 } }, yes.token)).status).toBe(422);
  });
});

describe("config distante", () => {
  it("[T-DFA-01] une surcharge publiée (BE : pubs coupées, plafond 10 €) s'applique tout de suite, sans nouvelle version", async () => {
    expect((await call("GET", "/v1/config?country=BE")).json.monetization.ads.enabled).toBe(true);
    const cfg = { ...DEFAULT_CONFIG, countries: { BE: { monetization: { ads: { enabled: false, maxPerDay: 0 }, minorCapCents: 1000 } } } };
    expect((await call("POST", "/v1/admin/config", cfg, undefined, "intrus")).status).toBe(403);
    expect((await call("POST", "/v1/admin/config", { ...cfg, countries: { BE: { monetization: { ads: { enabled: true, maxPerDay: 12 } } } } }, undefined, "admin-1")).status).toBe(422);
    expect((await call("POST", "/v1/admin/config", cfg, undefined, "admin-1")).json.version).toBe(2);
    const be = (await call("GET", "/v1/config?country=BE")).json;
    expect(be.monetization).toMatchObject({ ads: { enabled: false, maxPerDay: 0 }, minorCapCents: 1000 });
    expect((await call("GET", "/v1/config?country=FR")).json.monetization.ads.enabled).toBe(true);
    // Le plafond belge s'applique immédiatement aux autorisations d'achat.
    const kid = await player(15, "BE");
    await call("POST", "/v1/purchases/verify", { receipt: { platform: "mock", orderId: "BE-1", skuId: "boosters_m", token: "signed:BE-1:boosters_m" } }, kid.token);
    expect((await call("POST", "/v1/purchases/authorize", { skuId: "lives_1h" }, kid.token)).json).toEqual({ allowed: false, reason: "cap" });
  });
});

describe("tableau de bord", () => {
  it("entonnoir par niveau, conversion Premium et rétention calculés à partir des événements", async () => {
    const t0 = now;
    now = t0 - 40 * DAY;
    const a = await player(30), b = await player(31);
    for (const p of [a, b]) await call("POST", "/v1/events", { name: "level_start", data: { n: 500 } }, p.token);
    await call("POST", "/v1/events", { name: "level_win", data: { n: 500, stars: 2 } }, a.token);
    await call("POST", "/v1/events", { name: "level_fail", data: { n: 500 } }, b.token);
    now = t0 - 39 * DAY;
    await call("POST", "/v1/events", { name: "level_start", data: { n: 501 } }, a.token);
    now = t0 - 2 * DAY;
    await call("POST", "/v1/events", { name: "purchase", data: { sku: "pass_premium", eurCents: 499 } }, a.token);
    now = t0;
    const d = (await call("GET", "/v1/admin/dashboard", undefined, undefined, "admin-1")).json;
    const l500 = d.funnel.find((f: { n: number }) => f.n === 500);
    expect(l500).toMatchObject({ starts: 2, wins: 1, fails: 1, winRate: 0.5 });
    expect(d.retention.cohort).toBeGreaterThanOrEqual(2);
    expect(d.retention.d1).toBeGreaterThan(0);
    expect(d.premiumConversion).toBeGreaterThan(0);
    expect((await call("GET", "/v1/admin/dashboard")).status).toBe(403);
  });

  it("[T-ANA-01] indicateurs de protection : chaque seuil dépassé déclenche son alerte, une seule fois", async () => {
    const before = (await call("GET", "/v1/admin/dashboard", undefined, undefined, "admin-1")).json;
    // Mineur au plafond (20 €), revenus des mineurs majoritaires, sessions de plus de 3 h.
    const kid = await player(16);
    for (const [k, sku] of [["K-1", "boosters_m"], ["K-2", "boosters_m"], ["K-3", "lives_1h"]]) await call("POST", "/v1/purchases/verify", { receipt: { platform: "mock", orderId: k, skuId: sku, token: `signed:${k}:${sku}` } }, kid.token);
    const adult = await player(40);
    for (const s of [4 * 3600, 5 * 3600, 600]) await call("POST", "/v1/events", { name: "session_length", data: { seconds: s } }, adult.token);
    const d = (await call("GET", "/v1/admin/dashboard", undefined, undefined, "admin-1")).json;
    const kinds = d.alerts.map((a: { indicator: string }) => a.indicator).sort();
    expect(kinds).toEqual(["longSessionShare", "minorRevenueShare", "minorsAtCap"]);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(d.protection.minorsAtCap).toBeGreaterThanOrEqual(1);
    void before;
  });

  it("sous les seuils, aucune alerte (base neuve)", async () => {
    const db2 = openDb();
    const s2 = new Service(db2, { clock: () => now, deletionDelayMs: DAY, moderators: [], contact: { email: "c@x.eu", languages: ["fr"] }, minorCapCents: 2000, adminKeys: ["k"] });
    expect(s2.dashboard("k").alerts).toEqual([]);
  });

  it("la page d'administration est servie sans données (les chiffres exigent la clé)", async () => {
    const res = await fetch(`${base}/admin`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(await res.text()).toMatch(/Tableau de bord/);
  });
});

describe("conservation", () => {
  it("[T-GDPR-09] la purge supprime toute donnée plus ancienne que sa durée ; les durées viennent de la même source que la politique", async () => {
    const a = await player(30);
    await call("POST", "/v1/teams/old/join", {}, a.token);
    await call("POST", "/v1/teams/old/messages", { text: "message récent" }, a.token);
    const ins = (table: string, sql: string, ...args: unknown[]) => db.prepare(`INSERT INTO ${table} ${sql}`).run(...(args as never[]));
    for (const r of RETENTION) {
      const old = now - (r.days + 1) * DAY;
      if (r.table === "events") ins("events", "VALUES (?, ?, 'level_start', '{}', ?)", `old-${r.table}`, a.id, old);
      if (r.table === "messages") ins("messages", "(id, team_id, player_id, kind, body, at) VALUES (?, 'old', ?, 'text', 'vieux', ?)", `old-${r.table}`, a.id, old);
      if (r.table === "notifications") ins("notifications", "VALUES (?, ?, 'x', '{}', ?)", `old-${r.table}`, a.id, old);
      if (r.table === "tickets") ins("tickets", "VALUES (?, NULL, NULL, 'x', 'vieux message', 'fr', ?)", `old-${r.table}`, old);
      if (r.table === "consents") ins("consents", "VALUES (?, ?, 'v0', 1, NULL)", a.id, old);
      if (r.table === "ledger") ins("ledger", "VALUES (?, ?, 'lives_1h', 99, ?, 'credited')", `old-${r.table}`, a.id, old);
    }
    const counts = svc.runRetentionJob();
    for (const t of ["events", "messages", "notifications", "tickets", "consents", "ledger"]) expect(counts[t], t).toBeGreaterThanOrEqual(1);
    for (const r of RETENTION) {
      const n = (db.prepare(`SELECT COUNT(*) n FROM ${r.table} WHERE ${r.column} < ?`).get(now - r.days * DAY) as { n: number }).n;
      expect(n, r.table).toBe(0);
    }
    expect((db.prepare("SELECT COUNT(*) n FROM messages WHERE body = 'message récent'").get() as { n: number }).n).toBe(1);
  });
});
