import { defineConfig } from "vite";

// base relative : le build est servi depuis le système de fichiers par Capacitor.
export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  build: { target: "es2020", chunkSizeWarningLimit: 1600 },
  server: { host: "127.0.0.1" },
});
