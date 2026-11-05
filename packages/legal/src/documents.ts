/**
 * Construction des documents destinés aux joueurs, dans chaque langue, à partir des sources uniques :
 * éditeur, inventaire, durées de conservation, sous-traitants, catalogue, config par pays.
 */
import { CONSENT_AGE } from "@helios/compliance";
import { DEFAULT_CONFIG, resolveConfig, RETENTION, SUBPROCESSORS } from "@helios/config";
import { CATALOG, SEASON_DAYS } from "@helios/economy";
import { CATALOGS as GAME_TEXTS, type Locale } from "../../../apps/game/src/i18n";
import type { Block, Doc } from "./blocks";
import { PHRASES, type Phrases } from "./phrases";
import { LEGAL_VERSION, PUBLISHER } from "./publisher";
import { DEVICE_STORAGE, TREATMENTS } from "./inventory";

export const LOCALES: Locale[] = ["fr", "en", "nl", "de", "es", "it"];
export const PLAYER_DOCS = ["privacy", "terms", "essentials", "sales", "notice", "accessibility"] as const;
export type PlayerDoc = (typeof PLAYER_DOCS)[number];

/** Pays ciblés (GDD §0). */
export const TARGET_COUNTRIES = ["FR", "BE", "DE", "ES", "IT", "NL"];
/** Délai maximal d'effacement après une demande de suppression (engagement, RGPD art. 12(3)). */
export const DELETION_MAX_DAYS = 30;

const SP_KEY: Record<string, keyof Phrases> = {
  "Scaleway SAS": "sp.scaleway",
  "Google Ireland Ltd (Google Play)": "sp.googleplay",
  "Apple Distribution International": "sp.apple",
  "Google Ireland Ltd (UMP)": "sp.ump",
  "Google Ireland Ltd (AdMob)": "sp.admob",
  "Google Ireland Ltd (Firebase Cloud Messaging)": "sp.fcm",
  "Apple Distribution International (APNs)": "sp.apns",
};
export const subprocessorKey = (name: string) => SP_KEY[name];

const COUNTRY_NAMES: Record<Locale, Record<string, string>> = Object.fromEntries(
  LOCALES.map((l) => [l, Object.fromEntries(TARGET_COUNTRIES.map((c) => [c, new Intl.DisplayNames([l], { type: "region" }).of(c) ?? c]))]),
) as Record<Locale, Record<string, string>>;
const LANGUAGE_NAMES = (l: Locale, codes: string[]) => codes.map((c) => new Intl.DisplayNames([l], { type: "language" }).of(c) ?? c).join(", ");

/** Libellés exacts du jeu cités dans les documents (chemins de menu) : une seule source, le catalogue du jeu. */
export function uiLabels(l: Locale): Record<string, string> {
  const g = GAME_TEXTS[l] as Record<string, string>;
  return {
    settings: g["home.settings"], privacy: g["privacy.title"], export: g["privacy.export"], delete: g["privacy.delete"],
    manage: g["privacy.manageConsent"], contact: g["privacy.contact"], report: g["team.report"], changelog: g["changelog.title"],
  };
}

export function phrase(l: Locale, key: keyof Phrases, extra: Record<string, string | number> = {}): string {
  const vars: Record<string, string | number> = { ...uiLabels(l), ...extra };
  return PHRASES[l][key].replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`variable {${k}} manquante pour ${l}:${String(key)}`);
    return String(vars[k]);
  });
}

export function duration(l: Locale, days: number): string {
  if (days % 365 === 0) return phrase(l, days === 365 ? "unit.year" : "unit.years", { n: days / 365 });
  if (days >= 150) return phrase(l, "unit.months", { n: Math.round(days / 30.4) });
  return phrase(l, "unit.days", { n: days });
}

