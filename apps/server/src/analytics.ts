import { randomUUID } from "node:crypto";
import { ageFromBirthMonth } from "@helios/compliance";
import { RETENTION } from "@helios/config";
import type { Db } from "./db";

/**
 * Mesure d'audience first-party (cahier des charges §9), uniquement après consentement.
 * Schéma fermé : seuls ces événements et ces champs sont acceptés (minimisation : aucun texte libre).
 */
type FieldType = "int" | "sku" | "booster" | "result";
export const EVENT_SCHEMA: Record<string, Record<string, FieldType>> = {
  level_start: { n: "int", boosters: "int" },
  level_win: { n: "int", stars: "int", movesLeft: "int", boosters: "int" },
  level_fail: { n: "int", boosters: "int" },
  purchase: { sku: "sku", eurCents: "int" },
  booster_use: { n: "int", booster: "booster" },
  season_tier: { tier: "int" },
  session_length: { seconds: "int" },
};

const BOOSTERS = ["hammer", "bomb", "rainbow", "fireCross", "shuffler", "starterKit"];

export function validateEvent(name: string, data: Record<string, unknown>): string | null {
  const schema = EVENT_SCHEMA[name];
  if (!schema) return `événement inconnu : ${name}`;
  for (const [k, v] of Object.entries(data)) {
    const t = schema[k];
    if (!t) return `champ non autorisé : ${k}`;
    if (t === "int" && !(Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e7)) return `champ ${k} : entier attendu`;
    if (t === "sku" && !(typeof v === "string" && /^[a-z0-9_]{2,40}$/.test(v))) return `champ ${k} : identifiant d'article attendu`;
    if (t === "booster" && !BOOSTERS.includes(v as string)) return `champ ${k} : booster attendu`;
  }
  return null;
}

export function storeEvent(db: Db, playerId: string, name: string, data: Record<string, unknown>, at: number): void {
  db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?)").run(randomUUID(), playerId, name, JSON.stringify(data), at);
}

/** Purge quotidienne selon les durées de conservation (GDPR-09) : source unique `RETENTION`. */
export function runRetentionJob(db: Db, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of RETENTION) {
    const res = db.prepare(`DELETE FROM ${r.table} WHERE ${r.column} < ?`).run(now - r.days * 86_400_000);
    out[r.table] = Number(res.changes);
  }
  return out;
}

