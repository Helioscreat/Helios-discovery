// Génère les documents juridiques et les déclarations des stores.
//   node scripts/build.mjs            écrit les fichiers
//   node scripts/build.mjs --check    échoue si un fichier généré n'est pas à jour
//   node scripts/build.mjs --strict   échoue s'il reste des valeurs ⟦À COMPLÉTER⟧ (contrôle avant publication)
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const outfile = join(here, "../dist/generate.mjs");
await build({ entryPoints: [join(here, "../src/generate.ts")], outfile, bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "warning" });
const { outputs } = await import(pathToFileURL(outfile).href);
const args = new Set(process.argv.slice(2));
const stale = [];
const placeholders = new Map();
for (const o of outputs()) {
  const p = join(root, o.path);
  for (const m of o.content.match(/⟦[^⟧]*⟧/g) ?? []) placeholders.set(m, (placeholders.get(m) ?? 0) + 1);
  if (args.has("--check")) {
    if (!existsSync(p) || readFileSync(p, "utf8") !== o.content) stale.push(o.path);
  } else {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, o.content);
  }
}
if (stale.length) {
  console.error(`✗ ${stale.length} fichier(s) généré(s) pas à jour : lancer npm run build -w @helios/legal\n  ${stale.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ ${outputs().length} fichiers ${args.has("--check") ? "à jour" : "écrits"}`);
if (placeholders.size) {
  console.log(`  ${placeholders.size} valeur(s) à compléter avant publication :\n  ${[...placeholders.keys()].join("\n  ")}`);
  if (args.has("--strict")) process.exit(1);
}
