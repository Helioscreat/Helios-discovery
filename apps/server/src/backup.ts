/**
 * Sauvegardes de la base SQLite : copie cohérente (VACUUM INTO, sans arrêter le service), une par jour,
 * conservées 30 jours au plus (même échéance que les effacements : une donnée effacée disparaît des sauvegardes
 * au plus tard 30 jours après). Le dossier doit être sur un volume chiffré, en région UE.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db";

export const BACKUP_RETENTION_DAYS = 30;
const NAME = /^helios-(\d{4}-\d{2}-\d{2})\.db$/;

export function runBackup(db: Db, dir: string, now: number): { file: string; removed: string[] } {
  mkdirSync(dir, { recursive: true });
  const day = new Date(now).toISOString().slice(0, 10);
  const file = join(dir, `helios-${day}.db`);
  rmSync(file, { force: true }); // une seule copie par jour : la plus récente
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const limit = now - BACKUP_RETENTION_DAYS * 86_400_000;
  const removed: string[] = [];
  for (const f of readdirSync(dir)) {
    const m = NAME.exec(f);
    if (m && Date.parse(`${m[1]}T00:00:00Z`) < limit) {
      rmSync(join(dir, f));
      removed.push(f);
    }
  }
  return { file, removed };
}

export const backupSize = (file: string) => statSync(file).size;
