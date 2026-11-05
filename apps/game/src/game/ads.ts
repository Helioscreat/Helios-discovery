/**
 * Vidéos récompensées (AdMob), toujours à la demande du joueur : récompense fixe annoncée avant (50 pièces),
 * 5 par jour au plus (moins si la config du pays le prévoit). Une requête n'est envoyée que si
 * `adRequestParams` l'autorise : UMP consulté, âge au-dessus du seuil national, publicité active dans le pays.
 * Mineur : publicité non personnalisée (npa) en plus du marquage UMP.
 */
import type { AdParams } from "@helios/compliance";

/** Identifiants des blocs « avec récompense » (publics ; alignés sur deploy/build.json, vérifié par test). */
export const AD_UNITS = {
  android: "ca-app-pub-1598630500327730/3324615339",
  ios: "ca-app-pub-1598630500327730/2175185190",
} as const;

export type AdResult = "rewarded" | "dismissed" | "failed";

export interface RewardedAds {
  readonly available: boolean;
  show(params: AdParams): Promise<AdResult>;
}

export class CapacitorRewarded implements RewardedAds {
  readonly available = true;
  constructor(
    private readonly platform: "android" | "ios",
    /** Annonces de test Google (versions de recette : VITE_ADS_TESTING=1), pour ne jamais générer de faux trafic. */
    private readonly testing: boolean,
  ) {}

  async show(p: AdParams): Promise<AdResult> {
    if (!p.allowed) return "failed";
    const { AdMob, RewardAdPluginEvents } = await import("@capacitor-community/admob");
    let rewarded = false;
    const handle = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
      rewarded = true;
    });
    try {
      await AdMob.prepareRewardVideoAd({ adId: AD_UNITS[this.platform], isTesting: this.testing, npa: p.npa === 1 });
      const item = await AdMob.showRewardVideoAd();
      if (item && item.amount > 0) rewarded = true;
      return rewarded ? "rewarded" : "dismissed";
    } catch {
      return rewarded ? "rewarded" : "failed";
    } finally {
      await handle.remove();
    }
  }
}

/** Version web : aucune publicité. */
export class NoRewarded implements RewardedAds {
  readonly available = false;
  async show(): Promise<AdResult> {
    return "failed";
  }
}

/** Doublure de test (?test=1, &ad=dismiss pour simuler une vidéo interrompue) : aucun appel réseau. */
export class TestRewarded implements RewardedAds {
  readonly available = true;
  readonly shown: AdParams[] = [];
  constructor(private readonly outcome: AdResult) {}
  async show(p: AdParams): Promise<AdResult> {
    if (!p.allowed) return "failed";
    this.shown.push(p);
    return this.outcome;
  }
}
