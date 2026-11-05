import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ApiError, type Service } from "./service";

/**
 * API HTTP JSON (préfixe /v1). Routeur minimal sur node:http : aucune dépendance tierce côté serveur.
 * Authentification : en-tête `Authorization: Bearer <jeton>` ; modération : `X-Moderator-Key`.
 */
type Handler = (ctx: { req: IncomingMessage; body: Record<string, unknown>; params: string[]; token?: string; modKey?: string }) => Promise<unknown> | unknown;

export function createApi(svc: Service, opts: { allowedOrigins: string[] }): Server {
  const routes: [string, RegExp, Handler][] = [];
  const route = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, "([^/]+)")}$`), h]);
  const auth = (token?: string) => svc.authenticate(token);

  route("GET", "/v1/health", () => ({ ok: true }));
  route("POST", "/v1/accounts", ({ body }) => svc.createAccount(String(body.country ?? "FR")));
  route("GET", "/v1/me", ({ token }) => svc.me(auth(token)));
  route("POST", "/v1/me/age", ({ token, body }) => ({ age: svc.setAge(auth(token), String(body.birth ?? "")) }));
  route("POST", "/v1/me/consent", ({ token, body }) => ({ consent: svc.setConsent(auth(token), body as never) }));
  route("POST", "/v1/me/nickname", ({ token, body }) => ({ nickname: svc.setNickname(auth(token), String(body.nickname ?? "")) }));
  route("GET", "/v1/me/notifications", ({ token }) => svc.notifications(auth(token)));
  route("GET", "/v1/me/export", ({ token }) => svc.exportData(auth(token)));
  route("POST", "/v1/me/delete", ({ token }) => svc.requestDeletion(auth(token)));
  route("POST", "/v1/purchases/authorize", ({ token, body }) => svc.authorizePurchase(auth(token), String(body.skuId)));
  route("POST", "/v1/purchases/verify", ({ token, body }) => svc.verifyPurchase(auth(token), body.receipt as never));
  route("GET", "/v1/me/purchases", ({ token }) => ({ purchases: svc.purchasesOf(auth(token)) }));
  // Notifications du serveur App Store (V2) : sans authentification, mais relues auprès de l'API d'Apple avant tout effet.
  route("POST", "/v1/stores/apple/notifications", ({ body }) => svc.appleNotification(body.signedPayload));
  route("POST", "/v1/teams/:id/join", ({ token, params }) => (svc.joinTeam(auth(token), params[0]), { ok: true }));
  route("GET", "/v1/teams/:id/messages", ({ token, params }) => svc.messages(auth(token), params[0]));
  route("POST", "/v1/teams/:id/messages", ({ token, params, body }) => svc.postMessage(auth(token), params[0], body as never));
  route("POST", "/v1/blocks", ({ token, body }) => (svc.block(auth(token), String(body.playerId)), { ok: true }));
  route("POST", "/v1/reports", ({ token, body }) => svc.report(auth(token), body as never));
  route("POST", "/v1/appeals", ({ token, body }) => svc.appeal(auth(token), String(body.decisionId), String(body.text ?? "")));
  // Mesure d'audience first-party (livrable 7) : acceptée seulement si le joueur y a consenti, sinon rejetée.
  // Mesure d'audience first-party : acceptée seulement si le joueur y a consenti, schéma fermé.
  route("POST", "/v1/events", ({ token, body }) => svc.event(auth(token), String(body.name), (body.data ?? {}) as Record<string, unknown>));
  route("GET", "/v1/config", ({ req }) => svc.config(new URL(req.url ?? "/", "http://l").searchParams.get("country") ?? "FR"));
  route("POST", "/v1/admin/config", ({ req, body }) => svc.publishConfig(req.headers["x-admin-key"] as string | undefined, body as never));
  route("GET", "/v1/admin/dashboard", ({ req }) => svc.dashboard(req.headers["x-admin-key"] as string | undefined));
  route("GET", "/v1/contact", () => svc.contactPoint());
  route("POST", "/v1/contact", ({ token, body }) => {
    let p = null;
    try {
      p = token ? svc.authenticate(token) : null;
    } catch {
      p = null; // le point de contact reste accessible sans compte (autorités, non-joueurs)
    }
    return svc.contact(p, body as never);
  });
  route("POST", "/v1/moderation/decisions", ({ modKey, body }) => svc.decide(modKey, body as never));
  route("POST", "/v1/moderation/appeals/:id/resolve", ({ modKey, params, body }) => (svc.resolveAppeal(modKey, params[0], body.outcome as never, String(body.facts ?? "")), { ok: true }));

  const send = (res: ServerResponse, origin: string | undefined, status: number, data: unknown) => {
    const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    if (origin && opts.allowedOrigins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-headers"] = "authorization, content-type, x-moderator-key, x-admin-key";
      headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
      headers.vary = "Origin";
    }
    res.writeHead(status, headers);
    res.end(status === 204 ? undefined : JSON.stringify(data));
  };

  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (req.method === "OPTIONS") return send(res, origin, 204, null);
    const url = new URL(req.url ?? "/", "http://local");
    if (req.method === "GET" && url.pathname === "/admin") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY" });
      return res.end(ADMIN_HTML);
    }
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 64_000) throw new ApiError(413, "payloadTooLarge");
      }
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const authz = req.headers.authorization;
      const token = authz?.startsWith("Bearer ") ? authz.slice(7) : undefined;
      const modKey = req.headers["x-moderator-key"] as string | undefined;
      for (const [m, re, h] of routes) {
        if (m !== req.method) continue;
        const match = re.exec(url.pathname);
        if (!match) continue;
        const data = await h({ req, body, params: match.slice(1).map(decodeURIComponent), token, modKey });
        return send(res, origin, 200, data);
      }
      throw new ApiError(404, "notFound");
    } catch (e) {
      if (e instanceof ApiError) return send(res, origin, e.status, { error: e.code, message: e.message });
      if (e instanceof SyntaxError) return send(res, origin, 400, { error: "badJson" });
      console.error(e);
      return send(res, origin, 500, { error: "internal" });
    }
  });
}

/** Tableau de bord interne (§9) : entonnoir, conversion, rétention, indicateurs de protection et alertes. */
const ADMIN_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tableau de bord</title><style>
:root{--bg:#0f2440;--fg:#f4f7fb;--mut:#c3d0e2;--card:#1b3358;--warn:#c2410c}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif;padding:16px}
h1{font-size:1.4rem}section{background:var(--card);border-radius:12px;padding:12px;margin:12px 0}
table{border-collapse:collapse;width:100%}td,th{padding:4px 8px;border-bottom:1px solid #25426e;text-align:left}
.alert{background:var(--warn);color:#fff;border-radius:8px;padding:8px;margin:6px 0}.muted{color:var(--mut)}
input,button{font:inherit;min-height:40px}</style></head><body>
<h1>Tableau de bord</h1><p class="muted">Données agrégées. Indicateurs de protection : toute dérive déclenche une alerte.</p>
<form id="f"><label>Clé d'administration <input id="k" type="password" autocomplete="off"></label> <button>Afficher</button></form>
<div id="out"></div>
<script>
const pct=v=>v==null?"—":(v*100).toFixed(1)+" %";
document.getElementById("f").onsubmit=async e=>{e.preventDefault();
const r=await fetch("/v1/admin/dashboard",{headers:{"x-admin-key":document.getElementById("k").value}});
const d=await r.json();const o=document.getElementById("out");if(!r.ok){o.textContent="Accès refusé";return}
o.innerHTML=(d.alerts.length?d.alerts.map(a=>'<div class="alert" role="alert">Alerte : '+a.indicator+' = '+(a.value<1?pct(a.value):a.value)+' (seuil '+(a.threshold<1?pct(a.threshold):a.threshold)+')</div>').join(""):'<p>Aucune alerte.</p>')+
'<section><h2>Protection</h2><p>Part des revenus des mineurs : '+pct(d.protection.minorRevenueShare)+' · Mineurs au plafond : '+d.protection.minorsAtCap+' · Sessions &gt; 3 h : '+pct(d.protection.longSessionShare)+'</p></section>'+
'<section><h2>Rétention (cohorte : '+d.retention.cohort+')</h2><p>J1 '+pct(d.retention.d1)+' · J7 '+pct(d.retention.d7)+' · J30 '+pct(d.retention.d30)+' · Conversion Premium (30 j) '+pct(d.premiumConversion)+'</p></section>'+
'<section><h2>Entonnoir par niveau</h2><table><thead><tr><th>Niveau</th><th>Débuts</th><th>Victoires</th><th>Échecs</th><th>Réussite</th></tr></thead><tbody>'+
d.funnel.map(f=>'<tr><td>'+f.n+'</td><td>'+f.starts+'</td><td>'+f.wins+'</td><td>'+f.fails+'</td><td>'+pct(f.winRate)+'</td></tr>').join("")+'</tbody></table></section>'};
</script></body></html>`;
