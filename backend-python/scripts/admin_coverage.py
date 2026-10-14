"""Ministry (admin) coverage of the regression run: API routes and app screens.

* Lists every endpoint the ``admin`` role may call (read from the FastAPI source),
  and marks it verified when a Ministry account (``admin``, ``mef.*``) called it
  during the run (step logs written by the pilot and the end-to-end suite).
* Maps each Ministry screen of the mobile app to the API helpers it imports and
  the endpoints behind them, so the report reads « screen → endpoint → tested ».

Standard library only. ``--min`` fails the run below a coverage percentage.

Usage: python scripts/admin_coverage.py --repo . --reports backend-python/reports --min 100
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

MINISTRY_ACTORS = {"admin", "mef.dp2", "mef.brigade"}
DOMAIN_OF = [
    ("/api/admin/inbox", "À traiter et décisions"),
    ("/api/admin/authorities", "Parties prenantes"),
    ("/api/admin", "Comptes et administration"),
    ("/api/organizations", "Organisations"),
    ("/api/titles", "Titres, UFA, AAC, conventions, études"),
    ("/api/felling", "Déclarations et registre des arbres"),
    ("/api/compliance", "Déclarations et registre des arbres"),
    ("/api/documents", "Pièces légales"),
    ("/api/taxes", "Fiscalité"),
    ("/api/community", "Social (CCC / FDL)"),
    ("/api/certifications", "Certifications"),
    ("/api/eudr", "RDUE"),
    ("/api/traceability", "Traçabilité (DF10, états)"),
    ("/api/transport", "Transport"),
    ("/api/controls", "Contrôles terrain et PV"),
    ("/api/anomalies", "Anomalies"),
    ("/api/dashboard", "Tableau de bord"),
]


def domain(path: str) -> str:
    return next((label for prefix, label in DOMAIN_OF if path.startswith(prefix)), "Autres")


def admin_routes(backend: Path) -> list[tuple[str, str]]:
    main = (backend / "app" / "main.py").read_text(encoding="utf-8")
    prefixes = dict(re.findall(r"include_router\((\w+)\.router, prefix=\"([^\"]*)\"", main))
    out = []
    for f in sorted((backend / "app" / "api").glob("*.py")):
        pre = prefixes.get(f.stem) or prefixes.get(f"{f.stem}_api")
        if pre is None:
            continue
        for node in ast.parse(f.read_text(encoding="utf-8")).body:
            if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
                continue
            roles = {
                a.value
                for sub in ast.walk(node.args)
                if isinstance(sub, ast.Call) and getattr(sub.func, "id", "") == "require_roles"
                for a in sub.args
                if isinstance(a, ast.Constant)
            }
            if "admin" not in roles:
                continue
            for dec in node.decorator_list:
                if (
                    isinstance(dec, ast.Call)
                    and isinstance(dec.func, ast.Attribute)
                    and getattr(dec.func.value, "id", "") == "router"
                    and dec.args
                ):
                    out.append((dec.func.attr.upper(), pre + dec.args[0].value))
    return out


def pattern(path: str) -> re.Pattern:
    return re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", path) + "$")


def ministry_calls(reports: Path) -> list[tuple[str, str]]:
    calls = []
    for f in reports.glob("*.json"):
        try:
            steps = json.loads(f.read_text(encoding="utf-8")).get("steps", [])
        except (ValueError, AttributeError):
            continue
        calls += [(s["method"], s["path"]) for s in steps if s.get("actor") in MINISTRY_ACTORS]
    return calls


def client_paths(mobile: Path) -> dict[str, list[str]]:
    """API helper name → endpoint paths it calls (from mobile/src/api/client.ts and pdf.ts)."""
    helpers: dict[str, list[str]] = {}
    for file in (mobile / "src" / "api" / "client.ts", mobile / "src" / "pdf.ts"):
        if not file.exists():
            continue
        text = file.read_text(encoding="utf-8")
        starts = [
            (m.start(), m.group(1))
            for m in re.finditer(r"export (?:async function|const|function) (\w+)", text)
        ]
        for i, (pos, name) in enumerate(starts):
            body = text[pos : starts[i + 1][0] if i + 1 < len(starts) else len(text)]
            paths = re.findall(r"/api/(?:[A-Za-z0-9_\-./]|\$\{[A-Za-z0-9_.()\[\]]+\})*", body)
            helpers[name] = [
                re.sub(r"(?<!/)\{x\}$", "", re.sub(r"\$\{[^}]+\}", "{x}", p)).rstrip("/.")
                for p in paths
            ]
    return helpers


def screens(mobile: Path) -> list[Path]:
    src = mobile / "src"
    files = sorted((src / "screens" / "ministry").glob("*.tsx")) + sorted(
        (src / "components").glob("Admin*.tsx")
    )
    files += [
        f
        for f in sorted((src / "components").glob("*.tsx"))
        if not f.stem.startswith(("Company", "Org", "Admin"))
        and re.search(
            r"mode\s*===?\s*\"admin\"|\"company\"\s*\|\s*\"admin\"", f.read_text(encoding="utf-8")
        )
    ]
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--reports", default="backend-python/reports")
    ap.add_argument("--min", type=float, default=0)
    args = ap.parse_args()
    repo = Path(args.repo)
    routes = admin_routes(repo / "backend-python")
    calls = ministry_calls(Path(args.reports))
    verified = {
        (m, p) for m, p in routes if any(cm == m and pattern(p).match(cp) for cm, cp in calls)
    }
    pct = 100 * len(verified) / len(routes) if routes else 100.0

    out = [
        "## Couverture du Ministère (Admin)",
        "",
        f"**{len(verified)}/{len(routes)}** points d'accès du Ministère vérifiés par la régression"
        f" (**{pct:.0f} %**)",
        "",
    ]
    by_domain: dict[str, list[tuple[str, str]]] = {}
    for r in routes:
        by_domain.setdefault(domain(r[1]), []).append(r)
    out += ["| Domaine | Vérifiés | Non vérifiés |", "| --- | --- | --- |"]
    for label, rows in sorted(by_domain.items()):
        missing = [f"`{m} {p}`" for m, p in rows if (m, p) not in verified]
        out.append(
            f"| {label} | {len(rows) - len(missing)}/{len(rows)} | {', '.join(missing) or '—'} |"
        )

    helpers = client_paths(repo / "mobile")
    rows = []
    for screen in screens(repo / "mobile"):
        text = screen.read_text(encoding="utf-8")
        imported = set()
        for block in re.findall(r"import\s*\{([^}]*)\}\s*from\s*\"[./]+(?:api/client|pdf)\"", text):
            imported |= {n.strip().split(" as ")[0] for n in block.split(",") if n.strip()}
        paths = sorted(
            p
            for p in {p for name in imported for p in helpers.get(name, [])}
            if any(pattern(rp).match(p.replace("{x}", "1")) for _, rp in routes)
        )
        if not paths:
            continue
        tested = [
            p for p in paths if any(pattern(rp).match(p.replace("{x}", "1")) for _, rp in verified)
        ]
        rows.append((screen.stem, len(tested), len(paths)))
    if rows:
        out += [
            "",
            "### Écrans du Ministère → points d'accès vérifiés",
            "",
            "| Écran | Points d'accès appelés et vérifiés |",
            "| --- | --- |",
        ]
        out += [
            f"| {name} | {ok}/{total} {'✅' if ok == total else '⚠️'} |" for name, ok, total in rows
        ]

    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(out))
    if pct < args.min:
        print(f"\n**Couverture insuffisante : {pct:.0f} % < {args.min:.0f} %**")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
