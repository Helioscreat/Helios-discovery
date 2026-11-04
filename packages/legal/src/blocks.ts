/** Modèle de document minimal, rendu en Markdown (dépôt, relecture) et en HTML (servi dans le jeu et sur le site). */
export type Block =
  | { h: 1 | 2 | 3; text: string; id?: string }
  | { p: string }
  | { ul: string[] }
  | { table: { head: string[]; rows: string[][] } };

export interface Doc {
  /** Identifiant stable du document (nom de fichier). */
  id: string;
  lang: string;
  title: string;
  blocks: Block[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (s: string) => esc(s).replace(/https:\/\/[^\s<)]+[^\s<).,;:]/g, (u) => `<a href="${u}">${u}</a>`);

export function toMarkdown(d: Doc): string {
  const out: string[] = [];
  for (const b of d.blocks) {
    if ("h" in b) out.push(`${"#".repeat(b.h)} ${b.text}`);
    else if ("p" in b) out.push(b.p);
    else if ("ul" in b) out.push(b.ul.map((x) => `- ${x}`).join("\n"));
    else {
      const cell = (c: string) => c.replace(/\|/g, "\\|");
      out.push([`| ${b.table.head.map(cell).join(" | ")} |`, `|${b.table.head.map(() => "---").join("|")}|`, ...b.table.rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n"));
    }
  }
  return out.join("\n\n") + "\n";
}

export function toHtml(d: Doc): string {
  const body = d.blocks
    .map((b) => {
      if ("h" in b) return `<h${b.h}${b.id ? ` id="${b.id}"` : ""}>${esc(b.text)}</h${b.h}>`;
      if ("p" in b) return `<p>${link(b.p)}</p>`;
      if ("ul" in b) return `<ul>${b.ul.map((x) => `<li>${link(x)}</li>`).join("")}</ul>`;
      return `<div class="table"><table><thead><tr>${b.table.head.map((x) => `<th scope="col">${esc(x)}</th>`).join("")}</tr></thead><tbody>${b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${link(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="${d.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(d.title)} — Helios Discovery</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8f1;--fg:#1f2430;--muted:#555c6b;--line:#d9d3c4;--link:#1d4fa8}
@media (prefers-color-scheme:dark){:root{--bg:#161a22;--fg:#eef0f4;--muted:#b4bac6;--line:#3a4150;--link:#8fb4ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.7rem;line-height:1.2}h2{font-size:1.25rem;margin-top:2em}h3{font-size:1.05rem}
a{color:var(--link);overflow-wrap:anywhere}
.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.95rem}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/** Texte brut (lisibilité, recherche de rubriques). */
export const plainText = (d: Doc) =>
  d.blocks.map((b) => ("h" in b ? b.text : "p" in b ? b.p : "ul" in b ? b.ul.join("\n") : [b.table.head, ...b.table.rows].map((r) => r.join(" ; ")).join("\n"))).join("\n");
