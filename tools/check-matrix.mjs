#!/usr/bin/env node
// Valide compliance/matrix.yaml, génère docs/matrice-conformite.md,
// et (avec --coverage) vérifie que chaque test.id apparaît dans un fichier de test.
// --strict : code de sortie 1 si un test manque (à activer en CI à partir du livrable 8).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const NATURES = new Set(["obligation", "store", "engagement"]);
const TYPES = new Set(["unit", "property", "e2e-ui", "network", "server", "sim", "config", "static", "doc", "manual"]);
const REQUIRED = ["id", "section", "ref", "nature", "exigence", "fonctionnalite", "test", "livrable"];

const { rows } = parse(readFileSync(join(root, "compliance/matrix.yaml"), "utf8"));
const errors = [];
const ids = new Set(), testIds = new Set();

for (const [i, r] of rows.entries()) {
  const where = r.id ?? `ligne #${i}`;
  for (const k of REQUIRED) if (r[k] === undefined || r[k] === "") errors.push(`${where}: champ manquant ${k}`);
  if (ids.has(r.id)) errors.push(`${where}: id dupliqué`);
  ids.add(r.id);
  if (!NATURES.has(r.nature)) errors.push(`${where}: nature invalide ${r.nature}`);
  if (!Number.isInteger(r.livrable) || r.livrable < 1 || r.livrable > 8) errors.push(`${where}: livrable hors 1..8`);
  const t = r.test ?? {};
  if (!/^T-[A-Z]+-\d{2}$/.test(t.id ?? "")) errors.push(`${where}: test.id invalide ${t.id}`);
  if (t.id !== `T-${r.id}`) errors.push(`${where}: test.id doit valoir T-${r.id}`);
  if (testIds.has(t.id)) errors.push(`${where}: test.id dupliqué`);
  testIds.add(t.id);
  if (!TYPES.has(t.type)) errors.push(`${where}: test.type invalide ${t.type}`);
  if (!t.verif || t.verif.length < 20) errors.push(`${where}: test.verif trop vague`);
}

// Toutes les sous-sections 8.x du cahier des charges doivent être couvertes.
for (const s of ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9"])
  if (!rows.some((r) => String(r.section).includes(s))) errors.push(`section ${s} non couverte`);

if (errors.length) {
  console.error(`✗ matrice invalide (${errors.length} erreurs)\n  ` + errors.join("\n  "));
  process.exit(1);
}

// Couverture : recherche "[T-XXX-NN]" dans les fichiers de test.
let found = new Map();
if (args.has("--coverage")) {
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (["node_modules", ".git", "dist"].includes(f)) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(test|spec)\.[cm]?[jt]sx?$|\.checklist\.md$/.test(f) ? [p] : [];
  });
  for (const f of walk(root)) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\[(T-[A-Z]+-\d{2})\]/g)) found.set(m[1], f.slice(root.length + 1));
  }
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const by = (k) => rows.reduce((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {});
let md = `# Matrice de conformité\n\n> Généré par \`npm run matrix\` depuis \`compliance/matrix.yaml\`. Ne pas éditer à la main.\n\n`;
md += `${rows.length} exigences. Par nature : ${Object.entries(by("nature")).map(([k, v]) => `${k} ${v}`).join(", ")}. `;
md += `Par livrable : ${Object.entries(by("livrable")).sort().map(([k, v]) => `L${k}: ${v}`).join(", ")}.\n\n`;
md += `| ID | § | Base | Nature | Exigence | Fonctionnalité | Test | Type | Vérification | L | Statut |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  const st = found.has(r.test.id) ? `✅ ${found.get(r.test.id)}` : "⏳ à implémenter";
  md += `| ${r.id} | ${r.section} | ${esc(r.ref)} | ${r.nature} | ${esc(r.exigence)} | ${esc(r.fonctionnalite)} | ${r.test.id} | ${r.test.type} | ${esc(r.test.verif)} | ${r.livrable} | ${st} |\n`;
}
writeFileSync(join(root, "docs/matrice-conformite.md"), md);

const covered = rows.filter((r) => found.has(r.test.id)).length;
console.log(`✓ matrice valide : ${rows.length} exigences, ${testIds.size} tests déclarés`);
if (args.has("--coverage")) {
  console.log(`  couverture : ${covered}/${rows.length}`);
  if (args.has("--strict") && covered < rows.length) process.exit(1);
}
