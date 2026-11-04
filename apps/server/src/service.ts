import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ageFromBirth, ageFromBirthMonth, ageProfile, checkMessage, checkNickname, CONSENT_NOTICE_VERSION, normalizeConsent, PRESET_MESSAGES,
  REPORT_REASONS, statementOfReasons, UNKNOWN_AGE, validateDecision, type AgeProfile, type ConsentChoice, type DecisionInput, type ReportReason,
} from "@helios/compliance";
import { applyVerified, CATALOG, MockVerifier, newWallet, purchaseGate, skuById, type Receipt } from "@helios/economy";
import { PERSONAL_TABLES, PSEUDONYMIZED_TABLES, type Db } from "./db";

/** Erreur métier → code HTTP. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) {
    super(message);
  }
}

export interface ServiceConfig {
  clock: () => number;
  /** Délai entre la demande d'effacement et l'effacement effectif (≤ 30 jours ; 7 jours ici). */
  deletionDelayMs: number;
  moderators: string[];
  contact: { email: string; languages: string[] };
  minorCapCents: number;
  verifier?: { verify(r: Receipt): Promise<{ orderId: string; skuId: string; state: "purchased" | "pending" | "refunded" | "invalid"; eurCents: number; at: number }> };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

interface PlayerRow {
  id: string;
  country: string;
  birth_month: string | null;
  nickname: string | null;
  locked: number;
  chat_muted_until: number;
  created_at: number;
  age_set_at: number | null;
}

export class Service {
  private readonly verifier: NonNullable<ServiceConfig["verifier"]>;

  constructor(readonly db: Db, readonly cfg: ServiceConfig) {
    this.verifier = cfg.verifier ?? new MockVerifier(Object.fromEntries(CATALOG.map((s) => [s.id, s.referenceEurCents])), cfg.clock);
  }

  // ───────────── comptes ─────────────
  createAccount(country: string): { id: string; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString("hex");
    this.db.prepare("INSERT INTO players (id, token_hash, created_at, country) VALUES (?, ?, ?, ?)").run(id, sha(token), this.cfg.clock(), (country || "FR").slice(0, 2).toUpperCase());
    return { id, token };
  }

  authenticate(token: string | undefined): PlayerRow {
    if (!token) throw new ApiError(401, "unauthenticated");
    const p = this.db.prepare("SELECT * FROM players WHERE token_hash = ?").get(sha(token)) as PlayerRow | undefined;
    if (!p) throw new ApiError(401, "unauthenticated");
    if (p.locked) throw new ApiError(410, "accountDeleted", "compte en cours d'effacement");
    return p;
  }

  ageOf(p: PlayerRow): AgeProfile {
    if (!p.birth_month) return UNKNOWN_AGE;
    return ageProfile(ageFromBirthMonth(p.birth_month, this.cfg.clock()), p.country);
  }

  me(p: PlayerRow) {
    const c = this.latestConsent(p.id);
    return { id: p.id, country: p.country, nickname: p.nickname, age: this.ageOf(p), consent: c };
  }

  /**
   * Âge déclaré une seule fois (AGE-02) : une nouvelle déclaration est refusée (409), y compris après effacement
   * du cache local, tant que le compte existe. Seul le mois de naissance est conservé.
   */
  setAge(p: PlayerRow, birth: string): AgeProfile {
    if (p.birth_month) throw new ApiError(409, "ageAlreadySet", "âge déjà déclaré : modification via le support");
    const age = ageFromBirth(birth, this.cfg.clock());
    if (age === null) throw new ApiError(400, "invalidBirth");
    this.db.prepare("UPDATE players SET birth_month = ?, age_set_at = ? WHERE id = ?").run(birth.slice(0, 7), this.cfg.clock(), p.id);
    return ageProfile(age, p.country);
  }

  // ───────────── consentement (journalisé, preuve art. 7(1)) ─────────────
  latestConsent(id: string): (ConsentChoice & { version: string; at: number }) | null {
    const r = this.db.prepare("SELECT * FROM consents WHERE player_id = ? ORDER BY at DESC, rowid DESC LIMIT 1").get(id) as
      | { analytics: number; ads_personalized: number; ads_non_personalized: number; version: string; at: number }
      | undefined;
    return r ? { analytics: !!r.analytics, adsPersonalized: !!r.ads_personalized, adsNonPersonalized: !!r.ads_non_personalized, version: r.version, at: r.at } : null;
  }

  setConsent(p: PlayerRow, choice: Partial<ConsentChoice>): ConsentChoice {
    const c = normalizeConsent(this.ageOf(p), choice);
    this.db.prepare("INSERT INTO consents VALUES (?, ?, ?, ?, ?, ?)").run(p.id, this.cfg.clock(), CONSENT_NOTICE_VERSION, +c.analytics, +c.adsPersonalized, +c.adsNonPersonalized);
    return c;
  }