export interface Thresholds {
  /** Part maximale des revenus provenant de joueurs mineurs déclarés. */
  minorRevenueShare: number;
  /** Nombre maximal de mineurs ayant atteint le plafond mensuel. */
  minorsAtCap: number;
  /** Part maximale des sessions de plus de 3 heures. */
  longSessionShare: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { minorRevenueShare: 0.05, minorsAtCap: 0, longSessionShare: 0.02 };

export interface Dashboard {
  funnel: { n: number; starts: number; wins: number; fails: number; winRate: number | null }[];
  premiumConversion: number | null;
  retention: { d1: number | null; d7: number | null; d30: number | null; cohort: number };
  protection: { minorRevenueShare: number | null; minorsAtCap: number; longSessionShare: number | null; revenueCents30d: number };
  alerts: { indicator: keyof Thresholds; value: number; threshold: number }[];
}

const DAY = 86_400_000;

/**
 * Tableau de bord (§9) : entonnoir par niveau, conversion Premium, rétention D1/D7/D30, indicateurs de protection.
 * Les indicateurs de protection reposent sur le grand livre (achats vérifiés : base légale « obligation »
 * et « contrat ») et sur les sessions des joueurs ayant consenti à la mesure d'audience. Tout est agrégé.
 */
export function dashboard(db: Db, now: number, capFor: (country: string) => number, th: Thresholds = DEFAULT_THRESHOLDS): Dashboard {
  const funnel = (db.prepare(`
    SELECT json_extract(data, '$.n') AS n,
      SUM(name = 'level_start') AS starts, SUM(name = 'level_win') AS wins, SUM(name = 'level_fail') AS fails
    FROM events WHERE name IN ('level_start', 'level_win', 'level_fail') GROUP BY n ORDER BY n`).all() as { n: number; starts: number; wins: number; fails: number }[])
    .map((r) => ({ ...r, winRate: r.wins + r.fails > 0 ? r.wins / (r.wins + r.fails) : null }));

  const active = (db.prepare("SELECT COUNT(DISTINCT player_id) n FROM events WHERE at >= ?").get(now - 30 * DAY) as { n: number }).n;
  const premium = (db.prepare("SELECT COUNT(DISTINCT player_id) n FROM events WHERE name = 'purchase' AND json_extract(data, '$.sku') LIKE 'pass_%' AND at >= ?").get(now - 30 * DAY) as { n: number }).n;

  // Rétention : cohorte des joueurs dont le premier événement date d'au moins 30 jours.
  const firsts = db.prepare("SELECT player_id, MIN(at) first FROM events GROUP BY player_id HAVING first <= ?").all(now - 30 * DAY) as { player_id: string; first: number }[];
  const back = (days: number) => {
    if (firsts.length === 0) return null;
    let n = 0;
    for (const f of firsts) {
      const day0 = Math.floor(f.first / DAY);
      if (db.prepare("SELECT 1 FROM events WHERE player_id = ? AND at >= ? AND at < ?").get(f.player_id, (day0 + days) * DAY, (day0 + days + 1) * DAY)) n++;
    }
    return n / firsts.length;
  };

  // Protection : revenus des 30 derniers jours par tranche d'âge (mois de naissance conservé).
  const rows = db.prepare(`SELECT l.player_ref, l.eur_cents, p.birth_month FROM ledger l LEFT JOIN players p ON p.id = l.player_ref WHERE l.state = 'credited' AND l.at >= ?`).all(now - 30 * DAY) as { player_ref: string; eur_cents: number; birth_month: string | null }[];
  const total = rows.reduce((a, r) => a + r.eur_cents, 0);
  const isMinor = (bm: string | null) => bm !== null && (ageFromBirthMonth(bm, now) ?? 99) < 18;
  const minorCents = rows.filter((r) => isMinor(r.birth_month)).reduce((a, r) => a + r.eur_cents, 0);
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const perMinor = db.prepare(`SELECT l.player_ref, SUM(l.eur_cents) s, p.birth_month, p.country FROM ledger l JOIN players p ON p.id = l.player_ref WHERE l.state = 'credited' AND l.at >= ? GROUP BY l.player_ref`).all(monthStart) as { s: number; birth_month: string | null; country: string }[];
  // Plafond du pays de chaque joueur (config distante par pays).
  const minorsAtCap = perMinor.filter((r) => isMinor(r.birth_month) && r.s >= capFor(r.country)).length;
  const sessions = db.prepare("SELECT json_extract(data, '$.seconds') s FROM events WHERE name = 'session_length' AND at >= ?").all(now - 30 * DAY) as { s: number }[];
  const longShare = sessions.length ? sessions.filter((x) => x.s > 3 * 3600).length / sessions.length : null;

  const protection = { minorRevenueShare: total ? minorCents / total : null, minorsAtCap, longSessionShare: longShare, revenueCents30d: total };
  const alerts: Dashboard["alerts"] = [];
  if (protection.minorRevenueShare !== null && protection.minorRevenueShare > th.minorRevenueShare) alerts.push({ indicator: "minorRevenueShare", value: protection.minorRevenueShare, threshold: th.minorRevenueShare });
  if (minorsAtCap > th.minorsAtCap) alerts.push({ indicator: "minorsAtCap", value: minorsAtCap, threshold: th.minorsAtCap });
  if (longShare !== null && longShare > th.longSessionShare) alerts.push({ indicator: "longSessionShare", value: longShare, threshold: th.longSessionShare });

  return {
    funnel,
    premiumConversion: active ? premium / active : null,
    retention: { d1: back(1), d7: back(7), d30: back(30), cohort: firsts.length },
    protection,
    alerts,
  };
}
