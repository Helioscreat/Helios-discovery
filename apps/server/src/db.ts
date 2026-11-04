import { DatabaseSync } from "node:sqlite";

/**
 * Schéma de données (SQL standard, transposable tel quel à PostgreSQL en production — hébergement UE).
 * Minimisation (RGPD art. 5(1)(c)) : identifiant pseudonyme, aucun nom, e-mail ni téléphone sur le joueur ;
 * seul le mois de naissance est conservé (pas la date exacte) ; le jeton de session est stocké haché.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  country TEXT NOT NULL,
  birth_month TEXT,
  age_set_at INTEGER,
  nickname TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  chat_muted_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS consents (
  player_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  version TEXT NOT NULL,
  analytics INTEGER NOT NULL,
  -- Statut renvoyé par Google UMP (UNKNOWN, REQUIRED, OBTAINED, NOT_REQUIRED) ; le détail (chaîne TC) reste sur l'appareil.
  ads_status TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  order_id TEXT PRIMARY KEY,
  player_ref TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  eur_cents INTEGER NOT NULL,
  at INTEGER NOT NULL,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (team_id TEXT NOT NULL, player_id TEXT NOT NULL, PRIMARY KEY (team_id, player_id));
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  at INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS blocks (player_id TEXT NOT NULL, blocked_id TEXT NOT NULL, PRIMARY KEY (player_id, blocked_id));
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_player_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  at INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  target_player_id TEXT NOT NULL,
  restriction TEXT NOT NULL,
  facts TEXT NOT NULL,
  automated INTEGER NOT NULL,
  ground_type TEXT NOT NULL,
  ground_ref TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  assigned_to TEXT NOT NULL,
  status TEXT NOT NULL,
  outcome TEXT
);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  email TEXT,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  lang TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS remote_config (version INTEGER PRIMARY KEY, json TEXT NOT NULL, at INTEGER NOT NULL, author TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deletion_requests (player_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, due_at INTEGER NOT NULL, done_at INTEGER);
`;

/**
 * Tables contenant des données personnelles, avec la colonne qui désigne le joueur.
 * Source unique pour l'export (art. 15/20) et l'effacement (art. 17). Toute nouvelle table personnelle doit
 * figurer ici : un test vérifie que chaque table du schéma est classée.
 */
export const PERSONAL_TABLES: { table: string; column: string }[] = [
  { table: "players", column: "id" },
  { table: "consents", column: "player_id" },
  { table: "team_members", column: "player_id" },
  { table: "messages", column: "player_id" },
  { table: "blocks", column: "player_id" },
  { table: "blocks", column: "blocked_id" },
  { table: "reports", column: "reporter_id" },
  { table: "reports", column: "target_player_id" },
  { table: "decisions", column: "target_player_id" },
  { table: "appeals", column: "player_id" },
  { table: "notifications", column: "player_id" },
  { table: "tickets", column: "player_id" },
  { table: "events", column: "player_id" },
];

/** Tables conservées sous forme pseudonymisée après effacement (obligation comptable, C. com. L123-22). */
export const PSEUDONYMIZED_TABLES: { table: string; column: string }[] = [{ table: "ledger", column: "player_ref" }];

/** Tables techniques sans donnée personnelle après effacement. */
export const TECHNICAL_TABLES = ["deletion_requests", "remote_config"];

export type Db = DatabaseSync;

export function openDb(path = ":memory:"): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

export function tableNames(db: Db): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
}