  setNickname(p: PlayerRow, nickname: string): string {
    const r = checkNickname(nickname);
    if (!r.ok) throw new ApiError(422, `nickname.${r.reason}`);
    this.db.prepare("UPDATE players SET nickname = ? WHERE id = ?").run(nickname.trim(), p.id);
    return nickname.trim();
  }

  // ───────────── achats : autorisation (plafond mineurs) et vérification des reçus ─────────────
  ledgerOf(id: string) {
    return (this.db.prepare("SELECT order_id, sku_id, eur_cents, at, state FROM ledger WHERE player_ref = ?").all(id) as { order_id: string; sku_id: string; eur_cents: number; at: number; state: string }[]).map((r) => ({
      orderId: r.order_id, skuId: r.sku_id, eurCents: r.eur_cents, at: r.at, state: r.state as "credited" | "refunded",
    }));
  }

  /** AGE-07 : autorisation demandée avant d'ouvrir le flux de paiement ; cumul calculé sur les reçus vérifiés. */
  authorizePurchase(p: PlayerRow, skuId: string): { allowed: boolean; reason?: string } {
    const sku = skuById(skuId);
    const band = this.ageOf(p).band;
    const owned = this.ledgerOf(p.id).filter((e) => e.state === "credited").map((e) => e.skuId);
    const g = purchaseGate(band, this.ledgerOf(p.id), sku, sku.kind === "oneTime" ? owned : [], this.cfg.clock(), this.cfg.minorCapCents);
    return g.allowed ? { allowed: true } : { allowed: false, reason: g.reason };
  }

  async verifyPurchase(p: PlayerRow, receipt: Receipt): Promise<{ credited: boolean; state: string }> {
    const v = await this.verifier.verify(receipt);
    const acc = { wallet: newWallet(this.cfg.clock()), ledger: this.ledgerOf(p.id) };
    const r = applyVerified(acc, v, this.cfg.clock());
    if (!r.ok) throw new ApiError(422, "receiptInvalid", r.reason);
    for (const e of r.account.ledger) {
      this.db.prepare("INSERT INTO ledger VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET state = excluded.state").run(e.orderId, p.id, e.skuId, e.eurCents, e.at, e.state);
    }
    return { credited: r.credited, state: v.state };
  }

  // ───────────── chat d'équipe ─────────────
  joinTeam(p: PlayerRow, teamId: string): void {
    this.db.prepare("INSERT OR IGNORE INTO team_members VALUES (?, ?)").run(teamId, p.id);
  }

  private member(p: PlayerRow, teamId: string): void {
    if (!this.db.prepare("SELECT 1 FROM team_members WHERE team_id = ? AND player_id = ?").get(teamId, p.id)) throw new ApiError(403, "notMember");
  }

  /** AGE-09 : sous 16 ans, messages prédéfinis seulement ; filtre de texte (DSA-07) ; chat suspendu après décision. */
  postMessage(p: PlayerRow, teamId: string, body: { presetId?: string; text?: string }): { id: string } {
    this.member(p, teamId);
    if (p.chat_muted_until > this.cfg.clock()) throw new ApiError(403, "chatMuted");
    const id = randomUUID();
    if (body.presetId !== undefined) {
      if (!(PRESET_MESSAGES as readonly string[]).includes(body.presetId)) throw new ApiError(400, "unknownPreset");
      this.db.prepare("INSERT INTO messages (id, team_id, player_id, kind, body, at) VALUES (?, ?, ?, 'preset', ?, ?)").run(id, teamId, p.id, body.presetId, this.cfg.clock());
      return { id };
    }
    if (this.ageOf(p).chatRestricted) throw new ApiError(403, "freeTextRestricted", "texte libre réservé aux 16 ans et plus");
    const check = checkMessage(body.text ?? "");
    if (!check.ok) throw new ApiError(422, `message.${check.reason}`);
    this.db.prepare("INSERT INTO messages (id, team_id, player_id, kind, body, at) VALUES (?, ?, ?, 'text', ?, ?)").run(id, teamId, p.id, (body.text ?? "").trim(), this.cfg.clock());
    return { id };
  }

  /** Messages visibles : hors contenus retirés et auteurs bloqués ; aucune donnée personnelle (pseudonyme seulement). */
  messages(p: PlayerRow, teamId: string) {
    this.member(p, teamId);
    return this.db
      .prepare(`SELECT m.id, m.kind, m.body, m.at, m.player_id AS author, pl.nickname FROM messages m JOIN players pl ON pl.id = m.player_id
                WHERE m.team_id = ? AND m.removed = 0 AND m.player_id NOT IN (SELECT blocked_id FROM blocks WHERE player_id = ?) ORDER BY m.at`)
      .all(teamId, p.id);
  }

