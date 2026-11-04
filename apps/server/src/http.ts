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
  route("POST", "/v1/teams/:id/join", ({ token, params }) => (svc.joinTeam(auth(token), params[0]), { ok: true }));
  route("GET", "/v1/teams/:id/messages", ({ token, params }) => svc.messages(auth(token), params[0]));
  route("POST", "/v1/teams/:id/messages", ({ token, params, body }) => svc.postMessage(auth(token), params[0], body as never));
  route("POST", "/v1/blocks", ({ token, body }) => (svc.block(auth(token), String(body.playerId)), { ok: true }));
  route("POST", "/v1/reports", ({ token, body }) => svc.report(auth(token), body as never));
  route("POST", "/v1/appeals", ({ token, body }) => svc.appeal(auth(token), String(body.decisionId), String(body.text ?? "")));
  // Mesure d'audience first-party (livrable 7) : acceptée seulement si le joueur y a consenti, sinon rejetée.
  route("POST", "/v1/events", ({ token }) => {
    const p = auth(token);
    if (!svc.latestConsent(p.id)?.analytics) throw new ApiError(403, "noConsent");
    return { accepted: true };
  });
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
      headers["access-control-allow-headers"] = "authorization, content-type, x-moderator-key";
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
