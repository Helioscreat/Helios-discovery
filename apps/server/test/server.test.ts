import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi, openDb, PERSONAL_TABLES, PSEUDONYMIZED_TABLES, Service, tableNames, TECHNICAL_TABLES } from "../src";

let now = Date.UTC(2026, 10, 4, 12);
const db = openDb();
const svc = new Service(db, {
  clock: () => now,
  deletionDelayMs: 7 * 86_400_000,
  moderators: ["mod-a", "mod-b"],
  contact: { email: "contact@helios-discovery.example", languages: ["fr", "en"] },
  minorCapCents: 2000,
});
const server = createApi(svc, { allowedOrigins: ["http://app.test"] });
let base = "";

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function call(method: string, path: string, body?: unknown, token?: string, mod?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(mod ? { "x-moderator-key": mod } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, any> };
}

const yearsAgo = (y: number) => `${new Date(now).getUTCFullYear() - y}-01-15`;

async function player(age: number, country = "FR") {
  const a = (await call("POST", "/v1/accounts", { country })).json as { id: string; token: string };
  await call("POST", "/v1/me/age", { birth: yearsAgo(age) }, a.token);
  return a;
}

describe("comptes et âge", () => {
  it("[T-GDPR-01] minimisation : identifiant pseudonyme ; aucune colonne nom, e-mail ou téléphone sur le joueur ; jeton haché", async () => {
    const cols = (db.prepare("PRAGMA table_info(players)").all() as { name: string }[]).map((c) => c.name);
    // Le pseudonyme (nickname) est autorisé ; aucune donnée d'identité réelle.
    expect(cols.filter((c) => /^(email|phone|name|first_name|last_name|full_name|address|birth_date|dob|ip)$/i.test(c))).toEqual([]);
    expect(cols).toContain("birth_month");
    const a = (await call("POST", "/v1/accounts", { country: "FR" })).json;
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = db.prepare("SELECT token_hash FROM players WHERE id = ?").get(a.id) as { token_hash: string };
    expect(row.token_hash).not.toBe(a.token);
  });

  it("[T-AGE-02] l'âge ne peut être déclaré qu'une fois (409 ensuite) ; seul le mois de naissance est conservé", async () => {
    const a = (await call("POST", "/v1/accounts", { country: "FR" })).json;
    const first = await call("POST", "/v1/me/age", { birth: "2012-03-09" }, a.token);
    expect(first.status).toBe(200);
    expect(first.json.age).toMatchObject({ band: "minor", underConsentAge: true });
    expect((await call("POST", "/v1/me/age", { birth: "1990-01-01" }, a.token)).status).toBe(409);
    expect((db.prepare("SELECT birth_month FROM players WHERE id = ?").get(a.id) as { birth_month: string }).birth_month).toBe("2012-03");
    expect((await call("GET", "/v1/me", undefined, a.token)).json.age.band).toBe("minor");
  });

  it("consentement normalisé côté serveur : un mineur ne peut pas activer la pub personnalisée", async () => {
    const m = await player(16);
    const r = await call("POST", "/v1/me/consent", { analytics: true, adsPersonalized: true, adsNonPersonalized: true }, m.token);
    expect(r.json.consent).toEqual({ analytics: true, adsPersonalized: false, adsNonPersonalized: true });
    const u = await player(14);
    expect((await call("POST", "/v1/me/consent", { analytics: true, adsPersonalized: true, adsNonPersonalized: true }, u.token)).json.consent).toEqual({ analytics: false, adsPersonalized: false, adsNonPersonalized: false });
  });
});

