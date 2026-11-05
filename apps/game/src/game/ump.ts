/**
 * Consentement publicitaire par Google UMP (User Messaging Platform), la CMP certifiée que Google exige pour AdMob
 * dans l'EEE (TCF v2.2). Le formulaire est celui configuré dans AdMob > Confidentialité et messages
 * (voir docs/stores/ump-config.md) ; le jeu ne le dessine pas.
 *
 * Trois implémentations :
 *  - `CapacitorUmp` : apps Android et iOS, via @capacitor-community/admob (SDK UMP natif) ;
 *  - `NoAds` : version web, sans publicité : aucun appel à Google ;
 *  - `TestUmp` : doublure pour les tests automatisés (?test=1), qui reproduit les statuts renvoyés par UMP.
 */
import type { AdsConsentState, UmpPlan, UmpStatus } from "@helios/compliance";

type CallPlan = Extract<UmpPlan, { call: true }>;

export interface ConsentPlatform {
  readonly kind: "ump" | "none" | "test";
  /** À chaque lancement : mise à jour des informations de consentement, puis formulaire si Google l'exige. */
  gather(plan: CallPlan): Promise<AdsConsentState>;
  /** Point d'entrée permanent « choix publicitaires » (exigé par UMP quand privacyOptionsRequired). */
  showPrivacyOptions(plan: CallPlan): Promise<AdsConsentState>;
}

interface UmpInfo { status: string; canRequestAds: boolean; privacyOptionsRequirementStatus: string; isConsentFormAvailable?: boolean }
const toState = (i: UmpInfo): AdsConsentState => ({
  status: (["UNKNOWN", "REQUIRED", "OBTAINED", "NOT_REQUIRED"].includes(i.status) ? i.status : "UNKNOWN") as UmpStatus,
  canRequestAds: !!i.canRequestAds,
  privacyOptionsRequired: i.privacyOptionsRequirementStatus === "REQUIRED",
});

export class CapacitorUmp implements ConsentPlatform {
  readonly kind = "ump" as const;
  private plugin = import("@capacitor-community/admob").then((m) => m.AdMob);

  async gather(plan: CallPlan): Promise<AdsConsentState> {
    const AdMob = await this.plugin;
    let info: UmpInfo = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: plan.tagForUnderAgeOfConsent });
    if (plan.mayShowForm && info.status === "REQUIRED" && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
    const state = toState(info);
    // Le SDK publicitaire n'est initialisé qu'après UMP, et seulement si UMP l'autorise.
    if (state.canRequestAds) await AdMob.initialize({ tagForUnderAgeOfConsent: plan.tagForUnderAgeOfConsent, tagForChildDirectedTreatment: false });
    // iOS : App Tracking Transparency seulement pour un majeur dont UMP a recueilli le consentement (AGE-05).
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() === "ios" && plan.mayShowForm && state.status === "OBTAINED" && state.canRequestAds) await AdMob.requestTrackingAuthorization();
    return state;
  }

  async showPrivacyOptions(plan: CallPlan): Promise<AdsConsentState> {
    const AdMob = await this.plugin;
    await AdMob.showPrivacyOptionsForm();
    return toState(await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: plan.tagForUnderAgeOfConsent }));
  }
}

/** Version web : pas de publicité, donc ni UMP ni AdMob. */
export class NoAds implements ConsentPlatform {
  readonly kind = "none" as const;
  async gather(): Promise<AdsConsentState> {
    return { status: "NOT_REQUIRED", canRequestAds: false, privacyOptionsRequired: false };
  }
  async showPrivacyOptions(): Promise<AdsConsentState> {
    return this.gather();
  }
}

/**
 * Doublure de test : mêmes statuts que UMP dans l'EEE. Majeur : formulaire requis au premier lancement ;
 * mineur (tagForUnderAgeOfConsent) : aucun formulaire, statut NOT_REQUIRED, publicité limitée.
 * Le faux formulaire n'existe qu'en mode test et ne contacte aucun serveur.
 */
export class TestUmp implements ConsentPlatform {
  readonly kind = "test" as const;
  readonly calls: { method: "gather" | "privacyOptions"; tagForUnderAgeOfConsent: boolean }[] = [];
  /** `showForm` = false : comme si le joueur avait déjà répondu « Refuser » lors d'un lancement précédent. */
  constructor(showForm: boolean) {
    this.decided = showForm ? null : false;
  }
  private decided: boolean | null;

  async gather(plan: CallPlan): Promise<AdsConsentState> {
    this.calls.push({ method: "gather", tagForUnderAgeOfConsent: plan.tagForUnderAgeOfConsent });
    if (plan.tagForUnderAgeOfConsent) return { status: "NOT_REQUIRED", canRequestAds: true, privacyOptionsRequired: false };
    if (this.decided === null && plan.mayShowForm) this.decided = await this.form();
    return this.state();
  }

  async showPrivacyOptions(plan: CallPlan): Promise<AdsConsentState> {
    this.calls.push({ method: "privacyOptions", tagForUnderAgeOfConsent: plan.tagForUnderAgeOfConsent });
    this.decided = await this.form();
    return this.state();
  }

  private state(): AdsConsentState {
    // « Refuser » : UMP renvoie OBTAINED (un choix existe) ; canRequestAds reste vrai pour la publicité limitée.
    return { status: this.decided === null ? "REQUIRED" : "OBTAINED", canRequestAds: this.decided !== null, privacyOptionsRequired: true };
  }

  private form(): Promise<boolean> {
    return new Promise((resolve) => {
      const d = document.createElement("div");
      d.setAttribute("role", "dialog");
      d.setAttribute("aria-label", "Google UMP (test)");
      d.dataset.testid = "ump-form";
      // Le vrai formulaire UMP est une vue native au-dessus de tout le jeu : la doublure l'imite.
      d.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;gap:12px;background:var(--bg,#fff);color:var(--fg,#000);padding:16px";
      d.innerHTML = '<p>Formulaire Google UMP (doublure de test)</p><button type="button" data-ump="consent">Autoriser</button> <button type="button" data-ump="decline">Refuser</button>';
      d.addEventListener("click", (e) => {
        const b = (e.target as HTMLElement).closest("button");
        if (!b) return;
        d.remove();
        resolve(b.dataset.ump === "consent");
      });
      document.body.appendChild(d);
    });
  }
}

/** Plateforme selon l'environnement : natif → UMP ; tests → doublure ; web → aucune publicité. */
export async function choosePlatform(testMode: boolean, testShowsForm = false): Promise<ConsentPlatform> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) return new CapacitorUmp();
  return testMode ? new TestUmp(testShowsForm) : new NoAds();
}
