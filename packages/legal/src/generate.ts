/** Liste des fichiers générés (chemins relatifs à la racine du dépôt). Utilisée par le script de build et par les tests. */
import { toHtml, toMarkdown } from "./blocks";
import { allPlayerDocs } from "./documents";
import { dpia, register } from "./internal";
import { dataSafety, iarc, privacyManifest, traderSheet, umpConfig } from "./stores";

export interface Output { path: string; content: string }

export function outputs(): Output[] {
  const out: Output[] = [];
  for (const d of allPlayerDocs()) {
    out.push({ path: `docs/legal/${d.lang}/${d.id}.md`, content: toMarkdown(d) });
    out.push({ path: `apps/game/public/legal/${d.lang}/${d.id}.html`, content: toHtml(d) });
  }
  out.push({ path: "docs/legal/internal/registre.md", content: toMarkdown(register()) });
  out.push({ path: "docs/legal/internal/aipd.md", content: toMarkdown(dpia()) });
  for (const d of [dataSafety(), iarc(), traderSheet(), umpConfig()]) out.push({ path: `docs/stores/${d.id}.md`, content: toMarkdown(d) });
  out.push({ path: "docs/stores/PrivacyInfo.xcprivacy", content: privacyManifest() });
  return out;
}
