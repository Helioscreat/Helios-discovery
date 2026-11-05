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