describe("achats", () => {
  it("[T-AGE-07] le serveur refuse l'autorisation d'achat au-delà du plafond mensuel d'un joueur protégé", async () => {
    const m = await player(15);
    for (let k = 0; k < 2; k++) {
      const auth = await call("POST", "/v1/purchases/authorize", { skuId: "boosters_m" }, m.token);
      expect(auth.json.allowed).toBe(true);
      const id = `GPA-${k}`;
      await call("POST", "/v1/purchases/verify", { receipt: { platform: "mock", orderId: id, skuId: "boosters_m", token: `signed:${id}:boosters_m` } }, m.token);
    }
    expect((await call("POST", "/v1/purchases/authorize", { skuId: "extra_moves" }, m.token)).json).toEqual({ allowed: false, reason: "cap" });
    const adult = await player(30);
    expect((await call("POST", "/v1/purchases/authorize", { skuId: "boosters_xl" }, adult.token)).json.allowed).toBe(true);
    now += 31 * 86_400_000;
    expect((await call("POST", "/v1/purchases/authorize", { skuId: "extra_moves" }, m.token)).json.allowed).toBe(true);
  });

  it("reçu falsifié rejeté par le serveur ; reçu valide crédité une seule fois", async () => {
    const a = await player(30);
    expect((await call("POST", "/v1/purchases/verify", { receipt: { platform: "mock", orderId: "X", skuId: "lives_1h", token: "forged" } }, a.token)).status).toBe(422);
    const ok = { receipt: { platform: "mock", orderId: "Y", skuId: "lives_1h", token: "signed:Y:lives_1h" } };
    expect((await call("POST", "/v1/purchases/verify", ok, a.token)).json.credited).toBe(true);
    expect((await call("POST", "/v1/purchases/verify", ok, a.token)).json.credited).toBe(false);
  });
});

describe("chat d'équipe", () => {
  it("[T-AGE-09] moins de 16 ans : texte libre refusé (403), message prédéfini accepté", async () => {
    const kid = await player(15);
    await call("POST", "/v1/teams/t1/join", {}, kid.token);
    expect((await call("POST", "/v1/teams/t1/messages", { text: "salut tout le monde" }, kid.token)).status).toBe(403);
    expect((await call("POST", "/v1/teams/t1/messages", { presetId: "thanks" }, kid.token)).status).toBe(200);
    const teen = await player(16);
    await call("POST", "/v1/teams/t1/join", {}, teen.token);
    expect((await call("POST", "/v1/teams/t1/messages", { text: "salut tout le monde" }, teen.token)).status).toBe(200);
  });

  it("filtre : grossièretés et données personnelles refusées ; un auteur bloqué disparaît du fil", async () => {
    const a = await player(20), b = await player(21);
    for (const p of [a, b]) await call("POST", "/v1/teams/t2/join", {}, p.token);
    expect((await call("POST", "/v1/teams/t2/messages", { text: "espèce de c0nnard" }, a.token)).json.error).toBe("message.profanity");
    expect((await call("POST", "/v1/teams/t2/messages", { text: "écris-moi sur lea@mail.com" }, a.token)).json.error).toBe("message.personalData");
    await call("POST", "/v1/teams/t2/messages", { text: "bonne chance" }, a.token);
    expect((await call("GET", "/v1/teams/t2/messages", undefined, b.token)).json).toHaveLength(1);
    await call("POST", "/v1/blocks", { playerId: a.id }, b.token);
    expect((await call("GET", "/v1/teams/t2/messages", undefined, b.token)).json).toHaveLength(0);
  });
});

