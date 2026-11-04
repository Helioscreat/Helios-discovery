// Construit la CLI en un seul fichier CommonJS (le même fichier sert de thread principal et de worker).
import { build } from "esbuild";
await build({
  entryPoints: [new URL("../src/cli.ts", import.meta.url).pathname],
  outfile: new URL("../dist/cli.cjs", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  logLevel: "warning",
});