const money = (l: Locale, cents: number) => new Intl.NumberFormat(l, { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (l: Locale, iso: string) => new Intl.DateTimeFormat(l, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

const pub = () => ({
  name: PUBLISHER.name,
  legalForm: PUBLISHER.legalForm,
  address: PUBLISHER.address,
  email: PUBLISHER.email,
  mediator: PUBLISHER.mediator.name,
  mediatorUrl: PUBLISHER.mediator.url,
  mediatorAddress: PUBLISHER.mediator.address,
});

function header(l: Locale, title: string): Block[] {
  return [{ h: 1, text: title }, { p: phrase(l, "meta.version", { label: LEGAL_VERSION.label, date: date(l, LEGAL_VERSION.date) }) }, { p: `${phrase(l, "meta.translation")} ${phrase(l, "meta.review")}` }];
}

function retentionCell(l: Locale, t: (typeof TREATMENTS)[number]): string {
  const parts = t.retention.tables.map((tb) => {
    const r = RETENTION.find((x) => x.table === tb);
    if (!r) throw new Error(`table sans durée : ${tb}`);
    return `${phrase(l, `rt.${tb}` as keyof Phrases)}${l === "fr" ? " : " : ": "}${duration(l, r.days)}`;
  });
  if (t.retention.account) parts.push(phrase(l, "ret.account"));
  if (parts.length === 0) parts.push(phrase(l, "ret.sdk"));
  return parts.join(" ; ");
}

function privacy(l: Locale): Doc {
  const P = (k: keyof Phrases, v?: Record<string, string | number>) => phrase(l, k, v);
  const ages = TARGET_COUNTRIES.map((c) => `${COUNTRY_NAMES[l][c]} ${CONSENT_AGE[c]}`).join(", ");
  const blocks: Block[] = [
    ...header(l, P("privacy.title")),
    { h: 2, text: P("privacy.short.title") },
    { ul: [P("privacy.short.1"), P("privacy.short.2"), P("privacy.short.3"), P("privacy.short.4")] },
    { h: 2, text: P("privacy.controller.title"), id: "controller" },
    { p: P("privacy.controller.body", pub()) },
    { p: P("privacy.dpo") },
    { h: 2, text: P("privacy.treatments.title"), id: "treatments" },
    {
      table: {
        head: [P("privacy.treatments.head.purpose"), P("privacy.treatments.head.data"), P("privacy.treatments.head.basis"), P("privacy.treatments.head.retention")],
        rows: TREATMENTS.map((t) => [P(`tr.${t.id}` as keyof Phrases), t.data.map((d) => P(`dt.${d}` as keyof Phrases)).join(", "), `${P(`basis.${t.basis}` as keyof Phrases)}, 6(1)(${t.basis})`, retentionCell(l, t)]),
      },
    },
    { h: 2, text: P("privacy.legitimate.title"), id: "legitimate" },
    { p: P("privacy.legitimate.body") },
    { h: 2, text: P("privacy.recipients.title"), id: "recipients" },
    { p: P("privacy.recipients.intro") },
    {
      table: {
        head: [P("privacy.recipients.head.name"), P("privacy.recipients.head.role"), P("privacy.recipients.head.country"), P("privacy.recipients.head.safeguard")],
        rows: SUBPROCESSORS.map((s) => [s.name, `${P(SP_KEY[s.name])}${s.afterConsent ? ` (${P("privacy.recipients.afterConsent")})` : ""}`, new Intl.DisplayNames([l], { type: "region" }).of(s.country) ?? s.country, P(`privacy.safeguard.${s.safeguard}` as keyof Phrases)]),
      },
    },
    { p: P("privacy.recipients.google") },
    { p: P("privacy.transfers") },
    { h: 2, text: P("privacy.retention.title"), id: "retention" },
    { table: { head: [P("privacy.retention.head.what"), P("privacy.retention.head.duration")], rows: RETENTION.map((r) => [P(`rt.${r.table}` as keyof Phrases), duration(l, r.days)]) } },
    { p: P("privacy.retention.account", { days: DELETION_MAX_DAYS }) },
    { p: P("privacy.retention.ledger") },
    { h: 2, text: P("privacy.device.title"), id: "device" },
    { p: P("privacy.device.intro") },
    { table: { head: [P("privacy.device.head.key"), P("privacy.device.head.content")], rows: DEVICE_STORAGE.map((d) => [d.key, P(`dev.${d.key}` as keyof Phrases)]) } },
    { p: P("privacy.device.sdk") },
    { h: 2, text: P("privacy.minors.title"), id: "minors" },
    { p: P("privacy.minors.body", { ages }) },
    { h: 2, text: P("privacy.rights.title"), id: "rights" },
    { ul: [1, 2, 3, 4, 5, 6, 7].map((k) => P(`privacy.rights.list.${k}` as keyof Phrases)) },
    { p: P("privacy.rights.how", { email: PUBLISHER.email, authority: PUBLISHER.supervisor.name, url: PUBLISHER.supervisor.url }) },
    { h: 2, text: P("privacy.automated.title"), id: "automated" },
    { p: P("privacy.automated.body") },
    { h: 2, text: P("privacy.required.title"), id: "required" },
    { p: P("privacy.required.body") },
    { h: 2, text: P("privacy.security.title"), id: "security" },
    { p: P("privacy.security.body") },
    { h: 2, text: P("privacy.changes.title"), id: "changes" },
    { p: P("privacy.changes.body") },
  ];
  return { id: "privacy", lang: l, title: P("privacy.title"), blocks };
}

function terms(l: Locale): Doc {
  const P = (k: keyof Phrases, v?: Record<string, string | number>) => phrase(l, k, v);
  const blocks: Block[] = [
    ...header(l, P("terms.title")),
    { h: 2, text: P("terms.object.title") }, { p: P("terms.object.body") },
    { h: 2, text: P("terms.publisher.title"), id: "contact" }, { p: P("terms.publisher.body", { ...pub(), languages: LANGUAGE_NAMES(l, PUBLISHER.contactLanguages) }) },
    { h: 2, text: P("terms.access.title") }, { p: P("terms.access.body") },
    { h: 2, text: P("terms.conduct.title"), id: "conduct" }, { p: P("terms.conduct.intro") }, { ul: [1, 2, 3, 4, 5, 6].map((k) => P(`terms.conduct.${k}` as keyof Phrases)) },
    { h: 2, text: P("terms.moderation.title"), id: "moderation" }, { p: P("terms.moderation.body") }, { ul: [1, 2, 3, 4].map((k) => P(`terms.moderation.m${k}` as keyof Phrases)) },
    { p: P("terms.moderation.tools"), },
    { h: 2, text: P("terms.notice.title"), id: "notice" }, { p: P("terms.notice.body") },
    { h: 2, text: P("terms.decision.title"), id: "appeal" }, { p: P("terms.decision.body") }, { p: P("terms.appeal.body") },
    { h: 2, text: P("terms.misuse.title") }, { p: P("terms.misuse.body") },
    { h: 2, text: P("terms.virtual.title") }, { p: P("terms.virtual.body") },
    { h: 2, text: P("terms.fair.title") }, { p: P("terms.fair.body") },
    { h: 2, text: P("terms.updates.title") }, { p: P("terms.updates.body") },
    { h: 2, text: P("terms.liability.title") }, { p: P("terms.liability.body") },
    { h: 2, text: P("terms.ip.title") }, { p: P("terms.ip.body") },
    { h: 2, text: P("terms.changes.title") }, { p: P("terms.changes.body") },
    { h: 2, text: P("terms.law.title") }, { p: P("terms.law.body", pub()) },
  ];
  return { id: "terms", lang: l, title: P("terms.title"), blocks };
}

function essentials(l: Locale): Doc {
  const P = (k: keyof Phrases) => phrase(l, k);
  return {
    id: "essentials",
    lang: l,
    title: P("essentials.title"),
    blocks: [...header(l, P("essentials.title")), { p: P("essentials.intro") }, { ul: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => P(`essentials.${k}` as keyof Phrases)) }],
  };
}

/** Plafond mensuel des mineurs par pays ciblé, lu dans la config distante par défaut. */
export function minorCaps(): { country: string; cents: number }[] {
  return TARGET_COUNTRIES.map((c) => ({ country: c, cents: resolveConfig(DEFAULT_CONFIG, c).monetization.minorCapCents }));
}

function sales(l: Locale): Doc {
  const P = (k: keyof Phrases, v?: Record<string, string | number>) => phrase(l, k, v);
  const g = GAME_TEXTS[l] as Record<string, string>;
  const caps = minorCaps().map((c) => P("sales.minors.cap", { country: COUNTRY_NAMES[l][c.country], amount: money(l, c.cents) }));
  caps.push(P("sales.minors.default", { amount: money(l, DEFAULT_CONFIG.monetization.minorCapCents) }));
  const uniform = new Set([...minorCaps().map((c) => c.cents), DEFAULT_CONFIG.monetization.minorCapCents]).size === 1;
  const capText = uniform ? P("sales.minors.all", { amount: money(l, DEFAULT_CONFIG.monetization.minorCapCents) }) : caps.join(" ; ");
  const blocks: Block[] = [
    ...header(l, P("sales.title")),
    { h: 2, text: P("sales.scope.title") }, { p: P("sales.scope.body", pub()) },
    { h: 2, text: P("sales.items.title"), id: "items" }, { p: P("sales.items.intro") },
    {
      table: {
        head: [P("sales.items.head.item"), P("sales.items.head.desc"), P("sales.items.head.kind"), P("sales.items.head.price")],
        rows: CATALOG.map((s) => [g[s.nameKey], g[`${s.nameKey}.desc`], P(`sales.kind.${s.kind}` as keyof Phrases), money(l, s.referenceEurCents)]),
      },
    },
    { h: 2, text: P("sales.random.title") }, { p: P("sales.random.body") },
    { h: 2, text: P("sales.order.title") }, { p: P("sales.order.body") },
    { h: 2, text: P("sales.withdrawal.title"), id: "withdrawal" }, { p: P("sales.withdrawal.body") },
    { h: 2, text: P("sales.subscription.title"), id: "subscription" }, { p: P("sales.subscription.body") },
    { h: 2, text: P("sales.pass.title") }, { p: P("sales.pass.body", { days: SEASON_DAYS }) },
    { h: 2, text: P("sales.minors.title"), id: "minors" }, { p: P("sales.minors.body", { caps: capText }) },
    { h: 2, text: P("sales.refund.title"), id: "refund" }, { p: P("sales.refund.body") },
    { h: 2, text: P("sales.conformity.title") }, { p: P("sales.conformity.body") },
    { h: 2, text: P("sales.claims.title"), id: "mediation" }, { p: P("sales.claims.body", pub()) },
    { h: 2, text: P("sales.law.title") }, { p: P("sales.law.body") },
  ];
  return { id: "sales", lang: l, title: P("sales.title"), blocks };
}

/** Champs des mentions légales : réutilisés tels quels par la fiche éditeur des stores (DSA-06). */
export function noticeFields(): [string, string][] {
  const p = PUBLISHER;
  return [
    ["name", p.name], ["form", `${p.legalForm}, ${p.capital}`], ["address", p.address], ["registry", p.registry],
    ["siren", p.siren], ["vat", p.vat], ["director", p.director], ["email", p.email], ["phone", p.phone],
  ];
}

function notice(l: Locale): Doc {
  const P = (k: keyof Phrases, v?: Record<string, string | number>) => phrase(l, k, v);
  const h = PUBLISHER.host;
  const blocks: Block[] = [
    ...header(l, P("notice.title")),
    { h: 2, text: P("notice.publisher.title"), id: "publisher" },
    { table: { head: ["", ""], rows: noticeFields().map(([k, v]) => [P(`notice.field.${k}` as keyof Phrases), v]) } },
    { h: 2, text: P("notice.host.title"), id: "host" },
    { table: { head: ["", ""], rows: [[P("notice.field.hostName"), h.name], [P("notice.field.hostAddress"), h.address], [P("notice.field.hostPhone"), h.phone]] } },
    { h: 2, text: P("notice.contact.title"), id: "contact" },
    { p: P("notice.contact.body", { ...pub(), languages: LANGUAGE_NAMES(l, PUBLISHER.contactLanguages) }) },
    { h: 2, text: P("notice.dsa.title") }, { p: P("notice.dsa.body") },
  ];
  return { id: "notice", lang: l, title: P("notice.title"), blocks };
}

function accessibility(l: Locale): Doc {
  const P = (k: keyof Phrases, v?: Record<string, string | number>) => phrase(l, k, v);
  const blocks: Block[] = [
    ...header(l, P("a11y.title")),
    { p: P("a11y.commitment", pub()) },
    { h: 2, text: P("a11y.status.title"), id: "status" }, { p: P("a11y.status.body") },
    { h: 2, text: P("a11y.tested.title") }, { ul: [1, 2, 3, 4, 5, 6].map((k) => P(`a11y.tested.${k}` as keyof Phrases)) },
    { h: 2, text: P("a11y.issues.title"), id: "issues" }, { ul: [1, 2, 3, 4].map((k) => P(`a11y.issues.${k}` as keyof Phrases)) },
    { h: 2, text: P("a11y.method.title"), id: "date" }, { p: P("a11y.method.body", { date: date(l, LEGAL_VERSION.date) }) },
    { h: 2, text: P("a11y.contact.title"), id: "contact" }, { p: P("a11y.contact.body", pub()) },
    { h: 2, text: P("a11y.recourse.title") }, { p: P("a11y.recourse.body", { authority: PUBLISHER.accessibilityAuthority }) },
  ];
  return { id: "accessibility", lang: l, title: P("a11y.title"), blocks };
}

const BUILDERS: Record<PlayerDoc, (l: Locale) => Doc> = { privacy, terms, essentials, sales, notice, accessibility };
export const buildDoc = (id: PlayerDoc, l: Locale) => BUILDERS[id](l);
export const allPlayerDocs = () => LOCALES.flatMap((l) => PLAYER_DOCS.map((d) => buildDoc(d, l)));