describe("signalement, décision motivée, recours (DSA)", () => {
  it("[T-DSA-02] un signalement sur un message ou un profil crée un dossier et renvoie un accusé de réception", async () => {
    const a = await player(25), b = await player(26);
    for (const p of [a, b]) await call("POST", "/v1/teams/t3/join", {}, p.token);
    const msg = (await call("POST", "/v1/teams/t3/messages", { text: "tu joues comme un pied" }, a.token)).json;
    const r1 = await call("POST", "/v1/reports", { targetType: "message", targetId: msg.id, reason: "insult" }, b.token);
    expect(r1.status).toBe(200);
    expect(r1.json).toMatchObject({ id: expect.any(String), receivedAt: expect.any(Number) });
    const r2 = await call("POST", "/v1/reports", { targetType: "profile", targetId: a.id, reason: "harassment", details: "messages répétés" }, b.token);
    expect(r2.status).toBe(200);
    const notes = (await call("GET", "/v1/me/notifications", undefined, b.token)).json;
    expect(notes.filter((n: { kind: string }) => n.kind === "reportReceived")).toHaveLength(2);
  });

  it("[T-DSA-03] décision refusée sans faits ni fondement ; acceptée et motivée (art. 17(3)) puis notifiée et appliquée", async () => {
    const a = await player(25), b = await player(26);
    for (const p of [a, b]) await call("POST", "/v1/teams/t4/join", {}, p.token);
    const msg = (await call("POST", "/v1/teams/t4/messages", { text: "message à modérer" }, a.token)).json;
    const rep = (await call("POST", "/v1/reports", { targetType: "message", targetId: msg.id, reason: "harassment" }, b.token)).json;
    expect((await call("POST", "/v1/moderation/decisions", { reportId: rep.id, restriction: "removeContent", facts: "x", automated: false, ground: null }, undefined, "mod-a")).status).toBe(422);
    expect((await call("POST", "/v1/moderation/decisions", { reportId: rep.id, restriction: "removeContent", facts: "Harcèlement répété envers un membre.", automated: false, ground: { type: "tos", clause: "CGU 4.2" } }, undefined, "intrus")).status).toBe(403);
    const dec = await call("POST", "/v1/moderation/decisions", { reportId: rep.id, restriction: "removeContent", facts: "Harcèlement répété envers un membre.", automated: false, ground: { type: "tos", clause: "CGU 4.2" } }, undefined, "mod-a");
    expect(dec.status).toBe(200);
    const note = (await call("GET", "/v1/me/notifications", undefined, a.token)).json.find((n: { kind: string }) => n.kind === "decision");
    expect(note.body).toMatchObject({ restriction: "removeContent", facts: expect.any(String), automated: false, ground: { type: "tos", clause: "CGU 4.2" }, redress: ["internalAppeal", "outOfCourtSettlement", "judicialRedress"] });
    expect((await call("GET", "/v1/teams/t4/messages", undefined, b.token)).json).toHaveLength(0);
  });

  it("[T-DSA-04] recours : assigné à un modérateur différent ; l'annulation rétablit le contenu", async () => {
    const a = await player(25), b = await player(26);
    for (const p of [a, b]) await call("POST", "/v1/teams/t5/join", {}, p.token);
    const msg = (await call("POST", "/v1/teams/t5/messages", { text: "message contesté" }, a.token)).json;
    const rep = (await call("POST", "/v1/reports", { targetType: "message", targetId: msg.id, reason: "spam" }, b.token)).json;
    const dec = (await call("POST", "/v1/moderation/decisions", { reportId: rep.id, restriction: "removeContent", facts: "Message promotionnel répété.", automated: true, ground: { type: "tos", clause: "CGU 4.5" } }, undefined, "mod-a")).json;
    const ap = (await call("POST", "/v1/appeals", { decisionId: dec.id, text: "Ce n'était pas du spam." }, a.token)).json;
    expect(ap.assignedTo).toBe("mod-b");
    expect((await call("POST", `/v1/moderation/appeals/${ap.id}/resolve`, { outcome: "reversed", facts: "Message unique, pas de spam." }, undefined, "mod-a")).status).toBe(403);
    expect((await call("POST", `/v1/moderation/appeals/${ap.id}/resolve`, { outcome: "reversed", facts: "Message unique, pas de spam." }, undefined, "mod-b")).status).toBe(200);
    expect((await call("GET", "/v1/teams/t5/messages", undefined, b.token)).json).toHaveLength(1);
    const notes = (await call("GET", "/v1/me/notifications", undefined, a.token)).json;
    expect(notes.some((n: { kind: string; body: { outcome: string } }) => n.kind === "appealResolved" && n.body.outcome === "reversed")).toBe(true);
  });
});

