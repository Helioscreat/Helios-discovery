"""Fusionne une génération complète et des régénérations ciblées (--only) en un seul jeu de sorties.
Usage : python3 scripts/merge-generated.py base repair1 [repair2 ...] dest
Chaque niveau régénéré remplace l'entrée correspondante (dans l'ordre des dossiers donnés)."""
import csv, json, os, shutil, sys

*srcs, dest = sys.argv[1:]
rows, manifest, header = {}, {}, None
for src in srcs:
    with open(os.path.join(src, "report.csv")) as f:
        r = csv.reader(f); header = next(r)
        for row in r: rows[int(row[0])] = row
    m = json.load(open(os.path.join(src, "manifest.json")))
    for e in m["levels"]: manifest[e[0]] = e
    lv = os.path.join(src, "levels")
    if os.path.isdir(lv) and src != srcs[0]:
        for f in os.listdir(lv): shutil.copy(os.path.join(lv, f), os.path.join(srcs[0], "levels", f))
os.makedirs(dest, exist_ok=True)
ordered = [rows[n] for n in sorted(rows)]
with open(os.path.join(dest, "report.csv"), "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n"); w.writerow(header); w.writerows(ordered)
idx = {h: i for i, h in enumerate(header)}
json.dump({"version": 1, "from": min(rows), "to": max(rows), "levels": [manifest[n] for n in sorted(manifest)]}, open(os.path.join(dest, "manifest.json"), "w"), separators=(",", ":"))
summaries = [json.load(open(os.path.join(s, "summary.json"))) for s in srcs]
ok = sum(1 for r in ordered if r[idx["statut"]] == "ok")
audited = [r for r in ordered if r[idx["taux_audit"]]]
audit_ok = sum(1 for r in audited if abs(float(r[idx["taux_audit"]]) - float(r[idx["cible"]])) <= 0.1)
below = [r for r in ordered if float(r[idx["taux_bot"]]) + 1e-9 < float(r[idx["cible"]])]
summary = {
    "command": "generate", "from": min(rows), "to": max(rows), "version": 1, "runs": summaries[0]["runs"], "workers": summaries[0]["workers"],
    "seconds": summaries[0]["seconds"],
    "repairSeconds": [s["seconds"] for s in summaries[1:]],
    "note": "seconds = génération complète en une passe ; repairSeconds = régénérations ciblées après correction de la règle d'acceptation (voir README).",
    # Infaisables : niveaux en erreur dans une passe et absents du résultat fusionné.
    "levels": len(ordered), "infeasible": len({e["n"] for s in summaries for e in s.get("errors", []) if e["n"] not in rows}), "errors": [e for s in summaries for e in s.get("errors", []) if e["n"] not in rows],
    "inRange": ok, "inRangeShare": ok / len(ordered),
    "belowTarget": len(below), "maxBelowTarget": round(max((float(r[idx["cible"]]) - float(r[idx["taux_bot"]]) for r in below), default=0), 3),
    "audited": len(audited), "auditInRange": audit_ok, "auditInRangeShare": audit_ok / len(audited),
}
json.dump(summary, open(os.path.join(dest, "summary.json"), "w"), indent=2)
print(json.dumps(summary, indent=2))
