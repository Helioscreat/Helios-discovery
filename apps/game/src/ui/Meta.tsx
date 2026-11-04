import type { Booster } from "@helios/core";
import {
  CATALOG, canSpin, chestProbabilities, claimable, COIN_PRICES, currentZone, daysLeft, doTask, estimateTier, isProtected,
  manageSubscriptionUrl, nextLifeIn, nextTask, passOffer, refundUrl, rewardKey, rewardTable, seasonEnd, spendRecap, tierOf,
  TIERS, unlockedScenes, WHEEL, wheelProbabilities, XP_PER_TIER, type Contents, type Reward, type Sku,
} from "@helios/economy";
import { currentSeason, livesNow, type MetaState, type Shop } from "../game/meta";
import { getLocale, t } from "../i18n";
import { DualChoice, Modal } from "./components";

const BOOSTER_NAME = (b: string) => t(`booster.${b}` as never);

/** Description exacte et complète d'un contenu (COM-09) : une ligne par élément, avec quantités. */
export function describeContents(c: Contents): string[] {
  const out: string[] = [];
  for (const [b, n] of Object.entries(c.boosters ?? {})) if (n) out.push(t("contents.booster", { n, name: BOOSTER_NAME(b) }));
  if (c.unlimitedLivesMin) out.push(t("contents.lives", { d: formatDuration(c.unlimitedLivesMin) }));
  if (c.coins) out.push(t("contents.coins", { n: c.coins }));
  if (c.extraMoves) out.push(t("contents.moves", { n: c.extraMoves }));
  return out;
}

