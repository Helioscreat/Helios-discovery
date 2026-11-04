import {
  ageFromBirth, ageProfile, allowedSdks, normalizeConsent, REFUSE_ALL, showConsentScreen, UNKNOWN_AGE, type AgeProfile, type ConsentChoice,
} from "@helios/compliance";

/**
 * État de conformité du joueur sur l'appareil : âge (tranche seulement), consentement, compte serveur.
 * Ordre au premier lancement : écran d'âge → consentement (si au moins une finalité est proposable) → jeu.
 * Aucun SDK tiers n'est initialisé avant la décision de consentement (GDPR-03).
 */
export interface ComplianceState {
  ageSet: boolean;
  age: AgeProfile;
  consent: ConsentChoice;
  consentDecided: boolean;
  country: string;
  account: { id: string; token: string } | null;
}

const KEY = "helios.compliance.v1";
const TOKEN_KEY = "helios.account.v1";

export function detectCountry(langs: readonly string[]): string {
  for (const l of langs) {
    const m = /-([A-Za-z]{2})$/.exec(l);
    if (m) return m[1].toUpperCase();
  }
  return "FR";
}

export function loadCompliance(country: string): ComplianceState {
  let account: ComplianceState["account"] = null;
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) account = JSON.parse(t);
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...(JSON.parse(raw) as ComplianceState), account };
  } catch {
    /* stockage indisponible */
  }
  return { ageSet: false, age: UNKNOWN_AGE, consent: REFUSE_ALL, consentDecided: false, country, account };
}

export function saveCompliance(c: ComplianceState): void {
  try {
    const { account, ...rest } = c;
    localStorage.setItem(KEY, JSON.stringify(rest));
    if (account) localStorage.setItem(TOKEN_KEY, JSON.stringify(account));
  } catch {
    /* stockage indisponible */
  }
}

/** Écran suivant du parcours d'entrée. */
export function nextOnboardingStep(c: ComplianceState): "age" | "consent" | "done" {
  if (!c.ageSet) return "age";
  if (!c.consentDecided && showConsentScreen(c.age)) return "consent";
  return "done";
}

/** Applique la date de naissance : seule la tranche est gardée sur l'appareil. Sous le seuil national : tout refusé. */
export function applyBirth(c: ComplianceState, birth: string, now: number): ComplianceState | null {
  const age = ageFromBirth(birth, now);
  if (age === null) return null;
  const profile = ageProfile(age, c.country);
  const decided = !showConsentScreen(profile);
  return { ...c, ageSet: true, age: profile, consent: decided ? REFUSE_ALL : c.consent, consentDecided: decided };
}

export function applyConsent(c: ComplianceState, choice: Partial<ConsentChoice>): ComplianceState {
  return { ...c, consent: normalizeConsent(c.age, choice), consentDecided: true };
}

export const sdksFor = (c: ComplianceState) => allowedSdks(c.consentDecided, c.age, c.consent);

// ───────────────────────── client de l'API (serveur hébergé dans l'UE) ─────────────────────────
export class Api {
  constructor(readonly base: string | null) {}

  get online(): boolean {
    return this.base !== null;
  }

  private async call<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
    if (!this.base) throw new Error("hors ligne");
    const res = await fetch(this.base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { status: res.status, code: json.error });
    return json;
  }

  /** Compte pseudonyme : créé au premier lancement (traitement strictement nécessaire, sans consentement). */
  async ensureAccount(c: ComplianceState): Promise<ComplianceState> {
    if (!this.online || c.account) return c;
    const a = await this.call<{ id: string; token: string }>("POST", "/v1/accounts", null, { country: c.country });
    return { ...c, account: a };
  }

  /** Compte existant dont le cache local a été effacé : l'âge déjà déclaré est récupéré, l'écran d'âge ne revient pas. */
  async restore(c: ComplianceState): Promise<ComplianceState> {
    if (!this.online || !c.account || c.ageSet) return c;
    const me = await this.call<{ age: AgeProfile; consent: (ConsentChoice & { version: string }) | null }>("GET", "/v1/me", c.account.token);
    if (me.age.band === "unknown") return c;
    return { ...c, ageSet: true, age: me.age, consent: me.consent ?? REFUSE_ALL, consentDecided: !!me.consent || !showConsentScreen(me.age) };
  }

  setAge = (c: ComplianceState, birth: string) => this.call<{ age: AgeProfile }>("POST", "/v1/me/age", c.account!.token, { birth });
  setConsent = (c: ComplianceState) => this.call("POST", "/v1/me/consent", c.account!.token, c.consent);
  exportData = (c: ComplianceState) => this.call<Record<string, unknown[]>>("GET", "/v1/me/export", c.account!.token);
  deleteAccount = (c: ComplianceState) => this.call<{ dueAt: number }>("POST", "/v1/me/delete", c.account!.token, {});
  contactPoint = () => this.call<{ email: string; form: string; languages: string[] }>("GET", "/v1/contact", null);
  contact = (c: ComplianceState, body: { topic: string; message: string; email?: string; lang: string }) => this.call<{ id: string }>("POST", "/v1/contact", c.account?.token ?? null, body);
  join = (c: ComplianceState, team: string) => this.call("POST", `/v1/teams/${team}/join`, c.account!.token, {});
  messages = (c: ComplianceState, team: string) => this.call<{ id: string; kind: string; body: string; at: number; author: string; nickname: string | null }[]>("GET", `/v1/teams/${team}/messages`, c.account!.token);
  post = (c: ComplianceState, team: string, body: { presetId?: string; text?: string }) => this.call<{ id: string }>("POST", `/v1/teams/${team}/messages`, c.account!.token, body);
  block = (c: ComplianceState, playerId: string) => this.call("POST", "/v1/blocks", c.account!.token, { playerId });
  report = (c: ComplianceState, body: { targetType: "message" | "profile"; targetId: string; reason: string; details: string }) => this.call<{ id: string; receivedAt: number }>("POST", "/v1/reports", c.account!.token, body);
  event = (c: ComplianceState, name: string, data: Record<string, unknown>) => this.call("POST", "/v1/events", c.account!.token, { name, data });
}

/**
 * Mesure d'audience first-party : n'envoie RIEN sans consentement « mesure d'audience » (GDPR-03/04).
 * Le retrait du consentement prend effet immédiatement (aucune mise en file).
 */
export class Analytics {
  sent = 0;
  constructor(private readonly api: Api, private readonly state: () => ComplianceState) {}
  track(name: string, data: Record<string, unknown> = {}): void {
    const c = this.state();
    if (!c.consentDecided || !c.consent.analytics || !this.api.online || !c.account) return;
    this.sent++;
    void this.api.event(c, name, data).catch(() => undefined);
  }
}
