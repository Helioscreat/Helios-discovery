import { render } from "preact";
import { Feedback } from "./feedback";
import { loadProfile } from "./game/profile";
import { loadMeta, Shop } from "./game/meta";
import { Api, detectCountry, loadCompliance } from "./game/compliance";
import { choosePlatform } from "./game/ump";
import { NativeStore } from "./game/nativeStore";
import { Capacitor } from "@capacitor/core";
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
// Horloge : réelle, ou fixée par ?now=<ms> pour les tests (vies, saison, roue).
const fixedNow = Number(new URLSearchParams(location.search).get("now"));
const clock = () => (fixedNow > 0 ? fixedNow : Date.now());
const meta = loadMeta(clock());
// Apps natives : Google Play Billing ou StoreKit 2. Version web et tests : store simulé.
const nativePlatform = Capacitor.getPlatform();
const shop: Shop = new Shop(
  clock,
  nativePlatform === "android" || nativePlatform === "ios" ? new NativeStore(nativePlatform === "android" ? "google" : "apple", () => shop.remote?.accountId() ?? null) : undefined,
);
const params = new URLSearchParams(location.search);
// Serveur de l'éditeur (UE) : ?api=… pour les tests, VITE_API_URL au build ; absent = mode local.
const api = new Api(params.get("api") ?? (import.meta.env.VITE_API_URL as string | undefined) ?? null);
const compliance = loadCompliance(params.get("country") ?? detectCountry(navigator.languages ?? [navigator.language]));
meta.age = compliance.age.band;

// Crochets de test : uniquement avec ?test=1 (tests d'interface automatisés).
const testMode = new URLSearchParams(location.search).get("test") === "1";
const consentPlatform = choosePlatform(testMode, params.get("ump") === "form");
render(
  <App settings={settings} feedback={feedback} profile={profile} meta={meta} shop={shop} clock={clock} api={api} compliance={compliance} consentPlatform={consentPlatform} testHooks={testMode ? (api) => (window.__helios = api) : undefined} />,
  document.getElementById("root")!,
);
