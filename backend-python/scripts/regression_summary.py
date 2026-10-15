"""Turn regression reports into a Markdown summary (GitHub job summary).

Reads the JUnit files and the scenario step logs written by the regression
workflow; standard library only, so it runs on the bare CI runner.

Usage: python scripts/regression_summary.py reports/ >> "$GITHUB_STEP_SUMMARY"
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

DOMAINS = {
    "test_pilot_workflows": "Parcours complet par rôle",
    "test_regression_01_access": "Comptes, rôles et cloisonnement",
    "test_regression_02_titles_aac": "Titres, AAC et autorisation (art. 14)",
    "test_regression_03_declarations": "Déclaration et porte de conformité",
    "test_regression_04_custody": "Chaîne de garde de la grume",
    "test_regression_05_compliance": "Pièces, fiscalité, certifications, études, RDUE",
    "test_regression_06_ministry": "Contrôles, PV, échéances, vues Ministère et entreprises",
    "test_admin_01_accounts_orgs": "Ministère · comptes, organisations, rattachements",
    "test_admin_02_titles": "Ministère · titres, UFA, AAC, DME, conventions, autorisations, études",
    "test_admin_03_instruction": "Ministère · déclarations, pièces, fiscalité, social, certifications, RDUE",
    "test_admin_04_control": "Ministère · traçabilité, transport, contrôles, anomalies, rapports",
    "test_company_01_home_titles": "Entreprise · accueil, profil, carte, espèces, titres et actes",
    "test_company_02_operations": "Entreprise · déclarations, DF10, états, transport, RDUE, social, fiscalité",
    "test_company_03_projects_residues": "Entreprise · chantiers, projets, résidus et coopératives",
}


def junit_cases(path: Path) -> list[dict]:
    cases = []
    for case in ET.parse(path).getroot().iter("testcase"):
        props = {p.get("name"): p.get("value") for p in case.iter("property")}
        failed = case.find("failure") is not None or case.find("error") is not None
        skipped = case.find("skipped") is not None
        module = (case.get("classname") or "").split(".")[-1]
        cases.append(
            {
                "module": module,
                "name": case.get("name"),
                "rule": props.get("regle") or case.get("name"),
                "time": float(case.get("time") or 0),
                "status": "échec" if failed else "ignoré" if skipped else "ok",
            }
        )
    return cases


def main(folder: str) -> int:
    root = Path(folder)
    out = ["## Régression du workflow — Foresterie Numérique", ""]
    for xml in sorted(root.glob("*.xml")):
        cases = junit_cases(xml)
        ok = sum(c["status"] == "ok" for c in cases)
        ko = [c for c in cases if c["status"] == "échec"]
        out += [
            f"### {xml.stem} : {ok}/{len(cases)} réussis"
            + (f" · **{len(ko)} échec(s)**" if ko else " ✅"),
            "",
        ]
        by_module: dict[str, list[dict]] = {}
        for c in cases:
            by_module.setdefault(c["module"], []).append(c)
        for module, rows in by_module.items():
            good = sum(r["status"] == "ok" for r in rows)
            out += [
                f"<details><summary><b>{DOMAINS.get(module, module)}</b> — {good}/{len(rows)}</summary>",
                "",
                "| Règle vérifiée | Résultat | Durée |",
                "| --- | --- | --- |",
            ]
            for r in rows:
                param = r["name"].partition("[")[2].rstrip("]")
                label = f"{r['rule']} `{param}`" if param else r["rule"]
                mark = "✅" if r["status"] == "ok" else "⏭️" if r["status"] == "ignoré" else "❌"
                out.append(f"| {label} | {mark} | {r['time']:.2f} s |")
            out += ["", "</details>", ""]
    for md in sorted(root.glob("*.json.md")):
        out += [
            "<details><summary><b>Déroulé : " + md.name.removesuffix(".json.md") + "</b></summary>",
            "",
            md.read_text(encoding="utf-8"),
            "</details>",
            "",
        ]
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "reports"))