  block(p: PlayerRow, blockedId: string): void {
    this.db.prepare("INSERT OR IGNORE INTO blocks VALUES (?, ?)").run(p.id, blockedId);
  }

  // ───────────── signalements, décisions motivées, recours (DSA art. 16, 17, 20) ─────────────
  report(p: PlayerRow, body: { targetType: "message" | "profile"; targetId: string; reason: ReportReason; details?: string }): { id: string; receivedAt: number } {
    if (!REPORT_REASONS.includes(body.reason)) throw new ApiError(400, "invalidReason");
    let targetPlayer: string | undefined;
    if (body.targetType === "message") targetPlayer = (this.db.prepare("SELECT player_id FROM messages WHERE id = ?").get(body.targetId) as { player_id: string } | undefined)?.player_id;
    else if (body.targetType === "profile") targetPlayer = (this.db.prepare("SELECT id FROM players WHERE id = ?").get(body.targetId) as { id: string } | undefined)?.id;
    if (!targetPlayer) throw new ApiError(404, "targetNotFound");
    const id = randomUUID();
    const at = this.cfg.clock();
    this.db.prepare("INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')").run(id, p.id, body.targetType, body.targetId, targetPlayer, body.reason, (body.details ?? "").slice(0, 1000), at);
    this.notify(p.id, "reportReceived", { reportId: id, receivedAt: at });
    return { id, receivedAt: at };
  }

  private moderator(key: string | undefined): string {
    if (!key || !this.cfg.moderators.includes(key)) throw new ApiError(403, "notModerator");
    return key;
  }

