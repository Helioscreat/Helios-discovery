import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../capacitor.config";
import { AD_UNITS } from "../src/game/ads";

const GAME = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(GAME, p), "utf8");
const build = JSON.parse(read("../../deploy/build.json")) as {
  appId: string;
  admob: { android: { appId: string; rewardedAdUnitId: string }; ios: { appId: string; rewardedAdUnitId: string } };
};
const manifest = read("android/app/src/main/AndroidManifest.xml");
const plist = read("ios/App/App/Info.plist");
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const plistValue = (key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];

describe("projets natifs (Capacitor)", () => {
  it("même identifiant d'application partout : Capacitor, Gradle, Xcode, build.json", () => {
    expect(config.appId).toBe(build.appId);
    expect(config.appName).toBe("Helios Discovery");
    expect(read("android/app/build.gradle")).toContain(`applicationId "${build.appId}"`);
    expect(pbx).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${build.appId};`);
  });

  it("version native = version du jeu ; clé de signature jamais dans le dépôt", () => {
    const v = JSON.parse(read("package.json")).version as string;
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain(`versionName "${v}"`);
    expect(gradle).toMatch(/storeFile file\(ks\)/);
    expect(gradle).not.toMatch(/storePassword\s+["']/); // mot de passe en clair interdit
    expect(read("android/.gitignore")).toMatch(/^\*\.jks$/m);
    expect(read("android/.gitignore")).toMatch(/^\*\.keystore$/m);
    expect(pbx).toContain(`MARKETING_VERSION = ${v};`);
  });

  it("identifiants AdMob = ceux relevés dans AdMob (deploy/build.json)", () => {
    expect(manifest).toMatch(new RegExp(`com\\.google\\.android\\.gms\\.ads\\.APPLICATION_ID"\\s*android:value="${build.admob.android.appId.replace(/[~.]/g, "\\$&")}"`));
    expect(plistValue("GADApplicationIdentifier")).toBe(build.admob.ios.appId);
    for (const id of [build.admob.android.appId, build.admob.ios.appId]) expect(id).toMatch(/^ca-app-pub-\d{16}~\d{10}$/);
    for (const id of [build.admob.android.rewardedAdUnitId, build.admob.ios.rewardedAdUnitId]) expect(id).toMatch(/^ca-app-pub-\d{16}\/\d{10}$/);
    expect(AD_UNITS).toEqual({ android: build.admob.android.rewardedAdUnitId, ios: build.admob.ios.rewardedAdUnitId });
  });

  it("SDK publicitaire jamais initialisé avant UMP : initialisation différée sur les deux plateformes", () => {
    expect(manifest).toMatch(/DELAY_APP_MEASUREMENT_INIT"\s*android:value="true"/);
    expect(plist).toMatch(/<key>GADDelayAppMeasurementInit<\/key>\s*<true\/>/);
  });

  it("Android : seule la permission Internet déclarée par le jeu ; API Topics retirée du SDK ; pas de sauvegarde cloud", () => {
    const perms = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"\s*\/>/g)].map((m) => m[1]);
    expect(perms).toEqual(["android.permission.INTERNET"]);
    expect(manifest).toMatch(/ACCESS_ADSERVICES_TOPICS" tools:node="remove"/);
    expect(manifest).toContain('android:allowBackup="false"');
  });

  it("iOS : texte ATT présent, SKAdNetwork de Google, aucune clé de localisation, portrait seulement", () => {
    expect(plistValue("NSUserTrackingUsageDescription")?.length).toBeGreaterThan(40);
    expect(plist).toContain("cstr6suwn9.skadnetwork");
    expect(plist).not.toMatch(/NSLocation/);
    expect(plist).not.toMatch(/UIInterfaceOrientationLandscape(Left|Right)<\/string>\s*<\/array>\s*<key>UISupportedInterfaceOrientations~ipad/);
  });

  it("PrivacyInfo.xcprivacy est embarqué dans l'app iOS (référence fichier + phase Resources)", () => {
    expect(pbx).toMatch(/\/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;/);
    expect(pbx).toMatch(/\/\* PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile;/);
    expect(read("ios/App/App/PrivacyInfo.xcprivacy")).toContain("NSPrivacyTracking");
  });
});
