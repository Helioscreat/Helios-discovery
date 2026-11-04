import {
  BOOSTER_UNLOCK_LEVEL, getHint, IN_GAME_BOOSTERS, needsTarget, type Booster, type GameState, type InGameBooster,
} from "@helios/core";
import { useEffect, useLayoutEffect, useMemo, useState } from "preact/hooks";
import type { Feedback } from "../feedback";
import { difficultyOf, levelCount, levelFile, levelSpec, loadGeneratedLevels } from "../game/levels";
import { grantUnlocks, recordFailure, recordWin, saveProfile, type Profile } from "../game/profile";
import { GameSession } from "../game/session";
import { CATALOGS, getLocale, setLocale, t, type Locale } from "../i18n";
import type { BoardScene } from "../render/BoardScene";
import { TEXT_SCALES, type Settings, type SettingsStore } from "../settings";
import { BoardHost } from "./BoardHost";
import { BoosterGlyph, DualChoice, Modal, ObstacleIcon, PieceIcon } from "./components";

type Overlay =
  | { kind: "none" }
  | { kind: "level-start"; level: number }
  | { kind: "tutorial"; queue: Booster[]; level: number }
  | { kind: "settings" }
  | { kind: "quit" }
  | { kind: "end-win" }
  | { kind: "end-fail"; gift: Booster | null };

export interface AppProps {
  settings: SettingsStore;
  feedback: Feedback;
  profile: Profile;
  /** Crochets de test (activés par ?test=1) : exposent l'état sans passer par le canvas. */
  testHooks?: (api: TestApi) => void;
}

export interface TestApi {
  startLevel: (n: number, kit?: boolean) => void;
  openOverlay: (o: Overlay) => void;
  forceStatus: (s: GameState["status"]) => void;
  session: () => GameSession | null;
  scene: () => BoardScene | null;
  flashes: number[];
  chooseLevel: (n: number) => void;
  hint: () => { from: number; to: number } | null;
  mutate: (fn: (st: GameState) => void) => void;
  booster: (b: InGameBooster, at?: number) => Promise<boolean>;
}

function useSettings(store: SettingsStore): Settings {
  const [s, set] = useState(store.value);
  useEffect(() => store.subscribe(set), [store]);
  return s;
}

