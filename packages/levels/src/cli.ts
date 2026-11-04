/**
 * CLI de production des niveaux.
 *
 *   generate --from 151 --to 10000 --validate [--out out] [--workers 4] [--runs 200] [--audit 0.1] [--no-json]
 *   design   --from 1 --to 150 [--runs 200]           (calibre les niveaux faits main → data/handmade/)
 *
 * Sorties de `generate` (dans --out) :
 *   levels/NNNNN.json   un fichier par niveau (sauf --no-json)
 *   report.csv          N, type, difficulté, cible, taux bot, coups, coups restants moyens, audit, statut…
 *   manifest.json       table compacte (tentative, échelle, coups, empreinte) : le jeu régénère le niveau à l'identique
 *   summary.json        durée, part dans la fourchette, niveaux infaisables, audit hors échantillon
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { designLevel, HANDMADE_COUNT } from "./handmade";
import { DEFAULT_GENERATE, generateLevel, levelHash, type GenerateOptions, type GeneratedLevel } from "./generator";
import { CONTENT_VERSION, TOLERANCE, type LevelFile } from "./schema";

interface Job { n: number; audit: boolean; mode: "generate" | "design" }
interface Done { n: number; result?: GeneratedLevel; error?: string; ms: number }

function arg(argv: string[], name: string, def?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

const pad = (n: number) => String(n).padStart(5, "0");

function csvRow(r: GeneratedLevel): string {
  const l = r.level;
  const goals = l.goals.map((g) => (g.type === "collect" ? `collect:${g.color}:${g.count}` : g.type === "clear" ? `clear:${g.target}:${g.count}` : g.type === "drop" ? `drop:${g.count}` : `score:${g.target}`)).join("+");
  return [
    l.n, r.goalKind, l.difficulty, l.targetRate.toFixed(2), l.validation.botRate.toFixed(3), l.moves, l.validation.avgMovesLeft.toFixed(2),
    l.validation.auditRate !== undefined ? l.validation.auditRate.toFixed(3) : "", r.attempts, l.validation.status, r.shape, l.colors, goals,
  ].join(",");
}

export const CSV_HEADER = "N,type,difficulte,cible,taux_bot,coups,coups_restants_moyens,taux_audit,tentatives,statut,forme,couleurs,objectifs";

async function main(argv: string[]) {
  const cmd = argv[0];
  if (cmd !== "generate" && cmd !== "design") {
    console.error("usage : generate --from 151 --to 10000 --validate [--out dir] [--workers n] [--runs 200] [--audit 0.1]\n        design --from 1 --to 150");
    process.exit(2);
  }
  const from = Number(arg(argv, "from", cmd === "design" ? "1" : "151"));
  const to = Number(arg(argv, "to", cmd === "design" ? String(HANDMADE_COUNT) : "10000"));
  const out = arg(argv, "out", cmd === "design" ? "data/handmade" : "out")!;
  const workers = Number(arg(argv, "workers", String(cpus().length)));
  const runs = Number(arg(argv, "runs", "200"));
  const auditShare = Number(arg(argv, "audit", "0.1"));
  const writeJson = !argv.includes("--no-json");
  if (cmd === "generate" && !argv.includes("--validate")) {
    console.error("--validate est obligatoire : un niveau non validé par le bot n'a pas de nombre de coups calibré.");
    process.exit(2);
  }
  const opts: GenerateOptions = { ...DEFAULT_GENERATE, runs };
  mkdirSync(cmd === "generate" && writeJson ? join(out, "levels") : out, { recursive: true });

  // Audit hors échantillon : un niveau sur 1/auditShare, réparti régulièrement.
  const step = auditShare > 0 ? Math.max(1, Math.round(1 / auditShare)) : Infinity;
  const queue: Job[] = [];
  for (let n = from; n <= to; n++) queue.push({ n, audit: (n - from) % step === 0, mode: cmd });
  const total = queue.length;
  const results = new Map<number, GeneratedLevel>();
  const errors: { n: number; error: string }[] = [];
  const t0 = Date.now();
  let done = 0, lastLog = 0;

  await new Promise<void>((resolve) => {
    let alive = Math.min(workers, total);
    for (let k = 0; k < alive; k++) {
      const w = new Worker(__filename, { workerData: { opts } });
      const feed = () => {
        const job = queue.shift();
        if (job) w.postMessage(job);
        else void w.terminate();
      };
      w.on("message", (d: Done) => {
        done++;
        if (d.result) {
          results.set(d.n, d.result);
          if (writeJson) {
            const file = cmd === "design" ? join(out, `${String(d.n).padStart(3, "0")}.json`) : join(out, "levels", `${pad(d.n)}.json`);
            writeFileSync(file, JSON.stringify(d.result.level, null, cmd === "design" ? 2 : 0) + "\n");
          }
        } else errors.push({ n: d.n, error: d.error ?? "?" });
        const now = Date.now();
        if (now - lastLog > 10000 || done === total) {
          lastLog = now;
          const el = (now - t0) / 1000;
          process.stdout.write(`[${cmd}] ${done}/${total} niveaux · ${el.toFixed(0)} s · reste estimé ${((el / done) * (total - done)).toFixed(0)} s\n`);
        }
        feed();
      });
      w.on("exit", () => { if (--alive === 0) resolve(); });
      feed();
    }
  });

  const secs = (Date.now() - t0) / 1000;
  const ordered = [...results.values()].sort((a, b) => a.level.n - b.level.n);
  const inRange = ordered.filter((r) => r.level.validation.status === "ok").length;
  const audited = ordered.filter((r) => r.level.validation.auditRate !== undefined);
  const auditIn = audited.filter((r) => Math.abs(r.level.validation.auditRate! - r.level.targetRate) <= TOLERANCE).length;
  const summary = {
    command: cmd, from, to, version: CONTENT_VERSION, runs, workers, seconds: Math.round(secs),
    levels: ordered.length, infeasible: errors.length, errors,
    inRange, inRangeShare: ordered.length ? inRange / ordered.length : 0,
    audited: audited.length, auditInRange: auditIn, auditInRangeShare: audited.length ? auditIn / audited.length : null,
    mcChecked: ordered.filter((r) => r.mcChecked).length,
  };
  writeFileSync(join(out, cmd === "design" ? "_report.csv" : "report.csv"), [CSV_HEADER, ...ordered.map(csvRow)].join("\n") + "\n");
  writeFileSync(join(out, cmd === "design" ? "_summary.json" : "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (cmd === "generate") {
    const manifest = {
      version: CONTENT_VERSION,
      from, to,
      // [N, tentative, échelle, coups, empreinte]
      levels: ordered.map((r) => [r.level.n, r.level.attempt, r.level.scale, r.level.moves, levelHash(r.level)]),
    };
    writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest) + "\n");
  }
  process.stdout.write(`\n${JSON.stringify({ ...summary, errors: errors.slice(0, 5) }, null, 2)}\n`);
}

if (isMainThread) {
  void main(process.argv.slice(2));
} else {
  const opts = (workerData as { opts: GenerateOptions }).opts;
  parentPort!.on("message", (job: Job) => {
    const t = Date.now();
    try {
      const o = { ...opts, auditRuns: job.audit ? opts.runs : 0 };
      const result: GeneratedLevel = job.mode === "design" ? designLevel(job.n, o) : generateLevel(job.n, o);
      parentPort!.postMessage({ n: job.n, result, ms: Date.now() - t } satisfies Done);
    } catch (e) {
      parentPort!.postMessage({ n: job.n, error: (e as Error).message, ms: Date.now() - t } satisfies Done);
    }
  });
}

export type { LevelFile };
