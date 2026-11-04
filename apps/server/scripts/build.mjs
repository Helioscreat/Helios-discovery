import { build } from "esbuild";
await build({ entryPoints: [new URL("../src/main.ts", import.meta.url).pathname], outfile: new URL("../dist/server.cjs", import.meta.url).pathname, bundle: true, platform: "node", format: "cjs", target: "node22", logLevel: "warning" });
