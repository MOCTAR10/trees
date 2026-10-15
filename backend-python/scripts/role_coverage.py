"""Coverage of the regression run, per role: API endpoints and app screens.

For a role (``admin``, ``company``, ``operator``, ``cooperative``):

* lists every endpoint that role may call — those whose ``require_roles`` names it,
  plus, for field roles, the endpoints open to any signed-in user (home, projects,
  map…), read from the FastAPI source;
* marks an endpoint verified when an account of that role called it during the run
  (step logs written by the pilot story and the end-to-end suite; pilot aliases
  ``admin``/``mef.*`` = Ministry, ``*.dg``/``*.chef`` = company, ``*.agent*`` = field
  agent, ``*.pres`` = cooperative);
* maps each screen of that role in the mobile app to the API helpers it imports, so
  the report reads « screen → endpoint → tested ».

Standard library only. ``--min`` fails the run below a coverage percentage.

Usage: python scripts/role_coverage.py --role company --repo . --reports backend-python/reports --min 100
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

ROLE_LABEL = {
    "admin": "Ministère (Admin)",
    "company": "Entreprise",
    "operator": "Agent de terrain",
    "cooperative": "Coopérative",
}

#: Endpoints outside the administrative workflow (scanner pipeline with images,
#: knowledge base, diagnostics) — covered by their own unit and smoke tests.
OUT_OF_SCOPE = ("/api/v1", "/api/v2", "/api/knowledge", "/api/diagnostics", "/api/auth/check-email")

DOMAIN_OF = [
    ("/api/admin/inbox", "À traiter et décisions"),
    ("/api/admin/authorities", "Parties prenantes"),
    ("/api/admin", "Comptes et administration"),
    ("/api/company", "Espace entreprise et résidus"),
    ("/api/cooperative", "Coopérative et résidus"),
    ("/api/organizations", "Organisations"),
    ("/api/titles", "Titres, UFA, AAC, conventions, études"),
    ("/api/felling", "Déclarations, registre et chaîne de garde"),
    ("/api/compliance", "Déclarations, registre et chaîne de garde"),
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
    ("/api/projects", "Chantiers et projets"),
    ("/api/home", "Accueil et profil"),
    ("/api/auth", "Accueil et profil"),
    ("/api/group", "Accueil et profil"),
    ("/api/map", "Carte"),
    ("/api/species", "Espèces"),
]


def domain(path: str) -> str:
    return next((label for prefix, label in DOMAIN_OF if path.startswith(prefix)), "Autres")


def actor_role(alias: str) -> str | None:
    if alias == "admin" or alias.startswith("mef."):
        return "admin"
    if alias.endswith((".dg", ".chef")):
        return "company"
    if ".agent" in alias:
        return "operator"
    if alias.endswith(".pres"):
        return "cooperative"
    return None


def routes_for(backend: Path, role: str) -> list[tuple[str, str]]:
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
            calls = [sub for sub in ast.walk(node.args) if isinstance(sub, ast.Call)]
            roles = {
                a.value
                for c in calls
                if getattr(c.func, "id", "") == "require_roles"
                for a in c.args
                if isinstance(a, ast.Constant)
            }
            signed_in = any(getattr(c.func, "id", "") == "Depends" for c in calls)
            allowed = role in roles or (not roles and signed_in and role != "admin")
            if not allowed:
                continue
            for dec in node.decorator_list:
                if (
                    isinstance(dec, ast.Call)
                    and isinstance(dec.func, ast.Attribute)
                    and getattr(dec.func.value, "id", "") == "router"
                    and dec.args
                ):
                    path = pre + dec.args[0].value
                    if not path.startswith(OUT_OF_SCOPE):
                        out.append((dec.func.attr.upper(), path))
    return out


def pattern(path: str) -> re.Pattern:
    return re.compile("^" + re.sub(r"\{[^}]+\}", "[^/]+", path) + "$")


def role_calls(reports: Path, role: str) -> list[tuple[str, str]]:
    calls = []
    for f in reports.glob("*.json"):
        try:
            steps = json.loads(f.read_text(encoding="utf-8")).get("steps", [])
        except (ValueError, AttributeError):
            continue
        calls += [(s["method"], s["path"]) for s in steps if actor_role(s.get("actor", "")) == role]
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


def _shared(src: Path, mode: str) -> list[Path]:
    return [
        f
        for f in sorted((src / "components").glob("*.tsx"))
        if not f.stem.startswith(("Company", "Org", "Admin"))
        and re.search(
            rf"mode\s*===?\s*\"{mode}\"|\"company\"\s*\|\s*\"admin\"", f.read_text(encoding="utf-8")
        )
    ]


def screens(mobile: Path, role: str) -> list[Path]:
    src = mobile / "src"
    s, c = src / "screens", src / "components"
    if role == "admin":
        return (
            sorted((s / "ministry").glob("*.tsx"))
            + sorted(c.glob("Admin*.tsx"))
            + _shared(src, "admin")
        )
    if role == "company":
        own = [
            s / n
            for n in (
                "CompanyScreen.tsx",
                "CompanyHomeScreen.tsx",
                "CustodyScreen.tsx",
                "DeclareScreen.tsx",
                "ProjetsScreen.tsx",
                "CreateProjectScreen.tsx",
                "ProjectDetailScreen.tsx",
                "ChantierScreen.tsx",
            )
        ]
        return (
            own
            + sorted(c.glob("Company*.tsx"))
            + sorted(c.glob("Org*.tsx"))
            + _shared(src, "company")
        )
    if role == "operator":
        return [
            s / n
            for n in (
                "HomeScreen.tsx",
                "CaptureScreen.tsx",
                "ChantierScreen.tsx",
                "CustodyScreen.tsx",
                "ProjetsScreen.tsx",
                "ProjectDetailScreen.tsx",
                "HistoryScreen.tsx",
                "ProfileScreen.tsx",
                "ReportScreen.tsx",
            )
        ]
    return [s / "CooperativeScreen.tsx"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", default="admin", choices=sorted(ROLE_LABEL))
    ap.add_argument("--repo", default=".")
    ap.add_argument("--reports", default="backend-python/reports")
    ap.add_argument("--min", type=float, default=0)
    args = ap.parse_args()
    repo = Path(args.repo)
    label = ROLE_LABEL[args.role]
    routes = routes_for(repo / "backend-python", args.role)
    calls = role_calls(Path(args.reports), args.role)
    verified = {
        (m, p) for m, p in routes if any(cm == m and pattern(p).match(cp) for cm, cp in calls)
    }
    pct = 100 * len(verified) / len(routes) if routes else 100.0

    out = [
        f"## Couverture — {label}",
        "",
        f"**{len(verified)}/{len(routes)}** points d'accès vérifiés par un compte « {label} »"
        f" (**{pct:.0f} %**)",
        "",
    ]
    by_domain: dict[str, list[tuple[str, str]]] = {}
    for r in routes:
        by_domain.setdefault(domain(r[1]), []).append(r)
    out += ["| Domaine | Vérifiés | Non vérifiés |", "| --- | --- | --- |"]
    for name, rows in sorted(by_domain.items()):
        missing = [f"`{m} {p}`" for m, p in rows if (m, p) not in verified]
        out.append(
            f"| {name} | {len(rows) - len(missing)}/{len(rows)} | {', '.join(missing) or '—'} |"
        )

    helpers = client_paths(repo / "mobile")
    rows = []
    for screen in screens(repo / "mobile", args.role):
        if not screen.exists():
            continue
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
            f"### Écrans « {label} » → points d'accès vérifiés",
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
        print(f"\n**Couverture insuffisante pour « {label} » : {pct:.0f} % < {args.min:.0f} %**")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
