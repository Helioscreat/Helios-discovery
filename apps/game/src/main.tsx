import { render } from "preact";
import { Feedback } from "./feedback";
import { loadProfile } from "./game/profile";
import { detectLocale, setLocale } from "./i18n";
import { loadSettings, SettingsStore } from "./settings";
import { applyTokens } from "./theme/tokens";
import { App, type TestApi } from "./ui/App";
import "./styles.css";

declare global {
  interface Window {
    __helios?: TestApi;
  }
}

applyTokens(document.documentElement);
const settings = new SettingsStore(loadSettings());
setLocale(settings.value.locale ?? detectLocale(navigator.languages ?? [navigator.language]));
const feedback = new Feedback(settings);
const profile = loadProfile();

// Crochets de test : uniquement avec ?test=1 (tests d'interface automatisés).
const testMode = new URLSearchParams(location.search).get("test") === "1";
render(
  <App settings={settings} feedback={feedback} profile={profile} testHooks={testMode ? (api) => (window.__helios = api) : undefined} />,
  document.getElementById("root")!,
);