function GoalList(props: { state: GameState; compact?: boolean }) {
  return (
    <ul class={props.compact ? "goals compact" : "goals"} aria-label={t("hud.goals")}>
      {props.state.goals.map((g, k) => {
        const done = Math.min(props.state.progress[k], g.type === "score" ? g.target : g.count);
        const total = g.type === "score" ? g.target : g.count;
        return (
          <li key={k}>
            {g.type === "collect" ? <PieceIcon color={g.color} /> : g.type === "clear" ? <ObstacleIcon kind={g.target} /> : g.type === "drop" ? <ObstacleIcon kind="drop" /> : null}
            <span>
              {g.type === "collect"
                ? t("goal.collect", { name: t(`piece.${g.color}` as never), done, count: total })
                : g.type === "clear"
                  ? t(`goal.clear.${g.target}` as never, { done, count: total })
                  : g.type === "drop"
                    ? t("goal.drop", { done, count: total })
                    : t("goal.score", { done, count: total })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const PAGE = 30;

export function App(props: AppProps) {
  const settings = useSettings(props.settings);
  const [screen, setScreen] = useState<"home" | "game">("home");
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const [session, setSession] = useState<GameSession | null>(null);
  const [scene, setScene] = useState<BoardScene | null>(null);
  const [tick, setTick] = useState(0); // rafraîchit le HUD après les animations
  const [caption, setCaption] = useState("");
  const [announce, setAnnounce] = useState("");
  const [kit, setKit] = useState(false);
  const flashes = useMemo<number[]>(() => [], []);
  const refresh = () => setTick((n) => n + 1);
  const profile = props.profile;

  // Synchrone : la taille du texte et le mode daltonien s'appliquent avant l'affichage suivant.
  useLayoutEffect(() => {
    const el = document.documentElement;
    el.style.setProperty("--scale", String(settings.textScale / 100));
    el.dataset.colorblind = String(settings.colorblind);
    el.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings]);

  useEffect(() => props.feedback.onCaption((text) => { setCaption(text); setAnnounce(text); }), []);
  useEffect(() => { void loadGeneratedLevels().then(refresh); }, []);
  const [page, setPage] = useState(() => Math.floor((profile.levelReached - 1) / PAGE));
  useEffect(() => {
    if (!caption) return;
    const id = setTimeout(() => setCaption(""), 1600);
    return () => clearTimeout(id);
  }, [caption]);

  /** Choix d'un niveau : boosters débloqués (3 offerts + tutoriel), puis écran de début de niveau. */
  const chooseLevel = (n: number) => {
    const fresh = grantUnlocks(profile, n);
    saveProfile(profile);
    setKit(false); // case jamais pré-cochée
    setOverlay(fresh.length > 0 ? { kind: "tutorial", queue: fresh, level: n } : { kind: "level-start", level: n });
  };

  const startLevel = (n: number, useKit: boolean) => {
    const s = new GameSession(n, profile, useKit);
    saveProfile(profile);
    setSession(s);
    setScreen("game");
    setOverlay({ kind: "none" });
  };

  const onSettled = () => {
    refresh();
    if (!session) return;
    if (session.state.status === "won") {
      const n = session.level;
      profile.levelReached = Math.max(profile.levelReached, Math.min(levelCount(), n + 1));
      profile.stars[n] = Math.max(profile.stars[n] ?? 0, session.stars());
      recordWin(profile, n);
      saveProfile(profile);
      setOverlay({ kind: "end-win" });
    } else if (session.state.status === "lost") {
      const gift = recordFailure(profile, session.level);
      saveProfile(profile);
      setOverlay({ kind: "end-fail", gift });
    }
  };

  const leaveGame = () => {
    setOverlay({ kind: "none" });
    setSession(null);
    setScreen("home");
  };

  const pickBooster = (b: InGameBooster) => {
    if (!session || session.state.status !== "playing") return;
    if (session.pendingBooster === b) session.pendingBooster = null;
    else session.pendingBooster = b;
    if (!needsTarget(b) && session.pendingBooster === b) scene?.useUntargetedBooster();
    refresh();
  };

  props.testHooks?.({
    startLevel: (n, k = false) => startLevel(n, k),
    openOverlay: setOverlay,
    forceStatus: (s) => {
      if (!session) return;
      session.state = { ...session.state, status: s };
      onSettled();
    },
    session: () => session,
    scene: () => scene,
    flashes,
    chooseLevel,
    hint: () => (session ? getHint(session.state) : null),
    mutate: (fn) => {
      if (!session) return;
      fn(session.state);
      scene?.resync();
    },
    booster: async (b, at) => {
      if (!session || !scene) return false;
      const out = session.useBooster(b, at);
      if (!out) return false;
      await scene.animate(out.events);
      return true;
    },
  });

  const st = session?.state;
  return (
    <div class="app" data-screen={screen}>
      {screen === "home" && (
        <main class="home">
          <header class="home-header">
            <h1>{t("app.title")}</h1>
            <p class="muted">{t("home.subtitle")}</p>
          </header>
          <nav class="pager" aria-label={t("home.levels")}>
            <button type="button" class="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("home.prev")}</button>
            <span>{t("home.range", { a: page * PAGE + 1, b: Math.min(levelCount(), (page + 1) * PAGE) })}</span>
            <button type="button" class="btn small" disabled={(page + 1) * PAGE >= levelCount()} onClick={() => setPage(page + 1)}>{t("home.next")}</button>
          </nav>
          <section class="level-grid" aria-label={t("home.levels")}>
            {Array.from({ length: Math.min(PAGE, levelCount() - page * PAGE) }, (_, k) => page * PAGE + k + 1).map((n) => {
              const locked = n > profile.levelReached;
              const d = difficultyOf(n);
              return (
                <button
                  type="button"
                  key={n}
                  class={`level-btn ${d}`}
                  disabled={locked}
                  aria-label={locked ? t("home.locked", { n }) : `${t("home.level", { n })}${d !== "normal" ? `, ${t(d === "hard" ? "level.badge.hard" : "level.badge.veryHard")}` : ""}`}
                  onClick={() => chooseLevel(n)}
                >
                  <span>{n}</span>
                  {d !== "normal" ? <span class="diff-mark" aria-hidden="true">{d === "hard" ? "◆" : "◆◆"}</span> : null}
                  {profile.stars[n] ? <span class="stars" aria-hidden="true">{"★".repeat(profile.stars[n])}</span> : null}
                </button>
              );
            })}
          </section>
          <nav class="bottom-bar">
            <button type="button" class="btn" onClick={() => setOverlay({ kind: "settings" })}>{t("home.settings")}</button>
            <button type="button" class="btn" onClick={() => chooseLevel(profile.levelReached)}>{t("home.play", { n: profile.levelReached })}</button>
          </nav>
        </main>
      )}

      {screen === "game" && session && st && (
        <main class="game">
          <header class="hud" aria-live="off">
            <div class="hud-cell">
              <span class="hud-label">{t("hud.moves")}</span>
              <span class="hud-value" data-testid="moves">{st.movesLeft}</span>
            </div>
            <GoalList state={st} compact />
            <div class="hud-cell">
              <span class="hud-label">{t("hud.score")}</span>
              <span class="hud-value">{st.score}</span>
            </div>
          </header>
          <div class="caption-slot" aria-hidden="true">
            {settings.captions && caption ? <p class="caption" data-testid="caption">{caption}</p> : null}
          </div>
          {session.pendingBooster && needsTarget(session.pendingBooster) ? (
            <p class="target-hint">{t("booster.target", { name: t(`booster.${session.pendingBooster}` as never) })}</p>
          ) : null}
          <BoardHost
            session={session}
            settings={props.settings}
            feedback={props.feedback}
            onSettled={onSettled}
            onAnnounce={setAnnounce}
            onFlash={(n) => flashes.push(n)}
            onScene={setScene}
          />
          <nav class="booster-bar" aria-label="Boosters" data-tick={tick}>
            {IN_GAME_BOOSTERS.map((b) => {
              const lockedAt = BOOSTER_UNLOCK_LEVEL[b];
              const locked = session.level < lockedAt && !profile.granted.includes(b);
              const count = profile.inventory[b];
              const name = t(`booster.${b}` as never);
              const label = locked ? t("booster.locked", { name, n: lockedAt }) : count > 0 ? t("booster.count", { name, count }) : t("booster.empty", { name });
              return (
                <button
                  type="button"
                  key={b}
                  class="booster"
                  data-booster={b}
                  disabled={locked || count <= 0}
                  aria-pressed={session.pendingBooster === b}
                  aria-label={label}
                  title={label}
                  onClick={() => pickBooster(b)}
                >
                  <BoosterGlyph booster={b} />
                  {locked ? (
                    <span class="booster-lock" aria-hidden="true">
                      <svg width="9" height="10" viewBox="0 0 9 10"><rect x="0.5" y="4.5" width="8" height="5" rx="1" fill="currentColor" /><path d="M2.2 4.5V3a2.3 2.3 0 0 1 4.6 0v1.5" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
                      {lockedAt}
                    </span>
                  ) : (
                    <span class="booster-count" aria-hidden="true">{count}</span>
                  )}
                </button>
              );
            })}
            {session.pendingBooster ? (
              <button type="button" class="btn icon-btn" aria-label={t("decline.cancel")} title={t("decline.cancel")} onClick={() => { session.pendingBooster = null; refresh(); }}>
                <svg width="24" height="24" viewBox="-1 -1 2 2" aria-hidden="true"><path d="M-0.6 -0.6 L0.6 0.6 M0.6 -0.6 L-0.6 0.6" stroke="currentColor" stroke-width="0.2" stroke-linecap="round" /></svg>
              </button>
            ) : (
              <button type="button" class="btn icon-btn" aria-label={t("menu.pause")} title={t("menu.pause")} onClick={() => setOverlay({ kind: "quit" })}>
                <svg width="24" height="24" viewBox="-1 -1 2 2" aria-hidden="true"><path d="M-0.7 -0.5 L0.7 -0.5 M-0.7 0 L0.7 0 M-0.7 0.5 L0.7 0.5" stroke="currentColor" stroke-width="0.2" stroke-linecap="round" /></svg>
              </button>
            )}
          </nav>
        </main>
      )}

      <div class="sr-only" aria-live="polite" data-testid="announcer">{announce}</div>

      {overlay.kind === "tutorial" && (() => {
        const b = overlay.queue[0];
        const name = t(`booster.${b}` as never);
        const next = () => {
          const rest = overlay.queue.slice(1);
          setOverlay(rest.length > 0 ? { ...overlay, queue: rest } : { kind: "level-start", level: overlay.level });
        };
        return (
          <Modal name="booster-tutorial" title={t("tutorial.booster.title", { name })} onEscape={next}>
            <div class="tutorial-glyph"><BoosterGlyph booster={b} /></div>
            <p>{t("tutorial.booster.body", { desc: t(`booster.${b}.desc` as never) })}</p>
            <div class="single-choice"><button type="button" class="btn" onClick={next}>{t("tutorial.ok")}</button></div>
          </Modal>
        );
      })()}

      {overlay.kind === "level-start" && (() => {
        const n = overlay.level;
        const spec = levelSpec(n);
        const file = levelFile(n);
        const d = difficultyOf(n);
        const kitLocked = n < BOOSTER_UNLOCK_LEVEL.starterKit && !profile.granted.includes("starterKit");
        const preview: GameState = { ...({} as GameState), goals: spec.goals, progress: spec.goals.map(() => 0) };
        return (
          <Modal name="level-start" title={t("level.start.title", { n })} onEscape={() => setOverlay({ kind: "none" })}>
            {d !== "normal" ? <p class={`badge ${d}`}>{t(d === "hard" ? "level.badge.hard" : "level.badge.veryHard")}</p> : null}
            {file.tutorial ? <p class="tutorial-text" data-testid="level-tutorial">{t(`tutorial.level.${file.tutorial}` as never)}</p> : null}
            <h3>{t("level.start.goals")}</h3>
            <GoalList state={preview} />
            <p>{t("level.start.moves", { n: spec.moves })}</p>
            {kitLocked ? (
              <p class="muted">{t("level.start.kit.locked", { n: BOOSTER_UNLOCK_LEVEL.starterKit })}</p>
            ) : (
              <label class="check">
                <input type="checkbox" checked={kit} disabled={profile.inventory.starterKit <= 0} onChange={(e) => setKit((e.target as HTMLInputElement).checked)} />
                <span>{t("level.start.kit", { count: profile.inventory.starterKit })}</span>
              </label>
            )}
            <DualChoice accept={t("level.start.play")} decline={t("decline.back")} onAccept={() => startLevel(n, kit)} onDecline={() => setOverlay({ kind: "none" })} />
          </Modal>
        );
      })()}

      {overlay.kind === "quit" && (
        <Modal name="quit" title={t("quit.title")} onEscape={() => setOverlay({ kind: "none" })}>
          <p>{t("quit.body")}</p>
          <DualChoice accept={t("quit.confirm")} decline={t("decline.cancel")} onAccept={leaveGame} onDecline={() => setOverlay({ kind: "none" })} />
        </Modal>
      )}

      {overlay.kind === "end-win" && session && (
        <Modal name="end-win" title={t("end.win.title")} onEscape={leaveGame}>
          <p class="stars-big" aria-label={t("end.win.stars", { n: session.stars() })}>{"★".repeat(session.stars())}{"☆".repeat(3 - session.stars())}</p>
          <p>{t("end.win.score", { n: session.state.score })}</p>
          <div class="single-choice"><button type="button" class="btn" onClick={leaveGame}>{t("end.continue")}</button></div>
        </Modal>
      )}

      {overlay.kind === "end-fail" && session && (
        <Modal name="end-fail" title={t("end.fail.title")} onEscape={leaveGame}>
          <p>{t("end.fail.remaining")}</p>
          <GoalList state={session.state} />
          {overlay.gift ? (
            <p class="tutorial-text" data-testid="help-gift">{t("help.gift", { name: t(`booster.${overlay.gift}` as never) })}</p>
          ) : null}
          <DualChoice accept={t("end.fail.retry")} decline={t("decline.giveUp")} onAccept={() => chooseLevel(session.level)} onDecline={leaveGame} />
        </Modal>
      )}

      {overlay.kind === "settings" && (
        <Modal name="settings" title={t("settings.title")} onEscape={() => setOverlay({ kind: "none" })}>
          <SettingsForm store={props.settings} value={settings} />
          <div class="single-choice"><button type="button" class="btn" onClick={() => setOverlay({ kind: "none" })}>{t("decline.close")}</button></div>
        </Modal>
      )}
    </div>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <label class="toggle">
      <span>{props.label}</span>
      <input type="checkbox" role="switch" name={props.name} checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

function SettingsForm(props: { store: SettingsStore; value: Settings }) {
  const s = props.value;
  const up = (p: Partial<Settings>) => props.store.update(p);
  return (
    <div class="settings">
      <fieldset>
        <legend>{t("settings.section.audio")}</legend>
        <Toggle name="sound" label={t("settings.sound")} checked={s.sound} onChange={(v) => up({ sound: v })} />
        <Toggle name="vibration" label={t("settings.vibration")} checked={s.vibration} onChange={(v) => up({ vibration: v })} />
        <Toggle name="captions" label={t("settings.captions")} checked={s.captions} onChange={(v) => up({ captions: v })} />
      </fieldset>
      <fieldset>
        <legend>{t("settings.section.display")}</legend>
        <Toggle name="colorblind" label={t("settings.colorblind")} checked={s.colorblind} onChange={(v) => up({ colorblind: v })} />
        <Toggle name="reducedMotion" label={t("settings.reducedMotion")} checked={s.reducedMotion} onChange={(v) => up({ reducedMotion: v })} />
        <div class="radio-row" role="radiogroup" aria-label={t("settings.textScale")}>
          <span>{t("settings.textScale")}</span>
          {TEXT_SCALES.map((n) => (
            <label key={n} class="radio">
              <input type="radio" name="textScale" value={n} checked={s.textScale === n} onChange={() => up({ textScale: n })} />
              <span>{t("settings.textScale.option", { n })}</span>
            </label>
          ))}
        </div>
        <label class="select">
          <span>{t("settings.language")}</span>
          <select
            name="locale"
            value={getLocale()}
            onChange={(e) => {
              const l = (e.target as HTMLSelectElement).value as Locale;
              setLocale(l);
              up({ locale: l });
            }}
          >
            {(Object.keys(CATALOGS) as Locale[]).map((l) => <option key={l} value={l}>{l === "fr" ? "Français" : "English"}</option>)}
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>{t("settings.section.help")}</legend>
        <Toggle name="hints" label={t("settings.hints")} checked={s.hints} onChange={(v) => up({ hints: v })} />
      </fieldset>
    </div>
  );
}
