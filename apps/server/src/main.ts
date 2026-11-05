import { openDb } from "./db";
import { createApi } from "./http";
import { Service } from "./service";

/** Point d'entrée : PORT, DB_PATH, ALLOWED_ORIGINS, MODERATORS, CONTACT_EMAIL. Hébergement : région UE. */
const env = process.env;
const db = openDb(env.DB_PATH ?? ":memory:");
const svc = new Service(db, {
  clock: () => Date.now(),
  deletionDelayMs: 7 * 86_400_000,
  moderators: (env.MODERATORS ?? "mod-a,mod-b").split(","),
  contact: { email: env.CONTACT_EMAIL ?? "fleurant.m@icloud.com", languages: ["fr", "en", "nl", "de", "es", "it"] },
  minorCapCents: Number(env.MINOR_CAP_CENTS ?? 2000),
  adminKeys: (env.ADMIN_KEYS ?? "").split(",").filter(Boolean),
});
const server = createApi(svc, { allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean) });
server.listen(Number(env.PORT ?? 8787), env.HOST ?? "127.0.0.1", () => console.log(`API sur http://${env.HOST ?? "127.0.0.1"}:${env.PORT ?? 8787}`));
// Effacements arrivés à échéance : une fois par heure.
setInterval(() => svc.runDeletionJob(), 3_600_000).unref();
// Durées de conservation : purge quotidienne.
setInterval(() => svc.runRetentionJob(), 86_400_000).unref();