export function formatDuration(min: number): string {
  if (min >= 1440 && min % 1440 === 0) return t("duration.days", { n: min / 1440 });
  if (min >= 60 && min % 60 === 0) return t("duration.hours", { n: min / 60 });
  return t("duration.minutes", { n: min });
}

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(getLocale() === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Prix affiché, toujours accompagné de son attribut data-price pour le contrôle automatisé (COM-15). */
export function Price(props: { value: string | null }) {
  return <span class="price" data-price={props.value ?? ""}>{props.value ?? t("shop.priceLoading")}</span>;
}

// ───────────────────────── barre du haut (vies, pièces, étoiles) ─────────────────────────
export function TopBar(props: { meta: MetaState; now: number }) {
  const lives = livesNow(props.meta, props.now);
  const unlimited = props.now < props.meta.account.wallet.unlimitedUntil;
  const next = nextLifeIn(props.meta.account.wallet, props.now);
  const mm = Math.ceil(next / 60_000);
  return (
    <div class="topbar" data-testid="topbar">
      <span aria-label={unlimited ? t("lives.unlimited") : t("lives.count", { n: lives })}>
        <span aria-hidden="true">♥ </span>{unlimited ? "∞" : lives}
        {!unlimited && next > 0 ? <span class="muted small"> {t("lives.next", { m: mm })}</span> : null}
      </span>
      <span aria-label={t("coins.count", { n: props.meta.account.wallet.coins })}><span aria-hidden="true">◎ </span>{props.meta.account.wallet.coins}</span>
      <span aria-label={t("stars.count", { n: props.meta.island.stars })}><span aria-hidden="true">★ </span>{props.meta.island.stars}</span>
    </div>
  );
}

// ───────────────────────── boutique ─────────────────────────
const SHOP_ORDER = ["starter_pack", "lives_1h", "lives_3h", "lives_24h", "boosters_s", "boosters_m", "boosters_l", "boosters_xl", "gardener_monthly"];

export function ShopScreen(props: { meta: MetaState; shop: Shop; onOpen: (s: Sku) => void; onBack: () => void }) {
  const owned = props.meta.account.wallet.ownedOnce;
  const items = SHOP_ORDER.map((id) => CATALOG.find((s) => s.id === id)!).filter((s) => !(s.kind === "oneTime" && owned.includes(s.id)));
  return (
    <main class="meta-screen" data-screen-name="shop">
      <h1>{t("shop.title")}</h1>
      <p class="muted">{t("shop.intro")}</p>
      {isProtected(props.meta.age) ? <p class="notice" data-testid="shop-protected">{t("shop.protected")}</p> : null}
      <ul class="sku-list">
        {items.map((s) => (
          <li key={s.id} class="sku-card" data-sku={s.id}>
            <h2>{t(`${s.nameKey}` as never)}</h2>
            <ul class="contents">
              {(s.kind === "subscription" ? describeContents(s.dailyPerks ?? {}).map((x) => t("sub.perDay", { x })) : describeContents(s.contents)).map((x) => <li key={x}>{x}</li>)}
            </ul>
            <button type="button" class="btn" onClick={() => props.onOpen(s)} aria-label={`${t(`${s.nameKey}` as never)}, ${props.shop.price(s.id) ?? ""}`}>
              {t("shop.details")} · <Price value={props.shop.price(s.id)} />
            </button>
          </li>
        ))}
      </ul>
      <nav class="bottom-bar"><button type="button" class="btn" onClick={props.onBack}>{t("decline.back")}</button></nav>
    </main>
  );
}

/** Mentions communes à toute fiche d'achat : rétractation et remboursement (COM-12). */
function LegalFooter(props: { platform: "google" | "apple" | "mock" }) {
  return (
    <div class="legal" data-testid="withdrawal">
      <p class="small">{t("purchase.withdrawal")}</p>
      <p class="small">
        <a href={refundUrl(props.platform)} target="_blank" rel="noopener noreferrer" data-testid="refund-link">{t("purchase.refund")}</a>
      </p>
    </div>
  );
}

/** Fiche d'achat (COM-09) : description exacte, contenu, quantité, prix TTC du store, durée éventuelle. */
export function PurchaseSheet(props: { sku: Sku; price: string | null; platform: "google" | "apple" | "mock"; busy: boolean; message: string; onPay: () => void; onCancel: () => void }) {
  const s = props.sku;
  const duration = s.contents.unlimitedLivesMin ? formatDuration(s.contents.unlimitedLivesMin) : null;
  return (
    <Modal name="purchase-sheet" title={t(`${s.nameKey}` as never)} onEscape={props.onCancel}>
      <p data-field="description">{t(`${s.nameKey}.desc` as never)}</p>
      <h3>{t("purchase.contents")}</h3>
      <ul class="contents" data-field="quantity">{describeContents(s.contents).map((x) => <li key={x}>{x}</li>)}</ul>
      <p data-field="price">{t("purchase.price")} <Price value={props.price} /> {t("purchase.ttc")}</p>
      <p data-field="duration">{duration ? t("purchase.duration", { d: duration }) : s.kind === "oneTime" ? t("purchase.oneTime") : t("purchase.permanent")}</p>
      <LegalFooter platform={props.platform} />
      {props.message ? <p class="notice" role="status">{props.message}</p> : null}
      <DualChoice accept={props.price ? t("purchase.pay", { price: props.price }) : t("shop.priceLoading")} decline={t("decline.cancel")} onAccept={() => !props.busy && props.price && props.onPay()} onDecline={props.onCancel} />
    </Modal>
  );
}

/** Fiche d'abonnement (COM-14) : prix, durée, renouvellement, résiliation (2 clics via le store, lien direct). */
export function SubscriptionSheet(props: { sku: Sku; price: string | null; platform: "google" | "apple" | "mock"; busy: boolean; message: string; onPay: () => void; onCancel: () => void }) {
  const s = props.sku;
  return (
    <Modal name="subscription-sheet" title={t(`${s.nameKey}` as never)} onEscape={props.onCancel}>
      <p data-field="description">{t(`${s.nameKey}.desc` as never)}</p>
      <ul class="contents" data-field="quantity">{describeContents(s.dailyPerks ?? {}).map((x) => <li key={x}>{t("sub.perDay", { x })}</li>)}</ul>
      <p data-field="price">{t("sub.price")} <Price value={props.price} /> {t("purchase.ttc")}</p>
      <p data-field="duration">{t("sub.duration")}</p>
      <p data-field="renewal">{t("sub.renewal")}</p>
      <p data-field="cancel">
        {t("sub.cancel")} <a href={manageSubscriptionUrl(props.platform, s.id)} target="_blank" rel="noopener noreferrer" data-testid="manage-sub">{t("sub.manage")}</a>
      </p>
      <LegalFooter platform={props.platform} />
      {props.message ? <p class="notice" role="status">{props.message}</p> : null}
      <DualChoice accept={props.price ? t("sub.subscribe", { price: props.price }) : t("shop.priceLoading")} decline={t("decline.cancel")} onAccept={() => !props.busy && props.price && props.onPay()} onDecline={props.onCancel} />
    </Modal>
  );
}

// ───────────────────────── passe de saison ─────────────────────────
function RewardLine(props: { r: Reward; got: boolean }) {
  const label = [...describeContents(props.r.contents), ...(props.r.cosmetic ? [t(`cosmetic.${props.r.cosmetic}` as never)] : [])].join(", ");
  return <li class={props.got ? "got" : ""}>{t("pass.tier", { n: props.r.tier })} — {label}</li>;
}

export function PassScreen(props: { meta: MetaState; now: number; shop: Shop; onClaim: (r: Reward) => void; onOpenSheet: (tier: "premium" | "premiumPlus") => void; onBack: () => void }) {
  const def = currentSeason(props.now);
  const st = props.meta.season;
  const tier = tierOf(st.xp);
  const offer = passOffer(def, st, props.now, isProtected(props.meta.age));
  const table = rewardTable();
  const toClaim = claimable(st);
  return (
    <main class="meta-screen" data-screen-name="pass">
      <h1>{t("pass.title")}</h1>
      <p data-testid="pass-dates">{t("pass.dates", { a: fmtDate(def.startAt), b: fmtDate(seasonEnd(def) - 1) })}</p>
      <p>{t("pass.daysLeft", { n: daysLeft(def, props.now) })}</p>
      <p>{t("pass.progress", { tier, xp: st.xp % XP_PER_TIER, step: XP_PER_TIER, max: TIERS })}</p>
      <p>{t("pass.estimate", { n: estimateTier(def, st, props.now) })}</p>
      {toClaim.length ? (
        <button type="button" class="btn" onClick={() => toClaim.forEach(props.onClaim)}>{t("pass.claimAll", { n: toClaim.length })}</button>
      ) : null}
      {offer.offered ? (
        <div class="pass-offer">
          <button type="button" class="btn" onClick={() => props.onOpenSheet("premium")}>{t("pass.seePremium")} · <Price value={props.shop.price("pass_premium")} /></button>
          <button type="button" class="btn" onClick={() => props.onOpenSheet("premiumPlus")}>{t("pass.seePremiumPlus")} · <Price value={props.shop.price("pass_premium_plus")} /></button>
        </div>
      ) : st.pass !== "none" ? <p class="notice">{t(st.pass === "premium" ? "pass.owned" : "pass.ownedPlus")}</p> : null}
      <h2>{t("pass.freeTrack")}</h2>
      <ul class="rewards" data-testid="free-track">{table.filter((r) => r.track === "free").map((r) => <RewardLine key={rewardKey(r)} r={r} got={st.claimed.includes(rewardKey(r))} />)}</ul>
      <h2>{t("pass.premiumTrack")}</h2>
      <ul class="rewards" data-testid="premium-track">{table.filter((r) => r.track === "premium").map((r) => <RewardLine key={rewardKey(r)} r={r} got={st.claimed.includes(rewardKey(r))} />)}</ul>
      <p class="small muted">{t("pass.after40", { xp: 300 })}</p>
      <ul class="small">{chestProbabilities().map((p, k) => <li key={k}>{t("pass.chestOdds", { k: k + 1, p: Math.round(p * 100) })}</li>)}</ul>
      <nav class="bottom-bar"><button type="button" class="btn" onClick={props.onBack}>{t("decline.back")}</button></nav>
    </main>
  );
}

/** Fiche d'achat du passe (SEA-02/03) : liste complète, jours restants, estimation honnête, avertissement tardif. */
export function PassSheet(props: { meta: MetaState; now: number; tier: "premium" | "premiumPlus"; price: string | null; platform: "google" | "apple" | "mock"; busy: boolean; message: string; onPay: () => void; onCancel: () => void }) {
  const def = currentSeason(props.now);
  const st = props.meta.season;
  const offer = passOffer(def, st, props.now, isProtected(props.meta.age));
  const est = estimateTier(def, st, props.now, props.tier);
  const premium = rewardTable().filter((r) => r.track === "premium");
  const reached = tierOf(st.xp + (props.tier === "premiumPlus" ? 10 * XP_PER_TIER : 0));
  return (
    <Modal name="pass-sheet" title={t(props.tier === "premium" ? "sku.pass_premium" : "sku.pass_premium_plus")} onEscape={props.onCancel}>
      <p data-field="description">{t(props.tier === "premium" ? "sku.pass_premium.desc" : "sku.pass_premium_plus.desc")}</p>
      <p data-field="duration">{t("pass.dates", { a: fmtDate(def.startAt), b: fmtDate(seasonEnd(def) - 1) })} · {t("pass.daysLeft", { n: offer.daysLeft })}</p>
      <p data-testid="pass-estimate">{t("pass.estimateIf", { n: est })}</p>
      {reached > 0 ? <p>{t("pass.lateUnlock", { n: reached })}</p> : null}
      {offer.warning ? <p class="notice" data-testid="pass-warning">{t("pass.warning", { n: offer.warning.estimatedTier })}</p> : null}
      <details open>
        <summary>{t("pass.fullList", { n: premium.length })}</summary>
        <ul class="rewards" data-field="quantity">{premium.map((r) => <RewardLine key={rewardKey(r)} r={r} got={false} />)}</ul>
      </details>
      <p data-field="price">{t("purchase.price")} <Price value={props.price} /> {t("purchase.ttc")}</p>
      <LegalFooter platform={props.platform} />
      {props.message ? <p class="notice" role="status">{props.message}</p> : null}
      <DualChoice accept={props.price ? t("purchase.pay", { price: props.price }) : t("shop.priceLoading")} decline={t("decline.cancel")} onAccept={() => !props.busy && props.price && props.onPay()} onDecline={props.onCancel} />
    </Modal>
  );
}

// ───────────────────────── récompenses gratuites ─────────────────────────
export function RewardsScreen(props: { meta: MetaState; now: number; result: string; onSpin: () => void; onClaimQuest: (id: string) => void; onBack: () => void }) {
  const can = canSpin(props.meta.free, props.now);
  const probs = wheelProbabilities();
  return (
    <main class="meta-screen" data-screen-name="rewards">
      <h1>{t("rewards.title")}</h1>
      <h2>{t("rewards.wheel")}</h2>
      <p class="muted">{t("rewards.wheelRule")}</p>
      <table class="odds" data-testid="wheel-odds">
        <thead><tr><th scope="col">{t("rewards.prize")}</th><th scope="col">{t("rewards.chance")}</th></tr></thead>
        <tbody>{WHEEL.map((w, k) => <tr key={k}><td>{t(w.labelKey as never)}</td><td>{(probs[k] * 100).toFixed(0)} %</td></tr>)}</tbody>
      </table>
      <button type="button" class="btn" disabled={!can} onClick={props.onSpin}>{can ? t("rewards.spin") : t("rewards.spinTomorrow")}</button>
      {props.result ? <p class="notice" role="status">{props.result}</p> : null}
      <h2>{t("rewards.streak")}</h2>
      <p>{t("rewards.streakDay", { n: props.meta.free.streakDay })}</p>
      <h2>{t("rewards.quests")}</h2>
      <ul class="quests">
        {props.meta.free.quests.map((q) => (
          <li key={q.id}>
            <span>{t(`quest.${q.kind}` as never, { n: q.target })} — {q.progress}/{q.target}</span>
            <button type="button" class="btn small" disabled={q.claimed || q.progress < q.target} onClick={() => props.onClaimQuest(q.id)}>
              {q.claimed ? t("rewards.claimed") : t("rewards.claim")}
            </button>
          </li>
        ))}
      </ul>
      <nav class="bottom-bar"><button type="button" class="btn" onClick={props.onBack}>{t("decline.back")}</button></nav>
    </main>
  );
}

// ───────────────────────── île ─────────────────────────
export function IslandScreen(props: { meta: MetaState; hasPremium: boolean; onDo: (taskId: string, variant: string) => void; onBack: () => void }) {
  const s = props.meta.island;
  const z = currentZone(s);
  const next = nextTask(s);
  return (
    <main class="meta-screen" data-screen-name="island">
      <h1>{z ? t(`${z.nameKey}` as never) : t("island.done")}</h1>
      <p>{t("island.stars", { n: s.stars })}</p>
      {z ? (
        <>
          <p class="muted">{t("island.progress", { n: z.tasks.filter((x) => x.id in s.done).length, total: z.tasks.length })}</p>
          <ul class="small">{unlockedScenes(s, z).map((sc) => <li key={sc}>{t("island.scene", { id: sc })}</li>)}</ul>
        </>
      ) : null}
      {next ? (
        <section class="task">
          <h2>{t("island.task", { n: Number(next.id.split(".t")[1]) })}</h2>
          <p>{t("island.cost", { n: next.stars })}</p>
          <div class="variants">
            {next.variants.map((v, k) => (
              <button type="button" class="btn" key={v} disabled={s.stars < next.stars} onClick={() => props.onDo(next.id, v)}>{t("island.variant", { k: k + 1 })}</button>
            ))}
            {next.premiumVariant ? (
              <button type="button" class="btn" disabled={!props.hasPremium || s.stars < next.stars} onClick={() => props.onDo(next.id, next.premiumVariant!)}>
                {t("island.premiumVariant")}
              </button>
            ) : null}
          </div>
          {next.premiumVariant && !props.hasPremium ? <p class="small muted">{t("island.premiumNote")}</p> : null}
        </section>
      ) : null}
      <nav class="bottom-bar"><button type="button" class="btn" onClick={props.onBack}>{t("decline.back")}</button></nav>
    </main>
  );
}

// ───────────────────────── vies ─────────────────────────
export function LivesModal(props: { meta: MetaState; now: number; onRefill: () => void; onShop: () => void; onClose: () => void }) {
  const next = Math.ceil(nextLifeIn(props.meta.account.wallet, props.now) / 60_000);
  const enough = props.meta.account.wallet.coins >= COIN_PRICES.refillLives;
  return (
    <Modal name="lives" title={t("lives.title")} onEscape={props.onClose}>
      <p>{t("lives.empty", { m: next })}</p>
      {!isProtected(props.meta.age) ? <p class="small muted">{t("lives.shopHint")}</p> : null}
      {!isProtected(props.meta.age) ? <button type="button" class="btn" onClick={props.onShop}>{t("lives.toShop")}</button> : null}
      <DualChoice accept={enough ? t("lives.refill", { n: COIN_PRICES.refillLives }) : t("lives.notEnough", { n: COIN_PRICES.refillLives })} decline={t("decline.close")} onAccept={() => enough && props.onRefill()} onDecline={props.onClose} />
    </Modal>
  );
}

// ───────────────────────── Paramètres > Achats ─────────────────────────
export function PurchasesSettings(props: { meta: MetaState; platform: "google" | "apple" | "mock" }) {
  const recap = spendRecap(props.meta.account.ledger);
  const sub = props.meta.account.wallet.subscription;
  const fmt = (c: number) => new Intl.NumberFormat(getLocale() === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" }).format(c / 100);
  return (
    <fieldset data-testid="purchases-settings">
      <legend>{t("settings.section.purchases")}</legend>
      <p class="small">{t("settings.recap")}</p>
      <ul class="small" data-testid="spend-recap">
        {recap.length === 0 ? <li>{t("settings.recapNone")}</li> : recap.map((r) => <li key={r.month}>{r.month} : {fmt(r.eurCents)} ({r.purchases})</li>)}
      </ul>
      {sub ? <p class="small"><a href={manageSubscriptionUrl(props.platform, sub.skuId)} target="_blank" rel="noopener noreferrer">{t("sub.manage")}</a></p> : null}
      <p class="small"><a href={refundUrl(props.platform)} target="_blank" rel="noopener noreferrer">{t("purchase.refund")}</a></p>
    </fieldset>
  );
}

export type { Booster };
