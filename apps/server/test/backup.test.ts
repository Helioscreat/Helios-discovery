import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BACKUP_RETENTION_DAYS, runBackup } from "../src/backup";
import { openDb } from "../src";

describe("sauvegardes", () => {
  it("copie cohérente et lisible ; une par jour ; rien au-delà de 30 jours", () => {
    const dir = mkdtempSync(join(tmpdir(), "helios-bk-"));
    const db = openDb(join(dir, "live.db"));
    db.prepare("INSERT INTO players (id, token_hash, created_at, country) VALUES ('p1', 'h', 1, 'FR')").run();
    const now = Date.UTC(2026, 10, 5, 3);
    writeFileSync(join(dir, "helios-2026-09-01.db"), "ancienne");
    writeFileSync(join(dir, "helios-2026-10-20.db"), "récente");
    const r = runBackup(db, dir, now);
    expect(r.removed).toEqual(["helios-2026-09-01.db"]);
    expect(readdirSync(dir).filter((f) => f.startsWith("helios-")).sort()).toEqual(["helios-2026-10-20.db", "helios-2026-11-05.db"]);
    const copy = openDb(r.file);
    expect((copy.prepare("SELECT COUNT(*) n FROM players").get() as { n: number }).n).toBe(1);
    expect(runBackup(db, dir, now + 3_600_000).file).toBe(r.file); // même jour : remplacée
    expect(BACKUP_RETENTION_DAYS).toBe(30);
  });
});

describe("fichiers de déploiement", () => {
  const root = join(__dirname, "../../..");
  const read = (p: string) => require("node:fs").readFileSync(join(root, p), "utf8") as string;
  it("même image partout ; base et sauvegardes sur le volume ; secrets hors du dépôt ; origines des apps natives", () => {
    const image = /IMAGE: (\S+)/.exec(read(".github/workflows/server-image.yml"))![1];
    expect(read("deploy/docker-compose.yml")).toContain(`image: ${image}:latest`);
    const compose = read("deploy/docker-compose.yml");
    expect(compose).toContain("DB_PATH: /data/helios.db");
    expect(compose).toContain("BACKUP_DIR: /data/backups");
    expect(compose).toContain("/srv/helios/data:/data");
    const env = read("deploy/server.env.example");
    expect(env).toMatch(/^ALLOWED_ORIGINS=https:\/\/localhost,capacitor:\/\/localhost$/m);
    for (const k of ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "APPLE_ISSUER_ID", "APPLE_KEY_ID", "ADMIN_KEYS", "MODERATORS"]) expect(env).toMatch(new RegExp(`^${k}=$`, "m"));
    expect(read("deploy/Caddyfile")).not.toMatch(/^\s*log\b/m); // pas de journal d'accès (adresses IP)
  });
});