describe("point de contact (DSA art. 11-12)", () => {
  it("[T-DSA-01] coordonnées publiques (e-mail, formulaire, langues) ; formulaire accessible sans compte ; un ticket est créé", async () => {
    const cp = (await call("GET", "/v1/contact")).json;
    expect(cp).toMatchObject({ email: expect.stringMatching(/@/), form: "/v1/contact", languages: expect.arrayContaining(["fr", "en"]) });
    const t = await call("POST", "/v1/contact", { topic: "authority", message: "Demande d'une autorité nationale.", email: "autorite@example.eu", lang: "fr" });
    expect(t.status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) n FROM tickets WHERE id = ?").get(t.json.id)).toEqual({ n: 1 });
  });
});

describe("droits RGPD", () => {
  it("[T-GDPR-06] l'export JSON couvre toutes les tables personnelles du joueur, sans le jeton", async () => {
    const a = await player(30);
    await call("POST", "/v1/me/consent", { analytics: true }, a.token);
    await call("POST", "/v1/teams/t6/join", {}, a.token);
    await call("POST", "/v1/teams/t6/messages", { text: "bonjour" }, a.token);
    const ex = (await call("GET", "/v1/me/export", undefined, a.token)).json;
    for (const { table, column } of [...PERSONAL_TABLES, ...PSEUDONYMIZED_TABLES]) expect(ex, `${table}.${column}`).toHaveProperty(`${table}.${column}`);
    expect(ex["players.id"][0]).not.toHaveProperty("token_hash");
    expect(ex["messages.player_id"]).toHaveLength(1);
    expect(ex["consents.player_id"]).toHaveLength(1);
  });

  it("chaque table du schéma est classée (personnelle, pseudonymisée ou technique)", () => {
    const classified = new Set([...PERSONAL_TABLES.map((t) => t.table), ...PSEUDONYMIZED_TABLES.map((t) => t.table), ...TECHNICAL_TABLES]);
    for (const t of tableNames(db)) expect(classified.has(t), t).toBe(true);
  });

  it("[T-GDPR-07] effacement : compte verrouillé tout de suite ; à l'échéance (7 j), 0 ligne liée au joueur ; grand livre pseudonymisé", async () => {
    const a = await player(30), b = await player(31);
    for (const p of [a, b]) await call("POST", "/v1/teams/t7/join", {}, p.token);
    await call("POST", "/v1/me/consent", { analytics: true }, a.token);
    const m = (await call("POST", "/v1/teams/t7/messages", { text: "bonjour" }, a.token)).json;
    await call("POST", "/v1/reports", { targetType: "message", targetId: m.id, reason: "other" }, b.token);
    await call("POST", "/v1/blocks", { playerId: b.id }, a.token);
    await call("POST", "/v1/purchases/verify", { receipt: { platform: "mock", orderId: "DEL-1", skuId: "lives_1h", token: "signed:DEL-1:lives_1h" } }, a.token);
    await call("POST", "/v1/contact", { topic: "privacy", message: "Question sur mes données." }, a.token);
    const del = await call("POST", "/v1/me/delete", {}, a.token);
    expect(del.json.dueAt - now).toBeLessThanOrEqual(30 * 86_400_000);
    expect((await call("GET", "/v1/me", undefined, a.token)).status).toBe(410);
    expect(svc.runDeletionJob()).toBe(0); // pas encore à l'échéance
    now += 7 * 86_400_000;
    expect(svc.runDeletionJob()).toBe(1);
    for (const { table, column } of PERSONAL_TABLES) {
      const n = (db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column} = ?`).get(a.id) as { n: number }).n;
      expect(n, `${table}.${column}`).toBe(0);
    }
    // Aucune colonne d'aucune table ne contient plus l'identifiant (recherche exhaustive).
    for (const t of tableNames(db)) {
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      for (const c of cols) expect((db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE CAST(${c} AS TEXT) LIKE ?`).get(`%${a.id}%`) as { n: number }).n, `${t}.${c}`).toBe(0);
    }
    const ledger = db.prepare("SELECT player_ref FROM ledger WHERE order_id = 'DEL-1'").get() as { player_ref: string };
    expect(ledger.player_ref).toMatch(/^deleted:/);
    expect((await call("GET", "/v1/me", undefined, b.token)).status).toBe(200); // les autres joueurs ne sont pas touchés
  });
});
