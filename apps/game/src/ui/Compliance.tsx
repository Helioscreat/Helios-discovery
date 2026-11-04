import { offeredPurposes, PRESET_MESSAGES, REPORT_REASONS, type ConsentChoice, type Purpose, type ReportReason } from "@helios/compliance";
import { useEffect, useState } from "preact/hooks";
import type { Api, ComplianceState } from "../game/compliance";
import { getLocale, t } from "../i18n";
import { DualChoice, Modal } from "./components";

const MONTHS = Array.from({ length: 12 }, (_, k) => k + 1);

/**
 * Écran d'âge (AGE-01) : date de naissance, aucune valeur pré-remplie, aucun indice sur l'âge attendu.
 * Il n'affiche ni âge minimal, ni « au moins », ni personnage. Une seule déclaration (AGE-02).
 */
export function AgeGate(props: { nowYear: number; error: string; onSubmit: (birth: string) => void }) {
  const [d, setD] = useState("");
  const [m, setM] = useState("");
  const [y, setY] = useState("");
  const years = Array.from({ length: 100 }, (_, k) => props.nowYear - k);
  const monthName = (k: number) => new Date(Date.UTC(2000, k - 1, 1)).toLocaleDateString(getLocale() === "fr" ? "fr-FR" : "en-GB", { month: "long" });
  const complete = d && m && y;
  return (
    <main class="meta-screen age-gate" data-screen-name="age-gate">
      <h1>{t("age.title")}</h1>
      <p>{t("age.body")}</p>
      <div class="date-row">
        <label class="select">
          <span>{t("age.day")}</span>
          <select name="day" value={d} onChange={(e) => setD((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
          </select>
        </label>
        <label class="select">
          <span>{t("age.month")}</span>
          <select name="month" value={m} onChange={(e) => setM((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            {MONTHS.map((n) => <option key={n} value={String(n)}>{monthName(n)}</option>)}
          </select>
        </label>
        <label class="select">
          <span>{t("age.year")}</span>
          <select name="year" value={y} onChange={(e) => setY((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            {years.map((n) => <option key={n} value={String(n)}>{n}</option>)}
          </select>
        </label>
      </div>
      {props.error ? <p class="notice" role="alert">{props.error}</p> : null}
      <p class="small muted">{t("age.why")}</p>
      <div class="single-choice">
        <button type="button" class="btn" disabled={!complete} onClick={() => props.onSubmit(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`)}>{t("age.confirm")}</button>
      </div>
    </main>
  );
}

/**
 * Consentement (GDPR-02) : « Tout accepter » et « Tout refuser » au même niveau, sur le premier écran ;
 * finalités séparées, toutes décochées par défaut (COM-05) ; seules les finalités autorisées pour l'âge sont proposées.
 */
export function ConsentScreen(props: { state: ComplianceState; onSave: (c: Partial<ConsentChoice>) => void; asModal?: boolean; onClose?: () => void }) {
  const offered = offeredPurposes(props.state.age);
  const [custom, setCustom] = useState(false);
  const [choice, setChoice] = useState<Partial<ConsentChoice>>(props.asModal ? { ...props.state.consent } : {});
  const all = Object.fromEntries(offered.map((p) => [p, true])) as Partial<ConsentChoice>;
  const body = (
    <>
      <p>{t("consent.body")}</p>
      <ul class="small">
        {offered.map((p) => <li key={p}><strong>{t(`consent.purpose.${p}` as never)}</strong> — {t(`consent.purpose.${p}.desc` as never)}</li>)}
      </ul>
      <p class="small muted">{t("consent.refuseOk")}</p>
      {custom ? (
        <fieldset data-testid="consent-custom">
          <legend>{t("consent.customize")}</legend>
          {offered.map((p: Purpose) => (
            <label class="toggle" key={p}>
              <span>{t(`consent.purpose.${p}` as never)}</span>
              <input type="checkbox" role="switch" name={p} checked={!!choice[p]} onChange={(e) => setChoice({ ...choice, [p]: (e.target as HTMLInputElement).checked })} />
            </label>
          ))}
          <div class="single-choice"><button type="button" class="btn" onClick={() => props.onSave(choice)}>{t("consent.save")}</button></div>
        </fieldset>
      ) : (
        <button type="button" class="btn small" onClick={() => setCustom(true)}>{t("consent.customize")}</button>
      )}
      <DualChoice accept={t("consent.acceptAll")} decline={t("decline.refuseAll")} onAccept={() => props.onSave(all)} onDecline={() => props.onSave({})} />
    </>
  );
  return (
    <Modal name="consent" title={t("consent.title")} onEscape={props.asModal ? props.onClose : undefined}>
      {body}
    </Modal>
  );
}

/** Paramètres > Confidentialité : consentement, export, effacement, contact, contrôle parental. */
export function PrivacySettings(props: { state: ComplianceState; api: Api; onManageConsent: () => void; onDelete: () => void; onContact: () => void; onParental: () => void }) {
  const [status, setStatus] = useState("");
  const exportData = async () => {
    try {
      const data = props.api.online && props.state.account ? await props.api.exportData(props.state) : localExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "helios-discovery-mes-donnees.json";
      a.click();
      setStatus(t("privacy.exported"));
    } catch {
      setStatus(t("privacy.error"));
    }
  };
  return (
    <fieldset data-testid="privacy-settings">
      <legend>{t("privacy.title")}</legend>
      <button type="button" class="btn small" onClick={props.onManageConsent}>{t("privacy.manageConsent")}</button>
      <button type="button" class="btn small" onClick={() => void exportData()}>{t("privacy.export")}</button>
      <button type="button" class="btn small" onClick={props.onContact}>{t("privacy.contact")}</button>
      {props.state.age.band !== "adult" ? <button type="button" class="btn small" onClick={props.onParental}>{t("privacy.parental")}</button> : null}
      <button type="button" class="btn small" onClick={props.onDelete}>{t("privacy.delete")}</button>
      {status ? <p class="small" role="status">{status}</p> : null}
    </fieldset>
  );
}

/** Données locales exportables quand le serveur n'est pas joignable. */
export function localExport(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let k = 0; k < localStorage.length; k++) {
      const key = localStorage.key(k)!;
      if (key.startsWith("helios.") && key !== "helios.account.v1") out[key] = JSON.parse(localStorage.getItem(key) ?? "null");
    }
  } catch {
    /* stockage indisponible */
  }
  return out;
}

export function DeleteAccountModal(props: { onConfirm: () => void; onCancel: () => void; done: string }) {
  return (
    <Modal name="delete-account" title={t("delete.title")} onEscape={props.onCancel}>
      <p>{t("delete.body")}</p>
      {props.done ? <p class="notice" role="status">{props.done}</p> : null}
      <DualChoice accept={t("delete.confirm")} decline={t("decline.cancel")} onAccept={props.onConfirm} onDecline={props.onCancel} />
    </Modal>
  );
}

export function ParentalModal(props: { onClose: () => void }) {
  return (
    <Modal name="parental" title={t("parental.title")} onEscape={props.onClose}>
      <p>{t("parental.body")}</p>
      <ul class="small">
        <li><a href="https://support.google.com/googleplay/answer/1075738" target="_blank" rel="noopener noreferrer">{t("parental.google")}</a></li>
        <li><a href="https://support.apple.com/HT201089" target="_blank" rel="noopener noreferrer">{t("parental.apple")}</a></li>
      </ul>
      <p class="small">{t("parental.cap")}</p>
      <div class="single-choice"><button type="button" class="btn" onClick={props.onClose}>{t("decline.close")}</button></div>
    </Modal>
  );
}

/** Point de contact unique (DSA art. 11-12) : e-mail, formulaire, langues acceptées. */
export function ContactScreen(props: { api: Api; state: ComplianceState; onBack: () => void }) {
  const [cp, setCp] = useState<{ email: string; languages: string[] } | null>(null);
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (props.api.online) void props.api.contactPoint().then(setCp).catch(() => setCp(null));
  }, []);
  const contactEmail = cp?.email ?? "contact@helios-discovery.example";
  return (
    <main class="meta-screen" data-screen-name="contact">
      <h1>{t("contact.title")}</h1>
      <p>{t("contact.intro")}</p>
      <p data-testid="contact-email">{t("contact.email")} <a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
      <p data-testid="contact-languages">{t("contact.languages", { list: (cp?.languages ?? ["fr", "en"]).join(", ") })}</p>
      <form
        data-testid="contact-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!props.api.online) return setStatus(t("contact.offline"));
          void props.api.contact(props.state, { topic: topic || "other", message, email: email || undefined, lang: getLocale() })
            .then((r) => setStatus(t("contact.sent", { id: r.id.slice(0, 8) })))
            .catch(() => setStatus(t("privacy.error")));
        }}
      >
        <label class="select">
          <span>{t("contact.topic")}</span>
          <select name="topic" value={topic} onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}>
            <option value="">—</option>
            {["help", "purchase", "privacy", "report", "authority", "other"].map((k) => <option key={k} value={k}>{t(`contact.topic.${k}` as never)}</option>)}
          </select>
        </label>
        <label class="field"><span>{t("contact.message")}</span><textarea name="message" rows={4} value={message} onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)} /></label>
        <label class="field"><span>{t("contact.replyEmail")}</span><input type="email" name="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></label>
        <p class="small muted">{t("contact.emailNote")}</p>
        <button type="submit" class="btn" disabled={message.trim().length < 5}>{t("contact.send")}</button>
      </form>
      {status ? <p class="notice" role="status" data-testid="contact-status">{status}</p> : null}
      <nav class="bottom-bar"><button type="button" class="btn" onClick={props.onBack}>{t("decline.back")}</button></nav>
    </main>
  );
}

type Msg = { id: string; kind: string; body: string; at: number; author: string; nickname: string | null };

/**
 * Chat d'équipe (DSA-02, AGE-09) : bouton « Signaler » sur chaque message et chaque profil, blocage ;
 * sous 16 ans, uniquement des messages prédéfinis ; pseudonymes seulement, aucune donnée personnelle.
 */
export function TeamScreen(props: { api: Api; state: ComplianceState; team: string; onReport: (target: { type: "message" | "profile"; id: string }) => void; onBack: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [profile, setProfile] = useState<Msg | null>(null);
  const restricted = props.state.age.chatRestricted;
  const reload = () => props.api.messages(props.state, props.team).then(setMsgs).catch(() => setStatus(t("team.offline")));
  useEffect(() => {
    if (!props.api.online || !props.state.account) return setStatus(t("team.offline"));
    void props.api.join(props.state, props.team).then(reload);
  }, []);
  const send = (body: { presetId?: string; text?: string }) =>
    props.api.post(props.state, props.team, body).then(() => { setText(""); setStatus(""); void reload(); }).catch((e: { code?: string }) => setStatus(t(`team.error.${e.code ?? "generic"}` as never)));
  const name = (m: Msg) => m.nickname ?? t("team.anonymous");
  return (
    <main class="meta-screen" data-screen-name="team">
      <h1>{t("team.title")}</h1>
      {restricted ? <p class="notice">{t("team.restricted")}</p> : null}
      <ul class="messages" data-testid="messages">
        {msgs.map((m) => (
          <li key={m.id} data-message={m.id}>
            <button type="button" class="link" onClick={() => setProfile(m)} aria-label={t("team.openProfile", { name: name(m) })}>{name(m)}</button>
            <span class="msg-body">{m.kind === "preset" ? t(`preset.${m.body}` as never) : m.body}</span>
            <span class="msg-actions">
              <button type="button" class="btn small" aria-label={t("team.reportMessage", { name: name(m) })} onClick={() => props.onReport({ type: "message", id: m.id })}>{t("team.report")}</button>
              {m.author !== props.state.account?.id ? (
                <button type="button" class="btn small" aria-label={t("team.blockUser", { name: name(m) })} onClick={() => void props.api.block(props.state, m.author).then(reload)}>{t("team.block")}</button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <div class="presets" role="group" aria-label={t("team.presets")}>
        {PRESET_MESSAGES.map((p) => <button type="button" key={p} class="btn small" onClick={() => void send({ presetId: p })}>{t(`preset.${p}` as never)}</button>)}
      </div>
      {!restricted ? (
        <form class="compose" onSubmit={(e) => { e.preventDefault(); void send({ text }); }}>
          <label class="field"><span>{t("team.write")}</span><input name="text" maxLength={200} value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} /></label>
          <button type="submit" class="btn" disabled={!text.trim()}>{t("team.send")}</button>
        </form>
      ) : null}
      {status ? <p class="notice" role="status">{status}</p> : null}
      {profile ? (
        <Modal name="profile" title={name(profile)} onEscape={() => setProfile(null)}>
          <p class="small muted">{t("team.profileNote")}</p>
          <button type="button" class="btn" data-testid="report-profile" onClick={() => { setProfile(null); props.onReport({ type: "profile", id: profile.author }); }}>{t("team.reportProfile")}</button>
          <div class="single-choice"><button type="button" class="btn" onClick={() => setProfile(null)}>{t("decline.close")}</button></div>
        </Modal>
      ) : null}
      <nav class="bottom-bar"><button type="button" class="btn" onClick={props.onBack}>{t("decline.back")}</button></nav>
    </main>
  );
}

/** Formulaire de signalement : aucun motif présélectionné (COM-05), accusé de réception affiché. */
export function ReportModal(props: { target: { type: "message" | "profile"; id: string }; api: Api; state: ComplianceState; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState("");
  return (
    <Modal name="report" title={t(props.target.type === "message" ? "report.titleMessage" : "report.titleProfile")} onEscape={props.onClose}>
      <fieldset>
        <legend>{t("report.reason")}</legend>
        {REPORT_REASONS.map((r) => (
          <label class="radio" key={r}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
            <span>{t(`report.reason.${r}` as never)}</span>
          </label>
        ))}
      </fieldset>
      <label class="field"><span>{t("report.details")}</span><textarea name="details" rows={3} value={details} onInput={(e) => setDetails((e.target as HTMLTextAreaElement).value)} /></label>
      {done ? <p class="notice" role="status" data-testid="report-ack">{done}</p> : null}
      <DualChoice
        accept={t("report.send")}
        decline={t("decline.cancel")}
        onAccept={() => {
          if (!reason || done) return;
          void props.api.report(props.state, { targetType: props.target.type, targetId: props.target.id, reason, details })
            .then((r) => setDone(t("report.ack", { id: r.id.slice(0, 8) })))
            .catch(() => setDone(t("privacy.error")));
        }}
        onDecline={props.onClose}
      />
    </Modal>
  );
}
