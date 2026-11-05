import { readFileSync } from "node:fs";
import { CATALOG, MockVerifier } from "@helios/economy";
import { openDb } from "./db";
import { createApi } from "./http";
import { Service } from "./service";
import { storeVerifiersFromEnv } from "./stores";
import { runBackup } from "./backup";

/** Point d'entrée : PORT, DB_PATH, ALLOWED_ORIGINS, MODERATORS, CONTACT_EMAIL, identifiants des stores (stores.ts). Hébergement : région UE. */
const env = process.env;
const stores = storeVerifiersFromEnv(env, (p) => readFileSync(p, "utf8"), new MockVerifier(Object.fromEntries(CATALOG.map((s) => [s.id, s.referenceEurCents])), () => Date.now()));
console.log(`Vérification des achats : ${stores.platforms.join(", ") || "aucun store configuré"}`);
const db = openDb(env.DB_PATH ?? ":memory:");
const svc = new Service(db, {
  clock: () => Date.now(),
  deletionDelayMs: 7 * 86_400_000,
  moderators: (env.MODERATORS ?? "mod-a,mod-b").split(","),
  contact: { email: env.CONTACT_EMAIL ?? "fleurant.m@icloud.com", languages: ["fr", "en", "nl", "de", "es", "it"] },
  minorCapCents: Number(env.MINOR_CAP_CENTS ?? 2000),
  adminKeys: (env.ADMIN_KEYS ?? "").split(",").filter(Boolean),
  verifier: stores.verifier,
});
const server = createApi(svc, { allowedOrigins: (env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean) });
server.listen(Number(env.PORT ?? 8787), env.HOST ?? "127.0.0.1", () => console.log(`API sur http://${env.HOST ?? "127.0.0.1"}:${env.PORT ?? 8787}`));
if (env.NODE_ENV === "production" && (env.DB_PATH ?? ":memory:") === ":memory:") console.error("ATTENTION : DB_PATH absent, base en mémoire (données perdues au redémarrage)");
// Effacements arrivés à échéance : une fois par heure.
setInterval(() => svc.runDeletionJob(), 3_600_000).unref();
// Remboursements Google (API des achats annulés) : une fois par heure.
setInterval(() => void svc.runRefundJob().catch((e) => console.error("remboursements :", (e as Error).message)), 3_600_000).unref();
// Sauvegarde quotidienne (BACKUP_DIR), conservée 30 jours au plus.
if (env.BACKUP_DIR) {
  const backup = () => {
    try {
      const r = runBackup(db, env.BACKUP_DIR!, Date.now());
      console.log(`sauvegarde : ${r.file}${r.removed.length ? ` ; supprimées : ${r.removed.join(", ")}` : ""}`);
    } catch (e) {
      console.error("sauvegarde :", (e as Error).message);
    }
  };
  setTimeout(backup, 60_000).unref();
  setInterval(backup, 86_400_000).unref();
}
// Arrêt propre (redémarrage du conteneur) : plus de nouvelles requêtes, base fermée proprement.
for (const sig of ["SIGTERM", "SIGINT"] as const)
  process.once(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
// Durées de conservation : purge quotidienne.
setInterval(() => svc.runRetentionJob(), 86_400_000).unref();