  /** Décision motivée (art. 17) : refusée sans faits ni fondement ; appliquée ; notifiée à l'auteur et au signaleur. */
  decide(moderatorKey: string | undefined, input: Omit<DecisionInput, "moderatorId">): { id: string } {
    const moderatorId = this.moderator(moderatorKey);
    const d: DecisionInput = { ...input, moderatorId };
    const errors = validateDecision(d);
    if (errors.length) throw new ApiError(422, "invalidDecision", errors.join(" ; "));
    const rep = this.db.prepare("SELECT * FROM reports WHERE id = ?").get(d.reportId) as { target_type: string; target_id: string; target_player_id: string; reporter_id: string } | undefined;
    if (!rep) throw new ApiError(404, "reportNotFound");
    const id = randomUUID();
    const g = d.ground ?? { type: "tos" as const, clause: "CGU 0" };
    this.db.prepare("INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, d.reportId, moderatorId, rep.target_player_id, d.restriction, d.facts, +d.automated, g.type, g.type === "tos" ? g.clause : g.law, this.cfg.clock());
    this.db.prepare("UPDATE reports SET status = 'decided' WHERE id = ?").run(d.reportId);
    if (d.restriction === "removeContent" && rep.target_type === "message") this.db.prepare("UPDATE messages SET removed = 1 WHERE id = ?").run(rep.target_id);
    if (d.restriction === "muteChat7d") this.db.prepare("UPDATE players SET chat_muted_until = ? WHERE id = ?").run(this.cfg.clock() + 7 * 86_400_000, rep.target_player_id);
    if (d.restriction === "renameNickname") this.db.prepare("UPDATE players SET nickname = NULL WHERE id = ?").run(rep.target_player_id);
    const sor = statementOfReasons(d);
    this.notify(rep.target_player_id, "decision", { decisionId: id, ...sor });
    this.notify(rep.reporter_id, "reportDecided", { reportId: d.reportId, restriction: d.restriction });
    return { id };
  }

  /** Recours interne (art. 20) : traité par un modérateur différent de l'auteur de la décision. */
  appeal(p: PlayerRow, decisionId: string, text: string): { id: string; assignedTo: string } {
    const dec = this.db.prepare("SELECT * FROM decisions WHERE id = ?").get(decisionId) as { moderator_id: string; target_player_id: string } | undefined;
    if (!dec || dec.target_player_id !== p.id) throw new ApiError(404, "decisionNotFound");
    const others = this.cfg.moderators.filter((m) => m !== dec.moderator_id);
    if (others.length === 0) throw new ApiError(503, "noIndependentModerator");
    const assignedTo = others[Math.floor(Math.random() * others.length)];
    const id = randomUUID();
    this.db.prepare("INSERT INTO appeals VALUES (?, ?, ?, ?, ?, ?, 'open', NULL)").run(id, decisionId, p.id, text.slice(0, 2000), this.cfg.clock(), assignedTo);
    return { id, assignedTo };
  }

  resolveAppeal(moderatorKey: string | undefined, appealId: string, outcome: "upheld" | "reversed", facts: string): void {
    const m = this.moderator(moderatorKey);
    const a = this.db.prepare("SELECT * FROM appeals WHERE id = ?").get(appealId) as { assigned_to: string; player_id: string; decision_id: string } | undefined;
    if (!a) throw new ApiError(404, "appealNotFound");
    if (a.assigned_to !== m) throw new ApiError(403, "notAssigned");
    if (!facts || facts.trim().length < 10) throw new ApiError(422, "factsRequired");
    this.db.prepare("UPDATE appeals SET status = 'closed', outcome = ? WHERE id = ?").run(outcome, appealId);
    if (outcome === "reversed") {
      const d = this.db.prepare("SELECT r.target_id, r.target_type, d.restriction FROM decisions d JOIN reports r ON r.id = d.report_id WHERE d.id = ?").get(a.decision_id) as { target_id: string; target_type: string; restriction: string };
      if (d.restriction === "removeContent" && d.target_type === "message") this.db.prepare("UPDATE messages SET removed = 0 WHERE id = ?").run(d.target_id);
      if (d.restriction === "muteChat7d") this.db.prepare("UPDATE players SET chat_muted_until = 0 WHERE id = ?").run(a.player_id);
    }
    this.notify(a.player_id, "appealResolved", { appealId, outcome, facts });
  }

  notify(playerId: string, kind: string, body: unknown): void {
    this.db.prepare("INSERT INTO notifications VALUES (?, ?, ?, ?, ?)").run(randomUUID(), playerId, kind, JSON.stringify(body), this.cfg.clock());
  }

  notifications(p: PlayerRow) {
    return (this.db.prepare("SELECT kind, body, at FROM notifications WHERE player_id = ? ORDER BY at").all(p.id) as { kind: string; body: string; at: number }[]).map((n) => ({ ...n, body: JSON.parse(n.body) }));
  }

  // ───────────── point de contact (DSA art. 11-12) ─────────────
  contactPoint() {
    return { email: this.cfg.contact.email, form: "/v1/contact", languages: this.cfg.contact.languages };
  }

  contact(p: PlayerRow | null, body: { topic: string; message: string; email?: string; lang?: string }): { id: string } {
    if (!body.message || body.message.trim().length < 5) throw new ApiError(422, "messageRequired");
    const id = randomUUID();
    this.db.prepare("INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, p?.id ?? null, body.email ?? null, (body.topic || "other").slice(0, 40), body.message.slice(0, 4000), (body.lang || "fr").slice(0, 5), this.cfg.clock());
    return { id };
  }

  // ───────────── droits RGPD : export (art. 15, 20) et effacement (art. 17) ─────────────
  exportData(p: PlayerRow): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const { table, column } of [...PERSONAL_TABLES, ...PSEUDONYMIZED_TABLES]) {
      const rows = this.db.prepare(`SELECT * FROM ${table} WHERE ${column} = ?`).all(p.id) as Record<string, unknown>[];
      const key = `${table}.${column}`;
      out[key] = rows.map((r) => {
        const { token_hash, ...rest } = r as Record<string, unknown> & { token_hash?: unknown };
        void token_hash;
        return rest;
      });
    }
    return out;
  }

  /** Demande d'effacement : compte verrouillé immédiatement, effacement effectif à l'échéance (≤ 30 jours). */
  requestDeletion(p: PlayerRow): { dueAt: number } {
    const now = this.cfg.clock();
    const dueAt = now + this.cfg.deletionDelayMs;
    this.db.prepare("UPDATE players SET locked = 1 WHERE id = ?").run(p.id);
    this.db.prepare("INSERT OR REPLACE INTO deletion_requests VALUES (?, ?, ?, NULL)").run(p.id, now, dueAt);
    return { dueAt };
  }

  /**
   * Tâche quotidienne d'effacement : supprime les lignes de toutes les tables personnelles ;
   * le grand livre est conservé (obligation comptable) mais pseudonymisé, sans lien avec le profil.
   */
  runDeletionJob(): number {
    const now = this.cfg.clock();
    const due = this.db.prepare("SELECT player_id FROM deletion_requests WHERE done_at IS NULL AND due_at <= ?").all(now) as { player_id: string }[];
    for (const { player_id } of due) {
      this.db.exec("BEGIN");
      try {
        for (const { table, column } of PERSONAL_TABLES) this.db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(player_id);
        const alias = `deleted:${randomBytes(12).toString("hex")}`;
        for (const { table, column } of PSEUDONYMIZED_TABLES) this.db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(alias, player_id);
        this.db.prepare("UPDATE deletion_requests SET done_at = ?, player_id = ? WHERE player_id = ?").run(now, `done:${sha(player_id).slice(0, 16)}`, player_id);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
    return due.length;
  }
}
