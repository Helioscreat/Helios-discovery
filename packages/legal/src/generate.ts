/** Liste des fichiers générés (chemins relatifs à la racine du dépôt). Utilisée par le script de build et par les tests. */
import { toHtml, toMarkdown } from "./blocks";
import { allPlayerDocs, LOCALES, PLAYER_DOCS } from "./documents";
import { PHRASES } from "./phrases";
import { dpia, register } from "./internal";
import { dataSafety, iarc, privacyManifest, traderSheet, umpConfig } from "./stores";

export interface Output { path: string; content: string }

/** Page d'accueil des documents publiés (GitHub Pages) : un lien par document et par langue. */
function legalIndex(): string {
  const docs = allPlayerDocs();
  const sections = LOCALES.map((l) => {
    const items = PLAYER_DOCS.map((id) => docs.find((d) => d.lang === l && d.id === id)!).map((d) => `<li><a href="${l}/${d.id}.html">${d.title}</a></li>`).join("");
    return `<section lang="${l}"><h2>${PHRASES[l]["lang.name"]}</h2><ul>${items}</ul></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Helios Discovery — documents juridiques</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8f1;--fg:#1f2430;--link:#1d4fa8}
@media (prefers-color-scheme:dark){:root{--bg:#161a22;--fg:#eef0f4;--link:#8fb4ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:24px 16px 64px}a{color:var(--link)}
</style>
</head>
<body>
<main>
<h1>Helios Discovery</h1>
${sections}
</main>
</body>
</html>
`;
}

export function outputs(): Output[] {
  const out: Output[] = [];
  for (const d of allPlayerDocs()) {
    out.push({ path: `docs/legal/${d.lang}/${d.id}.md`, content: toMarkdown(d) });
    out.push({ path: `apps/game/public/legal/${d.lang}/${d.id}.html`, content: toHtml(d) });
  }
  out.push({ path: "apps/game/public/legal/index.html", content: legalIndex() });
  out.push({ path: "docs/legal/internal/registre.md", content: toMarkdown(register()) });
  out.push({ path: "docs/legal/internal/aipd.md", content: toMarkdown(dpia()) });
  for (const d of [dataSafety(), iarc(), traderSheet(), umpConfig()]) out.push({ path: `docs/stores/${d.id}.md`, content: toMarkdown(d) });
  out.push({ path: "docs/stores/PrivacyInfo.xcprivacy", content: privacyManifest() });
  return out;
}
