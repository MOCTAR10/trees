"""Pilot dataset — the whole workflow, every role, built through the real API.

Six organisations across five provinces (integrated logger, logger under a
provisional convention, sawmill, exporter, forest community, cooperative), their
managers and field agents, two Ministry inspectors, and the full chain:
titles → units/AAC → PAO → art. 14 authorisations → documents → declarations
(compliant, blocked, rejected, pending) → felling → bordereaux → reception →
processing → taxes → certifications → PPF/EIE → EUDR → CCC → field controls →
anomaly reviews → chantier and participatory project → field scans.

Every step goes through the HTTP API with its expected status, so the build is
also a functional check: forbidden steps (below DME, reserved species, art. 14,
another holder…) must be refused. Only what the API cannot do (AAC polygons,
field scans) is written in SQL.

Usage (inside the API container)::

    python -m tools.seed_pilot            # build the "PILOTE" dataset (skipped if present)
    python -m tools.seed_pilot --reset    # delete it, then rebuild
    python -m tools.seed_pilot --reset --only-reset

Logins: ``<alias>@pilote.ga`` / ``Pilote2026!`` (printed at the end).
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.config import get_settings
from app.services.biomass_engine import living_carbon
from tools.pilot_client import Pilot, ScenarioError, sql

PASSWORD = "Pilote2026!"
TODAY = date.today()


def _d(days: int) -> str:
    return (TODAY + timedelta(days=days)).isoformat()


@dataclass
class Ctx:
    ns: str
    p: Pilot
    org: dict[str, int] = field(default_factory=dict)
    user: dict[str, int] = field(default_factory=dict)
    title: dict[str, int] = field(default_factory=dict)
    ufa: dict[str, int] = field(default_factory=dict)
    aac: dict[str, int] = field(default_factory=dict)
    aac_geom: dict[str, tuple[float, float]] = field(default_factory=dict)
    decl: dict[str, int] = field(default_factory=dict)
    trees: dict[str, list[str]] = field(default_factory=dict)
    slip: dict[str, int] = field(default_factory=dict)
    project: dict[str, int] = field(default_factory=dict)
    pending_lines: list[dict] = field(default_factory=list)
    seq: int = 0
    log: list[str] = field(default_factory=list)

    @property
    def domain(self) -> str:
        return domain_for(self.ns)

    def email(self, alias: str) -> str:
        return f"{alias}@{self.domain}"

    def label(self, name: str) -> str:
        return name if self.ns == "PILOTE" else f"{name} [{self.ns}]"

    def ref(self, text: str) -> str:
        return f"{self.ns}-{text}"

    def code(self) -> str:
        self.seq += 1
        return f"GA-{self.ns}-{self.seq:04d}"

    def note(self, line: str) -> None:
        self.log.append(line)


ORGS = [
    {"key": "hob", "name": "Bois du Haut-Ogooué", "profile_code": "integre"},
    {
        "key": "cfn",
        "name": "Compagnie Forestière de la Nyanga",
        "profile_code": "exploitant_forestier",
    },
    {"key": "sdl", "name": "Scierie de Lambaréné", "profile_code": "transformateur"},
    {"key": "gte", "name": "Gabon Timber Export", "profile_code": "negoce_export"},
    {"key": "mas", "name": "Communauté de Massaha", "profile_code": "foret_communautaire"},
    {"key": "can", "name": "Coopérative des Artisans de Ntoum", "org_type": "cooperative"},
]

ACCOUNTS = [
    ("hob", "hob.dg", "company", "Clarisse", "Moussavou", None),
    ("hob", "hob.agent1", "operator", "Jean-Baptiste", "Ndong", "AGT-HOB-01"),
    ("hob", "hob.agent2", "operator", "Prisca", "Mba", "AGT-HOB-02"),
    ("cfn", "cfn.dg", "company", "Hervé", "Boussougou", None),
    ("cfn", "cfn.agent1", "operator", "Rodrigue", "Mouketou", "AGT-CFN-01"),
    ("sdl", "sdl.dg", "company", "Sylvie", "Nziengui", None),
    ("gte", "gte.dg", "company", "Marc", "Obame", None),
    ("mas", "mas.chef", "company", "Albert", "Ondo", None),
    ("mas", "mas.agent1", "operator", "Gaston", "Ella", "AGT-MAS-01"),
    ("can", "can.pres", "cooperative", "Esther", "Mabika", None),
]

INSPECTORS = [
    ("mef.dp2", "Paul", "Nguema", "MEF-DP2-01"),
    ("mef.brigade", "Aline", "Kombila", "MEF-BRG-01"),
]

#: AAC key -> (lon, lat) of its south-west corner; each AAC is a ~2.2 km square.
AAC_SITES = {
    "hob1": (13.60, -0.78),
    "hob2": (13.63, -0.78),
    "hob0": (13.57, -0.78),
    "cfn1": (11.25, -2.78),
    "mas1": (12.70, 0.42),
}
SIDE = 0.02


def domain_for(ns: str) -> str:
    return "pilote.ga" if ns == "PILOTE" else f"{ns.lower()}.pilote.ga"


def _square(lon: float, lat: float) -> str:
    x2, y2 = lon + SIDE, lat + SIDE
    return f"POLYGON(({lon} {lat},{x2} {lat},{x2} {y2},{lon} {y2},{lon} {lat}))"


def _point(ctx: Ctx, aac: str, i: int) -> tuple[float, float]:
    lon, lat = AAC_SITES[aac]
    step = SIDE / 6
    return round(lon + step * (1 + i % 5), 6), round(lat + step * (1 + (i // 5) % 5), 6)


def admin_login(p: Pilot) -> None:
    s = get_settings()
    p.login("admin", s.admin_email, s.admin_password)


def exists(ns: str) -> bool:
    rows = sql(
        [("SELECT count(*) AS n FROM organizations WHERE registration_no LIKE $1", (f"{ns}-%",))]
    )
    return bool(rows[0][0]["n"])


def reset(ns: str) -> None:
    pfx = f"GA-{ns}-%"
    domain = f"%@{domain_for(ns)}"
    reg = f"{ns}-%"
    ids = sql(
        [
            ("SELECT id FROM organizations WHERE registration_no LIKE $1", (reg,)),
            ("SELECT id FROM users WHERE email LIKE $1", (domain,)),
        ]
    )
    orgs = [r["id"] for r in ids[0]]
    users = [r["id"] for r in ids[1]]
    titles = [
        r["id"]
        for r in sql(
            [("SELECT id FROM forest_titles WHERE holder_org_id = ANY($1::int[])", (orgs,))]
        )[0]
    ]
    sql(
        [
            (
                "DELETE FROM field_controls WHERE org_id = ANY($1::int[])"
                " OR controlled_by = ANY($2::int[]) OR tree_code LIKE $3",
                (orgs, users, pfx),
            ),
            ("DELETE FROM custody_events WHERE tree_code LIKE $1", (pfx,)),
            (
                "DELETE FROM anomaly_reviews WHERE org_id = ANY($1::int[]) OR subject_key LIKE $2",
                (orgs, f"%{ns}%"),
            ),
            (
                "DELETE FROM transport_documents WHERE org_id = ANY($1::int[])"
                " OR destination_org_id = ANY($1::int[])",
                (orgs,),
            ),
            ("DELETE FROM tree_scans WHERE user_id = ANY($1::int[])", (users,)),
            (
                "DELETE FROM tree_scans_and_residues WHERE user_id = ANY($1::int[])"
                " OR logging_company_id = ANY($1::int[])",
                (users,),
            ),
            ("DELETE FROM community_cooperatives WHERE cooperative_name LIKE $1", (f"%[{ns}]%",)),
            ("DELETE FROM felling_declarations WHERE company_id = ANY($1::int[])", (users,)),
            (
                "DELETE FROM tree_registry WHERE inventory_import_id IN"
                " (SELECT id FROM inventory_imports WHERE organization_id = ANY($1::int[]))",
                (orgs,),
            ),
            ("DELETE FROM tree_registry WHERE tree_code LIKE $1", (pfx,)),
            (
                "DELETE FROM projects WHERE created_by = ANY($1::int[]) OR description LIKE $2",
                (users, f"%[{ns}]%"),
            ),
            (
                "DELETE FROM legal_documents WHERE (scope_type = 'company' AND scope_id = ANY($1::int[]))"
                " OR (scope_type = 'title' AND scope_id = ANY($2::int[]))"
                " OR (scope_type = 'ufa' AND scope_id IN"
                "     (SELECT id FROM management_units WHERE title_id = ANY($2::int[])))"
                " OR (scope_type = 'aac' AND scope_id IN (SELECT b.id FROM annual_cut_blocks b"
                "     JOIN management_units u ON u.id = b.ufa_id WHERE u.title_id = ANY($2::int[])))",
                (orgs, titles),
            ),
            ("DELETE FROM tax_receipts WHERE org_id = ANY($1::int[])", (orgs,)),
            ("DELETE FROM forest_titles WHERE id = ANY($1::int[])", (titles,)),
            ("DELETE FROM users WHERE id = ANY($1::int[])", (users,)),
            ("DELETE FROM organizations WHERE id = ANY($1::int[])", (orgs,)),
        ]
    )


# --- 1. Organisations and people -------------------------------------------
def people(ctx: Ctx) -> None:
    p = ctx.p
    for o in ORGS:
        body = {
            "name": ctx.label(o["name"]),
            "registration_no": ctx.ref(o["key"]),
            "email": ctx.email(o["key"]),
            "profile_code": o.get("profile_code"),
            "org_type": o.get("org_type"),
        }
        out = p.post(
            "admin", "/api/organizations", body, expect=201, note=f"organisation {o['key']}"
        )
        ctx.org[o["key"]] = (out.get("organization") or out)["id"]
    for org, alias, role, first, last, mat in ACCOUNTS:
        out = p.post(
            "admin",
            f"/api/organizations/{ctx.org[org]}/accounts",
            {
                "email": ctx.email(alias),
                "password": PASSWORD,
                "role": role,
                "first_name": first,
                "last_name": last,
                "matricule": mat,
                **(
                    {
                        "cooperative_profile": "energy_briquettes",
                        "latitude": 0.39,
                        "longitude": 9.76,
                    }
                    if role == "cooperative"
                    else {}
                ),
            },
            expect=201,
            note=f"compte {alias}",
        )
        ctx.user[alias] = out["id"]
        p.login(alias, ctx.email(alias), PASSWORD)
    for alias, first, last, mat in INSPECTORS:
        out = p.post(
            "admin",
            "/api/admin/users",
            {
                "email": ctx.email(alias),
                "password": PASSWORD,
                "role": "admin",
                "first_name": first,
                "last_name": last,
                "matricule": mat,
                "display_name": f"{first} {last}",
            },
            expect=201,
            note=f"inspecteur {alias}",
        )
        ctx.user[alias] = out["id"]
        p.login(alias, ctx.email(alias), PASSWORD)
    p.refused(
        "admin",
        "POST",
        f"/api/organizations/{ctx.org['hob']}/accounts",
        {
            "email": ctx.email("hob.agent1"),
            "password": PASSWORD,
            "role": "operator",
            "first_name": "X",
            "last_name": "Y",
        },
        409,
        "e-mail déjà utilisé",
    )
    ctx.note(f"{len(ORGS)} organisations, {len(ACCOUNTS)} comptes, {len(INSPECTORS)} inspecteurs")


# --- 2. Titles ---------------------------------------------------------------
def titles(ctx: Ctx) -> None:
    p = ctx.p
    hob = p.post(
        "admin",
        "/api/titles/register",
        {
            "title_type": "CFAD",
            "reference": ctx.ref("CFAD-HO-01"),
            "surface_ha": 118500,
            "holder_org_id": ctx.org["hob"],
            "status": "provisoire",
            "province_code": "GA-2",
            "grant_ref": "Convention provisoire n° 012/MEF",
            "grant_date": _d(-900),
        },
        expect=201,
        note="titre HOB enregistré par le Ministère",
    )
    ctx.title["hob"] = hob["id"]
    conv = p.post(
        "admin",
        f"/api/titles/{hob['id']}/conventions",
        {
            "convention_type": "provisoire",
            "reference": ctx.ref("CP-012"),
            "signed_at": _d(-900),
            "start_date": _d(-900),
            "end_date": _d(195),
        },
        expect=201,
    )
    final = p.post(
        "admin",
        f"/api/titles/{hob['id']}/conventions",
        {
            "convention_type": "definitive",
            "reference": ctx.ref("CD-031"),
            "signed_at": _d(-120),
            "start_date": _d(-120),
            "end_date": _d(5355),
        },
        expect=201,
        note="convention définitive → titre actif",
    )
    p.post(
        "admin",
        f"/api/titles/{hob['id']}/conventions/{final['id']}/attestation",
        {"reference": ctx.ref("ATT-031"), "issued_at": _d(-100)},
        expect=(200, 201),
    )
    assert conv["id"] != final["id"]

    cfn = p.post(
        "cfn.dg",
        "/api/titles",
        {"title_type": "CFAD", "reference": ctx.ref("CFAD-NY-07"), "surface_ha": 64000},
        expect=201,
        note="demande de titre CFN",
    )
    ctx.title["cfn"] = cfn["id"]
    p.patch("admin", f"/api/titles/{cfn['id']}", {"decision": "exploration"}, expect=200)
    p.patch("admin", f"/api/titles/{cfn['id']}", {"decision": "provisoire"}, expect=200)
    p.post("admin", f"/api/titles/{cfn['id']}/province", {"province_code": "GA-5"}, expect=200)
    p.post(
        "admin",
        f"/api/titles/{cfn['id']}/conventions",
        {
            "convention_type": "provisoire",
            "reference": ctx.ref("CP-044"),
            "signed_at": _d(-200),
            "start_date": _d(-200),
            "end_date": _d(880),
        },
        expect=201,
    )

    mas = p.post(
        "admin",
        "/api/titles/register",
        {
            "title_type": "FC",
            "reference": ctx.ref("FC-OI-03"),
            "zone": "rural",
            "surface_ha": 4800,
            "holder_org_id": ctx.org["mas"],
            "status": "actif",
            "province_code": "GA-6",
            "grant_ref": "Arrêté d'attribution n° 004/MEF",
            "grant_date": _d(-1500),
        },
        expect=201,
    )
    ctx.title["mas"] = mas["id"]

    gte = p.post(
        "gte.dg",
        "/api/titles",
        {"title_type": "PFA", "reference": ctx.ref("PFA-ES-02"), "surface_ha": 15000},
        expect=201,
    )
    p.refused(
        "admin",
        "PATCH",
        f"/api/titles/{gte['id']}",
        {"decision": "rejete"},
        400,
        "rejet de titre sans motif",
    )
    p.patch(
        "admin",
        f"/api/titles/{gte['id']}",
        {"decision": "rejete", "motif": "Dossier incomplet : inventaire d'exploration manquant"},
        expect=200,
    )
    pending = p.post(
        "cfn.dg",
        "/api/titles",
        {"title_type": "PGG", "reference": ctx.ref("PGG-NY-01"), "surface_ha": 2000},
        expect=201,
    )
    ctx.title["cfn_pending"] = pending["id"]
    ctx.note("4 titres (CFAD actif, CFAD provisoire, FC, PFA rejeté) + 1 demande en attente")


# --- 3. Units, AAC, PAO, art. 14 ---------------------------------------------
def aacs(ctx: Ctx) -> None:
    p = ctx.p
    ufa = p.post(
        "admin",
        f"/api/titles/{ctx.title['hob']}/units",
        {
            "label": ctx.ref("UFA Okondja I"),
            "surface_ha": 61000,
            "plan_amenagement_ref": "PA n° 007/MEF/DGF",
        },
        expect=201,
    )
    ctx.ufa["hob"] = ufa["id"]
    p.put(
        "admin",
        f"/api/titles/units/{ufa['id']}/dme",
        {
            "entries": [
                {
                    "species_scientific_name": "Aucoumea klaineana",
                    "dme_cm": 75,
                    "source": "Arrêté n° 015/MEF fixant les DME de l'UFA",
                }
            ]
        },
        expect=200,
    )
    for key, label, year in (
        ("hob1", "AAC 2026-1", 2026),
        ("hob2", "AAC 2026-2", 2026),
        ("hob0", "AAC 2025-1", 2025),
    ):
        a = p.post(
            "admin",
            f"/api/titles/units/{ufa['id']}/aacs",
            {
                "label": ctx.ref(label),
                "campaign_year": year,
                "surface_ha": 2400,
                "possibility_m3": 18000,
            },
            expect=201,
        )
        ctx.aac[key] = a["id"]
    cfn_ufa = p.post(
        "admin",
        f"/api/titles/{ctx.title['cfn']}/units",
        {"label": ctx.ref("UFA Tchibanga"), "surface_ha": 30000},
        expect=201,
    )
    ctx.ufa["cfn"] = cfn_ufa["id"]
    ctx.aac["cfn1"] = p.post(
        "admin",
        f"/api/titles/units/{cfn_ufa['id']}/aacs",
        {"label": ctx.ref("AAC CPAET 2026"), "campaign_year": 2026, "origin": "cpaet_provisoire"},
        expect=201,
    )["id"]
    mas_ufa = p.post(
        "admin",
        f"/api/titles/{ctx.title['mas']}/units",
        {"label": ctx.ref("Série de production Massaha")},
        expect=201,
    )
    ctx.ufa["mas"] = mas_ufa["id"]
    ctx.aac["mas1"] = p.post(
        "admin",
        f"/api/titles/units/{mas_ufa['id']}/aacs",
        {"label": ctx.ref("AAC FC 2026"), "campaign_year": 2026},
        expect=201,
    )["id"]

    sql(
        [
            (
                "UPDATE annual_cut_blocks SET geom = ST_GeomFromText($1, 4326) WHERE id = $2",
                (_square(*AAC_SITES[k]), ctx.aac[k]),
            )
            for k in AAC_SITES
        ]
    )

    def pao(actor: str, key: str) -> None:
        p.patch(
            actor,
            f"/api/titles/aacs/{ctx.aac[key]}",
            {"action": "soumettre_pao", "pao_reference": ctx.ref(f"PAO-{key}")},
            expect=200,
        )

    pao("hob.dg", "hob1")
    p.patch(
        "admin",
        f"/api/titles/aacs/{ctx.aac['hob1']}",
        {"action": "autoriser", "reference": ctx.ref("PAO-AUT-hob1"), "valid_to": _d(365)},
        expect=200,
    )
    p.patch("admin", f"/api/titles/aacs/{ctx.aac['hob1']}", {"action": "ouvrir"}, expect=200)
    auth = p.get("hob.dg", f"/api/titles/aacs/{ctx.aac['hob1']}/authorizations")
    auth_id = next(a["id"] for a in auth if a["status"] == "delivre")
    p.post(
        "hob.dg",
        f"/api/titles/authorizations/{auth_id}/notify-startup",
        expect=200,
        note="notification de démarrage (art. 14)",
    )

    pao("hob.dg", "hob0")
    p.patch(
        "admin",
        f"/api/titles/aacs/{ctx.aac['hob0']}",
        {"action": "autoriser", "reference": ctx.ref("PAO-AUT-hob0"), "valid_to": _d(-10)},
        expect=200,
    )
    p.patch("admin", f"/api/titles/aacs/{ctx.aac['hob0']}", {"action": "ouvrir"}, expect=200)
    p.patch("admin", f"/api/titles/aacs/{ctx.aac['hob0']}", {"action": "fermer"}, expect=200)

    pao("hob.dg", "hob2")

    pao("cfn.dg", "cfn1")
    p.patch(
        "admin",
        f"/api/titles/aacs/{ctx.aac['cfn1']}",
        {"action": "autoriser", "reference": ctx.ref("PAO-AUT-cfn1"), "valid_to": _d(300)},
        expect=200,
    )
    p.patch("admin", f"/api/titles/aacs/{ctx.aac['cfn1']}", {"action": "ouvrir"}, expect=200)
    p.post(
        "cfn.dg",
        f"/api/titles/aacs/{ctx.aac['cfn1']}/authorizations",
        {"authorization_type": "certificat_vente_coupe", "reference": ctx.ref("CVC-cfn1")},
        expect=201,
        note="autorisation en attente",
    )

    pao("mas.chef", "mas1")
    p.patch(
        "admin",
        f"/api/titles/aacs/{ctx.aac['mas1']}",
        {"action": "autoriser", "reference": ctx.ref("PAO-AUT-mas1"), "valid_to": _d(365)},
        expect=200,
    )
    cae = p.post(
        "mas.chef",
        f"/api/titles/aacs/{ctx.aac['mas1']}/authorizations",
        {"authorization_type": "cae", "reference": ctx.ref("CAE-mas1"), "valid_to": _d(365)},
        expect=201,
    )
    p.refused(
        "admin",
        "PATCH",
        f"/api/titles/authorizations/{cae['id']}",
        {"decision": "rejete"},
        400,
        "rejet d'autorisation sans motif",
    )
    p.patch("admin", f"/api/titles/authorizations/{cae['id']}", {"decision": "delivre"}, expect=200)
    for a in p.get("mas.chef", f"/api/titles/aacs/{ctx.aac['mas1']}/authorizations"):
        if a["status"] == "delivre" and not a.get("startup_notified_at"):
            p.post("mas.chef", f"/api/titles/authorizations/{a['id']}/notify-startup", expect=200)
    p.patch("admin", f"/api/titles/aacs/{ctx.aac['mas1']}", {"action": "ouvrir"}, expect=200)
    sql(
        [
            (
                "UPDATE annual_cut_blocks SET opened_at = now() - interval '3 years 20 days'"
                " WHERE id = $1",
                (ctx.aac["mas1"],),
            )
        ]
    )
    ctx.note(
        "5 AAC géoréférencées : ouverte, PAO en attente, fermée, CPAET sans notification, FC (CAE)"
    )


# --- 4. Documents ------------------------------------------------------------
def documents(ctx: Ctx) -> None:
    p = ctx.p
    checklist = p.get("hob.dg", "/api/documents/checklist")
    required = [
        c.get("doc_type") or c.get("code")
        for c in (checklist.get("items") if isinstance(checklist, dict) else checklist)
    ]
    required = [c for c in required if c]
    ids = {}
    for code in required:
        doc = p.post(
            "hob.dg",
            "/api/documents/upload",
            {
                "scope_type": "company",
                "scope_id": ctx.org["hob"],
                "doc_type": code,
                "reference": ctx.ref(f"DOC-{code}")[:60],
                "issued_at": _d(-200),
                "expires_at": _d(500),
            },
            expect=(200, 201),
        )
        ids[code] = doc["id"]
    first = required[0]
    p.refused(
        "admin",
        "PATCH",
        f"/api/documents/{ids[first]}",
        {"status": "rejete"},
        400,
        "rejet de pièce sans motif",
    )
    p.patch(
        "admin",
        f"/api/documents/{ids[first]}",
        {"status": "rejete", "notes": "Copie illisible : merci de déposer l'original scanné"},
        expect=200,
    )
    p.post(
        "hob.dg",
        "/api/documents/upload",
        {
            "scope_type": "company",
            "scope_id": ctx.org["hob"],
            "doc_type": first,
            "reference": ctx.ref(f"DOC-{first}-v2")[:60],
            "issued_at": _d(-200),
            "expires_at": _d(500),
        },
        expect=(200, 201),
        note="pièce redéposée après rejet",
    )
    for doc_id in ids.values():
        p.patch("admin", f"/api/documents/{doc_id}", {"status": "valide"}, expect=200)

    cfn_list = p.get("cfn.dg", "/api/documents/checklist")
    cfn_codes = [
        c.get("doc_type") or c.get("code")
        for c in (cfn_list.get("items") if isinstance(cfn_list, dict) else cfn_list)
    ]
    cfn_codes = [c for c in cfn_codes if c]
    if cfn_codes:
        ok = p.post(
            "cfn.dg",
            "/api/documents/upload",
            {
                "scope_type": "company",
                "scope_id": ctx.org["cfn"],
                "doc_type": cfn_codes[0],
                "reference": ctx.ref("DOC-CFN-1"),
                "issued_at": _d(-400),
                "expires_at": _d(-15),
            },
            expect=(200, 201),
        )
        p.patch(
            "admin",
            f"/api/documents/{ok['id']}",
            {"status": "valide"},
            expect=200,
            note="pièce validée mais expirée → anomalie",
        )
    if len(cfn_codes) > 1:
        p.post(
            "cfn.dg",
            "/api/documents/upload",
            {
                "scope_type": "company",
                "scope_id": ctx.org["cfn"],
                "doc_type": cfn_codes[1],
                "reference": ctx.ref("DOC-CFN-2"),
                "issued_at": _d(-10),
                "expires_at": _d(355),
            },
            expect=(200, 201),
            note="pièce en attente d'instruction",
        )
    sdl_list = p.get("sdl.dg", "/api/documents/checklist")
    sdl_codes = [
        c.get("doc_type") or c.get("code")
        for c in (sdl_list.get("items") if isinstance(sdl_list, dict) else sdl_list)
    ]
    for code in [c for c in sdl_codes if c][:2]:
        d = p.post(
            "sdl.dg",
            "/api/documents/upload",
            {
                "scope_type": "company",
                "scope_id": ctx.org["sdl"],
                "doc_type": code,
                "reference": ctx.ref(f"DOC-SDL-{code}")[:60],
                "issued_at": _d(-60),
                "expires_at": _d(300),
            },
            expect=(200, 201),
        )
        p.patch("admin", f"/api/documents/{d['id']}", {"status": "valide"}, expect=200)
    ctx.note(
        f"pièces : {len(required)} HOB validées (1 rejet puis redépôt), CFN expirée + en attente"
    )


# --- 5. Declarations ---------------------------------------------------------
def _lines(ctx: Ctx, aac: str, specs: list[tuple[str, float]], start: int) -> list[dict]:
    out = []
    for i, (species, dbh) in enumerate(specs):
        lon, lat = _point(ctx, aac, start + i)
        out.append(
            {
                "tree_code": ctx.code(),
                "marking_type": "qr",
                "species_scientific_name": species,
                "measured_dbh_cm": dbh,
                "latitude": lat,
                "longitude": lon,
            }
        )
    return out


def _declare(ctx: Ctx, actor: str, aac: str, title: str, lines: list[dict], **kw):
    return ctx.p.post(
        actor,
        "/api/felling/declarations",
        {
            "permit_type": "foret_communautaire" if title == "mas" else "CFAD",
            "permit_number": ctx.ref(f"PERMIS-{title}"),
            "aac_id": ctx.aac[aac],
            "title_id": ctx.title[title],
            "campaign_year": 2026,
            "lines": lines,
        },
        **kw,
    )


def declarations(ctx: Ctx) -> None:
    p = ctx.p
    good = _lines(
        ctx,
        "hob1",
        [
            ("Aucoumea klaineana", 92),
            ("Aucoumea klaineana", 104),
            ("Lophira alata", 98),
            ("Milicia excelsa", 95),
            ("Pterocarpus soyauxii", 84),
            ("Terminalia superba", 88),
            ("Aucoumea klaineana", 110),
        ],
        0,
    )
    d1 = _declare(ctx, "hob.dg", "hob1", "hob", good, expect=200, note="déclaration conforme")
    ctx.decl["d1"] = d1["id"]
    ctx.trees["d1"] = [ln["tree_code"] for ln in good]

    below = _lines(ctx, "hob1", [("Aucoumea klaineana", 62)], 10)
    _declare(ctx, "hob.dg", "hob1", "hob", below, expect=422, note="sous le DME de l'UFA (75 cm)")
    reserved = _lines(ctx, "hob1", [("Baillonella toxisperma", 130)], 11)
    _declare(ctx, "hob.dg", "hob1", "hob", reserved, expect=422, note="essence réservée (moabi)")
    outside = [
        {
            **_lines(ctx, "hob1", [("Aucoumea klaineana", 95)], 12)[0],
            "latitude": -0.5,
            "longitude": 13.9,
        }
    ]
    _declare(ctx, "hob.dg", "hob1", "hob", outside, expect=422, note="arbre hors de l'AAC")
    _declare(
        ctx,
        "hob.dg",
        "hob0",
        "hob",
        _lines(ctx, "hob0", [("Aucoumea klaineana", 95)], 0),
        expect=422,
        note="AAC fermée",
    )
    _declare(
        ctx,
        "gte.dg",
        "hob1",
        "hob",
        _lines(ctx, "hob1", [("Aucoumea klaineana", 95)], 13),
        expect=422,
        note="AAC d'une autre organisation (art. 14)",
    )

    d3_lines = _lines(
        ctx,
        "hob1",
        [("Afzelia bipindensis", 96), ("Aucoumea klaineana", 90), ("Lophira alata", 99)],
        14,
    )
    ctx.decl["d3"] = _declare(
        ctx,
        "hob.dg",
        "hob1",
        "hob",
        d3_lines,
        expect=200,
        note="déclaration avec essence CITES (avertissement)",
    )["id"]
    d4_lines = _lines(ctx, "hob1", [("Aucoumea klaineana", 97), ("Dacryodes glaucescens", 85)], 17)
    ctx.decl["d4"] = _declare(ctx, "hob.dg", "hob1", "hob", d4_lines, expect=200)["id"]
    ctx.trees["d4"] = [ln["tree_code"] for ln in d4_lines]

    _declare(
        ctx,
        "cfn.dg",
        "cfn1",
        "cfn",
        _lines(ctx, "cfn1", [("Aucoumea klaineana", 95)], 0),
        expect=422,
        note="démarrage non notifié (art. 14)",
    )
    for a in p.get("cfn.dg", f"/api/titles/aacs/{ctx.aac['cfn1']}/authorizations"):
        if a["status"] == "delivre" and not a.get("startup_notified_at"):
            ctx.slip["cfn_auth"] = a["id"]
    cfn_lines = _lines(ctx, "cfn1", [("Aucoumea klaineana", 95), ("Lophira alata", 101)], 1)

    mas_lines = _lines(ctx, "mas1", [("Aucoumea klaineana", 88), ("Terminalia superba", 81)], 0)
    ctx.decl["mas"] = _declare(ctx, "mas.chef", "mas1", "mas", mas_lines, expect=200)["id"]
    ctx.trees["mas"] = [ln["tree_code"] for ln in mas_lines]

    p.refused(
        "admin",
        "POST",
        f"/api/admin/inbox/declarations/{ctx.decl['d3']}/decision",
        {"approve": False},
        400,
        "rejet sans motif",
    )
    detail = p.get("admin", f"/api/admin/inbox/declarations/{ctx.decl['d1']}")
    assert detail["competence_note"].startswith("Action réalisée par le Ministère"), detail
    p.post(
        "mef.dp2",
        f"/api/admin/inbox/declarations/{ctx.decl['d1']}/decision",
        {"approve": True},
        expect=200,
        note="approbation par l'inspecteur provincial",
    )
    p.post(
        "mef.dp2",
        f"/api/admin/inbox/declarations/{ctx.decl['d3']}/decision",
        {"approve": False, "motif": "Permis CITES d'exportation à joindre avant approbation"},
        expect=200,
    )
    p.post(
        "admin",
        f"/api/admin/inbox/declarations/{ctx.decl['mas']}/decision",
        {"approve": True},
        expect=200,
    )
    ctx.pending_lines = cfn_lines
    ctx.note(
        "déclarations : 2 approuvées, 1 rejetée motivée, 1 en attente ; 6 soumissions bloquées"
    )


def cfn_after_notice(ctx: Ctx) -> None:
    p = ctx.p
    p.post(
        "cfn.dg", f"/api/titles/authorizations/{ctx.slip['cfn_auth']}/notify-startup", expect=200
    )
    ctx.decl["cfn"] = _declare(
        ctx,
        "cfn.dg",
        "cfn1",
        "cfn",
        ctx.pending_lines,
        expect=200,
        note="déclaration acceptée après notification",
    )["id"]


# --- 6. Chain of custody -----------------------------------------------------
def custody(ctx: Ctx) -> None:
    p = ctx.p
    d1 = ctx.trees["d1"]
    for i, code in enumerate(d1):
        agent = "hob.agent1" if i % 2 == 0 else "hob.agent2"
        lon, lat = _point(ctx, "hob1", i)
        p.post(
            agent,
            "/api/felling/events",
            {
                "tree_code": code,
                "event": "abattu",
                "latitude": lat,
                "longitude": lon,
                "note": "Abattage contrôlé, souche marquée",
            },
            expect=200,
        )
    p.refused(
        "hob.agent1",
        "POST",
        "/api/felling/events",
        {"tree_code": d1[0], "event": "transporte"},
        409,
        "transport sans bordereau",
    )
    p.refused(
        "hob.agent1",
        "POST",
        "/api/felling/events",
        {"tree_code": ctx.trees["d4"][0], "event": "abattu"},
        409,
        "abattage d'une tige non autorisée (art. 14)",
    )
    p.refused(
        "cfn.agent1",
        "POST",
        "/api/felling/events",
        {"tree_code": d1[0], "event": "transforme"},
        403,
        "grume d'une autre organisation",
    )

    t1 = p.post(
        "hob.dg",
        "/api/transport/documents",
        {
            "doc_type": "bordereau_roulage",
            "tree_codes": d1[:3],
            "from_label": "Parc à grumes Okondja",
            "to_label": "Scierie de Lambaréné",
            "transporter": "Transports Ogooué",
            "vehicle_ref": "GA-4521-HO",
            "aac_id": ctx.aac["hob1"],
            "title_id": ctx.title["hob"],
            "destination_org_id": ctx.org["sdl"],
            "reference": ctx.ref("BDR-001"),
        },
        expect=201,
    )
    ctx.slip["t1"] = t1["id"]
    p.refused(
        "sdl.dg",
        "PATCH",
        f"/api/transport/documents/{t1['id']}",
        {"status": "emis"},
        403,
        "émission par le destinataire",
    )
    p.patch("hob.dg", f"/api/transport/documents/{t1['id']}", {"status": "emis"}, expect=200)
    p.refused(
        "hob.dg",
        "PATCH",
        f"/api/transport/documents/{t1['id']}",
        {"status": "receptionne"},
        403,
        "réception par l'émetteur",
    )
    p.patch("sdl.dg", f"/api/transport/documents/{t1['id']}", {"status": "receptionne"}, expect=200)
    p.refused(
        "hob.dg",
        "POST",
        "/api/felling/events",
        {"tree_code": d1[0], "event": "transforme"},
        403,
        "transformation par l'ancien détenteur",
    )
    for code in d1[:2]:
        p.post(
            "sdl.dg", "/api/felling/events", {"tree_code": code, "event": "transforme"}, expect=200
        )

    t2 = p.post(
        "hob.dg",
        "/api/transport/documents",
        {
            "doc_type": "bordereau_roulage",
            "tree_codes": d1[3:5],
            "destination_org_id": ctx.org["sdl"],
            "from_label": "Parc à grumes Okondja",
            "to_label": "Scierie de Lambaréné",
            "reference": ctx.ref("BDR-002"),
        },
        expect=201,
    )
    ctx.slip["t2"] = t2["id"]
    p.patch("hob.dg", f"/api/transport/documents/{t2['id']}", {"status": "emis"}, expect=200)
    p.refused(
        "hob.dg",
        "POST",
        "/api/transport/documents",
        {"doc_type": "feuille_route", "tree_codes": [d1[3]], "reference": ctx.ref("FDR-X")},
        409,
        "grume déjà en transport",
    )
    t3 = p.post(
        "hob.dg",
        "/api/transport/documents",
        {"doc_type": "feuille_route", "tree_codes": [d1[5]], "reference": ctx.ref("FDR-003")},
        expect=201,
    )
    ctx.slip["t3"] = t3["id"]

    for i, code in enumerate(ctx.trees["mas"][:1]):
        lon, lat = _point(ctx, "mas1", i)
        p.post(
            "mas.agent1",
            "/api/felling/events",
            {"tree_code": code, "event": "abattu", "latitude": lat, "longitude": lon},
            expect=200,
        )
    p.patch(
        "mas.chef",
        f"/api/traceability/df10/{ctx.trees['mas'][1]}",
        {"abandon_code": "creux", "notes": "Cœur pourri constaté à l'abattage"},
        expect=200,
    )
    ctx.note(
        "chaîne de garde : 8 abattages, 3 bordereaux (réceptionné, en route, brouillon), 2 transformations"
    )


# --- 7. Taxes, certifications, studies, EUDR, CCC ----------------------------
def finances_and_compliance(ctx: Ctx) -> None:
    p = ctx.p
    due = p.post(
        "admin",
        "/api/taxes/dues",
        {
            "title_id": ctx.title["hob"],
            "tax_type": "superficie",
            "period_year": 2026,
            "amount_fcfa": 35_550_000,
            "due_at": _d(-30),
            "notes": "118 500 ha × 300 FCFA",
        },
        expect=201,
    )
    p.post(
        "hob.dg",
        f"/api/taxes/dues/{due['id']}/settle",
        {"amount_fcfa": 35_550_000, "receipt_ref": ctx.ref("Q-SUP-2026"), "paid_at": _d(-35)},
        expect=(200, 201),
    )
    p.post(
        "admin",
        "/api/taxes/dues",
        {
            "title_id": ctx.title["hob"],
            "tax_type": "abattage",
            "period_year": 2026,
            "amount_fcfa": 4_200_000,
            "due_at": _d(45),
        },
        expect=201,
    )
    p.post(
        "admin",
        "/api/taxes/dues",
        {
            "title_id": ctx.title["cfn"],
            "tax_type": "superficie",
            "period_year": 2026,
            "amount_fcfa": 19_200_000,
            "due_at": _d(-60),
        },
        expect=201,
        note="échéance en retard (art. 283)",
    )

    fsc = p.post(
        "hob.dg",
        "/api/certifications",
        {
            "scheme": "FSC",
            "cert_type": "gestion_durable",
            "certificate_ref": ctx.ref("FSC-FM-0042"),
            "title_id": ctx.title["hob"],
            "surface_ha": 118500,
            "valid_from": _d(-300),
            "valid_to": _d(40),
        },
        expect=201,
    )
    p.patch("admin", f"/api/certifications/{fsc['id']}", {"decision": "actif"}, expect=200)
    olb = p.post(
        "gte.dg",
        "/api/certifications",
        {"scheme": "OLB", "cert_type": "legalite_plus", "certificate_ref": ctx.ref("OLB-77")},
        expect=201,
    )
    p.patch(
        "admin",
        f"/api/certifications/{olb['id']}",
        {"decision": "rejete", "decision_motif": "Certificat non vérifiable auprès de l'organisme"},
        expect=200,
    )
    p.post(
        "sdl.dg",
        "/api/certifications",
        {
            "scheme": "LS",
            "cert_type": "legalite_plus",
            "certificate_ref": ctx.ref("LS-12"),
            "valid_to": _d(700),
        },
        expect=201,
        note="certification en attente",
    )

    ppf = p.post(
        "hob.dg",
        f"/api/titles/{ctx.title['hob']}/studies",
        {
            "study_type": "ppf",
            "reference": ctx.ref("PPF-2026"),
            "authority": "DGFAP",
            "conducted_at": _d(-90),
            "valid_from": _d(-60),
            "valid_to": _d(1765),
        },
        expect=201,
    )
    p.patch(
        "admin",
        f"/api/titles/{ctx.title['hob']}/studies/{ppf['id']}",
        {"decision": "valide"},
        expect=200,
    )
    p.post(
        "admin",
        f"/api/titles/{ctx.title['hob']}/studies/{ppf['id']}/certificate",
        {"reference": ctx.ref("CERT-PPF-2026")},
        expect=(200, 201),
    )
    p.post(
        "hob.dg",
        f"/api/titles/{ctx.title['hob']}/studies",
        {
            "study_type": "eie",
            "reference": ctx.ref("EIE-2026"),
            "authority": "DGE",
            "conducted_at": _d(-20),
        },
        expect=201,
        note="EIE en attente",
    )
    eie = p.post(
        "cfn.dg",
        f"/api/titles/{ctx.title['cfn']}/studies",
        {"study_type": "eie", "reference": ctx.ref("EIE-CFN"), "authority": "DGE"},
        expect=201,
    )
    p.patch(
        "admin",
        f"/api/titles/{ctx.title['cfn']}/studies/{eie['id']}",
        {"decision": "rejete", "motif": "Consultation publique non documentée"},
        expect=200,
    )

    dil = p.post(
        "hob.dg",
        "/api/eudr/diligence",
        {
            "title_id": ctx.title["hob"],
            "parcel_label": ctx.ref("Parcelle AAC 2026-1"),
            "parcel_wkt": _square(*AAC_SITES["hob1"]),
            "declared_volume_m3": 82.5,
            "notes": "Grumes géolocalisées à la souche",
        },
        expect=201,
    )
    ctx.slip["eudr"] = dil["id"]
    stems = p.get("admin", f"/api/eudr/diligence/{dil['id']}/stems")
    p.patch("admin", f"/api/eudr/diligence/{dil['id']}", {"status": "valide"}, expect=200)
    p.post(
        "mas.chef",
        "/api/eudr/diligence",
        {
            "title_id": ctx.title["mas"],
            "parcel_label": ctx.ref("Parcelle FC 2026"),
            "parcel_wkt": _square(*AAC_SITES["mas1"]),
        },
        expect=201,
        note="diligence en attente",
    )

    ccc = p.post(
        "hob.dg",
        "/api/community/agreements",
        {
            "title_id": ctx.title["hob"],
            "community_org_id": ctx.org["mas"],
            "ccc_ref": ctx.ref("CCC-2026"),
            "ccc_signed_at": _d(-150),
            "annual_volume_m3": 42000,
        },
        expect=201,
    )
    p.patch("admin", f"/api/community/agreements/{ccc['id']}", {"status": "actif"}, expect=200)
    ctx.note(
        f"fiscalité, FSC actif, OLB rejeté, PPF validé, EIE rejetée, RDUE validée ({type(stems).__name__})"
    )


# --- 8. Ministry field controls and anomaly reviews ---------------------------
def controls(ctx: Ctx) -> None:
    p = ctx.p
    d1 = ctx.trees["d1"]
    look = p.get("mef.brigade", f"/api/controls/lookup?code={d1[3]}")
    assert look["kind"] == "tree", look
    p.post(
        "mef.brigade",
        "/api/controls",
        {
            "control_type": "route",
            "result": "conforme",
            "tree_code": d1[3],
            "transport_document_id": ctx.slip["t2"],
            "pv_reference": ctx.ref("PV-R-001"),
            "latitude": -0.71,
            "longitude": 13.1,
        },
        expect=201,
    )
    p.refused(
        "mef.brigade",
        "POST",
        "/api/controls",
        {"control_type": "marquage", "result": "non_conforme", "tree_code": ctx.trees["d4"][0]},
        400,
        "constat obligatoire",
    )
    ctx.slip["pv_marquage"] = p.post(
        "mef.dp2",
        "/api/controls",
        {
            "control_type": "marquage",
            "result": "non_conforme",
            "tree_code": ctx.trees["d4"][0],
            "notes": "Empreinte du marteau absente sur la tige",
            "pv_reference": ctx.ref("PV-M-002"),
        },
        expect=201,
        note="contrôle non conforme → anomalie grave",
    )
    ctx.slip["pv_visa"] = p.post(
        "mef.dp2",
        "/api/controls",
        {
            "control_type": "visa_df10",
            "result": "conforme",
            "aac_id": ctx.aac["hob1"],
            "notes": "Carnet visé, entrées à jour",
            "pv_reference": ctx.ref("PV-V-003"),
        },
        expect=201,
    )
    p.post(
        "mef.brigade",
        "/api/controls",
        {
            "control_type": "transformation",
            "result": "reserve",
            "org_id": ctx.org["sdl"],
            "notes": "Registre d'entrées incomplet pour mars",
            "pv_reference": ctx.ref("PV-T-004"),
        },
        expect=201,
    )
    p.refused("hob.dg", "GET", "/api/controls", None, 403, "contrôles réservés au Ministère")

    items = p.get("admin", "/api/anomalies")
    mine = [
        a
        for a in (items.get("items") if isinstance(items, dict) else items)
        if a.get("org_id") in (ctx.org["hob"], ctx.org["cfn"])
    ]
    reviewed = 0
    for a, status, motif in zip(
        mine[:2],
        ("traitee", "ecartee"),
        ("PV transmis à la Direction Provinciale", "Écart justifié : pièce en renouvellement"),
        strict=False,
    ):
        p.post(
            "admin",
            "/api/anomalies/review",
            {
                "anomaly_type": a["type"],
                "subject_key": a["subject_key"],
                "status": status,
                "decision_motif": motif,
                "org_id": a.get("org_id"),
                "title_id": a.get("title_id"),
                "aac_id": a.get("aac_id"),
            },
            expect=201,
        )
        reviewed += 1
    ctx.note(
        f"contrôles : 4 PV (conforme, non conforme, visa, réserve) ; {reviewed} anomalies revues"
    )


# --- 9. Chantier, participatory project, field scans ------------------------
def projects(ctx: Ctx) -> None:
    p = ctx.p
    ch = p.post(
        "hob.dg",
        "/api/projects",
        {
            "title": "Chantier AAC 2026-1",
            "description": f"Mesure des tiges autorisées [{ctx.ns}]",
            "kind": "chantier",
            "aac_id": ctx.aac["hob1"],
            "objective": "inventaire",
        },
        expect=(200, 201),
    )
    ctx.project["chantier"] = ch["id"]
    p.post(
        "hob.dg",
        f"/api/projects/{ch['id']}/invite",
        {"emails": [ctx.email("hob.agent1"), ctx.email("hob.agent2")]},
        expect=200,
    )
    p.post("hob.agent1", f"/api/projects/{ch['id']}/accept", expect=200)
    p.post("hob.agent2", f"/api/projects/{ch['id']}/decline", expect=200)
    op = p.post(
        "admin",
        "/api/projects",
        {
            "title": "Cartographie du Moabi",
            "description": f"Projet participatif national [{ctx.ns}]",
            "kind": "participatif",
            "participation": "open",
            "target_type": "species",
            "target_value": "Baillonella toxisperma",
            "objective": "cartographie",
        },
        expect=(200, 201),
    )
    ctx.project["moabi"] = op["id"]
    p.post("hob.agent2", f"/api/projects/{op['id']}/join", expect=200)
    p.post("mas.agent1", f"/api/projects/{op['id']}/join", expect=200)

    rows = []
    specs = [
        ("Aucoumea klaineana", 92, 31),
        ("Aucoumea klaineana", 104, 34),
        ("Lophira alata", 98, 36),
        ("Milicia excelsa", 95, 33),
        ("Pterocarpus soyauxii", 84, 29),
        ("Terminalia superba", 88, 32),
    ]
    for i, (species, dbh, height) in enumerate(specs):
        lon, lat = _point(ctx, "hob1", i)
        agb, carbon, co2e = living_carbon(dbh, species, height)
        rows.append(
            (
                "INSERT INTO tree_scans (species_scientific_name, species_confidence, geom, measured_dbh_cm,"
                " dbh_method, dbh_confidence, estimated_height_m, height_method, age_model_used,"
                " aboveground_biomass_kg, carbon_stock_kg, co2e_kg, tree_code, user_id, project_id,"
                " measurement_notes) VALUES ($1, 0.88, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4,"
                " 'tape_circumference', 0.97, $5, 'clinometer', 'pilote', $6, $7, $8, $9, $10, $11,"
                " '[\"reference_tape\"]'::jsonb)",
                (
                    species,
                    lon,
                    lat,
                    float(dbh),
                    float(height),
                    agb,
                    carbon,
                    co2e,
                    ctx.trees["d1"][i],
                    ctx.user["hob.agent1" if i % 2 == 0 else "hob.agent2"],
                    ctx.project["chantier"],
                ),
            )
        )
    lon, lat = 12.705, 0.43
    agb, carbon, co2e = living_carbon(140, "Baillonella toxisperma", 42)
    rows.append(
        (
            "INSERT INTO tree_scans (species_scientific_name, species_confidence, geom, measured_dbh_cm,"
            " dbh_method, dbh_confidence, estimated_height_m, height_method, age_model_used,"
            " aboveground_biomass_kg, carbon_stock_kg, co2e_kg, user_id, project_id, measurement_notes)"
            " VALUES ('Baillonella toxisperma', 0.81, ST_SetSRID(ST_MakePoint($1, $2), 4326), 140,"
            " 'tape_circumference', 0.95, 42, 'clinometer', 'pilote', $3, $4, $5, $6, $7,"
            " '[\"reference_tape\"]'::jsonb)",
            (lon, lat, agb, carbon, co2e, ctx.user["mas.agent1"], ctx.project["moabi"]),
        )
    )
    sql(rows)
    ctx.note("chantier (1 accepté, 1 refusé), projet Moabi (2 participants), 7 scans terrain")


def deadlines_and_reports(ctx: Ctx) -> None:
    """Annual statement (31 March, art. 244), AAC 3-year limit (art. 121), control PV."""
    p = ctx.p
    last = TODAY.year - 1
    p.refused(
        "hob.dg",
        "POST",
        "/api/traceability/statements/file",
        {"year": TODAY.year},
        400,
        "état annuel d'une année non close",
    )
    filing = p.post(
        "hob.dg",
        "/api/traceability/statements/file",
        {"year": last},
        expect=201,
        note="état annuel transmis",
    )
    ctx.slip["filing"] = filing["id"]
    p.refused(
        "hob.dg",
        "POST",
        "/api/traceability/statements/file",
        {"year": last},
        409,
        "état annuel déjà transmis",
    )
    pv = ctx.slip["pv_marquage"]["id"]
    for actor in ("admin", "hob.dg"):
        pdf = p.call(actor, "GET", f"/api/controls/{pv}/pdf", expect=200, note="PV du contrôle")
        assert bytes(pdf).startswith(b"%PDF"), "PV non PDF"
    p.refused("sdl.dg", "GET", f"/api/controls/{pv}/pdf", None, 403, "PV d'une autre organisation")
    ctx.note(
        f"échéances : état annuel {last} transmis (HOB), FC en retard ; AAC FC ouverte > 3 ans ; PV PDF"
    )


# --- 11. Team, transformation register, control follow-ups (Slice 26) -------
def team_mill_followups(ctx: Ctx) -> None:
    p = ctx.p
    agent = p.post(
        "hob.dg",
        "/api/organizations/me/agents",
        {
            "email": ctx.email("hob.agent3"),
            "password": PASSWORD,
            "first_name": "Rodrigue",
            "last_name": "Mintsa",
            "matricule": ctx.ref("AGT-3"),
        },
        expect=201,
        note="l'entreprise ouvre le compte de son agent",
    )
    ctx.user["hob.agent3"] = agent["id"]
    assert agent["role"] == "operator" and agent["organization_id"] == ctx.org["hob"]
    team = p.get("hob.dg", "/api/organizations/me/agents")
    assert any(a["id"] == agent["id"] for a in team), "agent absent de l'équipe"
    p.refused(
        "hob.agent1",
        "POST",
        "/api/organizations/me/agents",
        {"email": ctx.email("x"), "password": PASSWORD, "first_name": "X", "last_name": "Y"},
        403,
        "un agent n'ouvre pas de compte",
    )
    p.refused(
        "sdl.dg",
        "PATCH",
        f"/api/organizations/me/agents/{agent['id']}",
        {"is_active": False},
        404,
        "agent d'une autre organisation",
    )
    p.patch(
        "hob.dg",
        f"/api/organizations/me/agents/{agent['id']}",
        {"is_active": False},
        expect=200,
        note="agent parti : compte suspendu, historique conservé",
    )

    lines = _lines(ctx, "hob1", [("Aucoumea klaineana", 96), ("Aucoumea klaineana", 101)], 40)
    decl = _declare(ctx, "hob.dg", "hob1", "hob", lines, expect=200)
    p.post("admin", f"/api/admin/inbox/declarations/{decl['id']}/decision", {"approve": True})
    lot_logs = [ln["tree_code"] for ln in lines]
    for i, code in enumerate(lot_logs):
        lon, lat = _point(ctx, "hob1", 40 + i)
        p.post(
            "hob.agent1",
            "/api/felling/events",
            {"tree_code": code, "event": "abattu", "latitude": lat, "longitude": lon},
            expect=200,
        )
    t3 = p.post(
        "hob.dg",
        "/api/transport/documents",
        {
            "doc_type": "bordereau_roulage",
            "tree_codes": lot_logs,
            "destination_org_id": ctx.org["sdl"],
            "reference": ctx.ref("BDR-003"),
        },
        expect=201,
    )
    p.patch("hob.dg", f"/api/transport/documents/{t3['id']}", {"status": "emis"}, expect=200)
    p.patch("sdl.dg", f"/api/transport/documents/{t3['id']}", {"status": "receptionne"}, expect=200)

    reg = p.get("sdl.dg", "/api/mill/register", note="registre de transformation")
    assert set(lot_logs) <= {t["tree_code"] for t in reg["stock"]}, "grumes non réceptionnées"
    held = [t["tree_code"] for t in p.get("hob.dg", "/api/felling/trees?status=abattu")]
    p.refused(
        "sdl.dg",
        "POST",
        "/api/mill/outputs",
        {"product_type": "sciage", "volume_m3": 2, "tree_codes": held[:1]},
        403,
        "lot citant une grume détenue par une autre organisation",
    )
    lot = p.post(
        "sdl.dg",
        "/api/mill/outputs",
        {
            "product_type": "sciage",
            "volume_m3": 6.2,
            "tree_codes": lot_logs,
            "lot_reference": ctx.ref("LOT-1"),
            "destination": "local",
        },
        expect=201,
        note="lot produit : grumes « transformé »",
    )
    assert sorted(lot["transformed"]) == sorted(lot_logs)
    after = p.get("admin", f"/api/mill/register?org_id={ctx.org['sdl']}")
    assert after["outputs"] and not after["totals"]["alert"]
    for actor, path in (
        ("sdl.dg", "/api/mill/register/pdf"),
        ("admin", f"/api/mill/register/pdf?org_id={ctx.org['sdl']}"),
    ):
        pdf = p.call(actor, "GET", path, expect=200, note="registre en PDF")
        assert bytes(pdf).startswith(b"%PDF"), "registre non PDF"
    p.get("admin", "/api/mill/alerts")

    pv = ctx.slip["pv_marquage"]["id"]
    p.refused(
        "admin",
        "POST",
        f"/api/controls/{ctx.slip['pv_visa']['id']}/followups",
        {"action_type": "mise_en_demeure"},
        409,
        "pas de suite à un contrôle conforme",
    )
    notice = p.post(
        "mef.dp2",
        f"/api/controls/{pv}/followups",
        {"action_type": "mise_en_demeure", "due_at": _d(15), "notes": "Marquer la tige"},
        expect=201,
        note="mise en demeure notifiée",
    )
    fine = p.post(
        "mef.dp2",
        f"/api/controls/{pv}/followups",
        {"action_type": "amende", "amount_fcfa": 250000, "due_at": _d(30)},
        expect=201,
        note="amende notifiée",
    )
    mine = p.get("hob.dg", "/api/controls/followups")
    assert {notice["id"], fine["id"]} <= {f["id"] for f in mine}
    p.post(
        "hob.dg",
        f"/api/controls/followups/{fine['id']}/contest",
        {"reply": "Le marteau a été apposé, photo jointe au dossier"},
        expect=200,
        note="l'entreprise conteste l'amende",
    )
    queue = p.get("admin", "/api/admin/inbox/items?type=followups")
    assert any(i["id"] == fine["id"] for i in queue), "contestation absente de « À traiter »"
    p.get("admin", f"/api/admin/inbox/followups/{fine['id']}")
    p.post(
        "admin",
        f"/api/admin/inbox/followups/{fine['id']}/decision",
        {"approve": False, "motif": "Photo postérieure au contrôle"},
        expect=200,
        note="contestation rejetée : amende maintenue",
    )
    p.refused(
        "hob.dg",
        "POST",
        f"/api/controls/followups/{fine['id']}/contest",
        {"reply": "encore"},
        409,
        "une suite ne se conteste qu'une fois",
    )
    p.post(
        "admin",
        f"/api/controls/followups/{fine['id']}/status",
        {"status": "execute"},
        expect=200,
        note="amende réglée",
    )
    ctx.note(
        "équipe : agent ouvert puis suspendu par HOB ; usine : lot de la scierie ;"
        " suites : mise en demeure + amende contestée, maintenue, réglée"
    )


def _inventory_csv(ctx: Ctx, rows: list[tuple]) -> bytes:
    head = (
        "reference_aac;numero_arbre;essence;latitude;longitude;diametre_cm;a_abattre;observations"
    )
    lines = [head]
    for i, (species, dbh, answer, note) in enumerate(rows):
        lon, lat = _point(ctx, "hob2", 10 + i)
        values = ["AAC 2026-2", ctx.code(), species, lat, lon, dbh, answer, note]
        lines.append(";".join(str(v).replace(".", ",") for v in values))
    return ("\n".join(lines) + "\n").encode("utf-8")


def inventory_import(ctx: Ctx) -> None:
    """The inventory of the next AAC (PAO submitted) arrives as a spreadsheet."""
    p = ctx.p
    path = f"/api/inventory/aacs/{ctx.aac['hob2']}"
    model = p.get("hob.dg", "/api/inventory/model")
    assert {c["key"] for c in model["columns"] if c["required"]} >= {
        "reference_aac",
        "essence",
        "diametre_cm",
        "a_abattre",
    }
    template = p.call("hob.dg", "GET", "/api/inventory/template.xlsx", expect=200)
    assert bytes(template).startswith(b"PK")
    bad = _inventory_csv(ctx, [("Aucoumea klaineana", 45, "oui", "")])
    p.call(
        "hob.dg",
        "POST",
        f"{path}/import",
        files={"file": ("inventaire_brouillon.csv", bad, "text/csv")},
        expect=422,
        note="import refusé : tige à abattre sous le DME",
    )
    good = _inventory_csv(
        ctx,
        [
            ("Aucoumea klaineana", 96, "oui", ""),
            ("Aucoumea klaineana", 104, "oui", ""),
            ("Lophira alata", 88, "oui", ""),
            ("Aucoumea klaineana", 52, "non", "tige d'avenir"),
            ("Baillonella toxisperma", 118, "non", "essence mise en réserve"),
            ("Lophira alata", 79, "non", "semencier"),
        ],
    )
    file = {"file": ("inventaire_AAC_2026-2.csv", good, "text/csv")}
    preview = p.post(
        "hob.dg", f"{path}/preview", files=file, expect=200, note="aperçu de l'inventaire"
    )
    assert preview["can_confirm"] and preview["summary"]["kept"] == 3, preview["summary"]
    out = p.post("hob.dg", f"{path}/import", files=file, expect=201, note="inventaire importé")
    ctx.trees["inventaire"] = out["import"]["tree_codes"]
    pdf = p.call(
        "hob.dg", "GET", f"/api/inventory/imports/{out['import']['id']}/plates.pdf", expect=200
    )
    assert bytes(pdf).startswith(b"%PDF")
    sheet = p.get("admin", f"/api/organizations/{ctx.org['hob']}/sheet")
    assert any(i["id"] == out["import"]["id"] for i in sheet["inventory_imports"])
    ctx.note(
        "inventaire : AAC 2026-2 importée d'un tableur (3 à abattre, 3 à préserver), plaques imprimées"
    )


STAGES = [
    people,
    titles,
    aacs,
    documents,
    declarations,
    cfn_after_notice,
    custody,
    finances_and_compliance,
    controls,
    deadlines_and_reports,
    projects,
    team_mill_followups,
    inventory_import,
]


def build(p: Pilot, ns: str = "PILOTE") -> Ctx:
    admin_login(p)
    ctx = Ctx(ns=ns, p=p)
    for stage in STAGES:
        stage(ctx)
    return ctx


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ns", default="PILOTE")
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--only-reset", action="store_true")
    ap.add_argument("--base-url", default=None)
    ap.add_argument("--report", default=None, help="fichier JSON (+ .md) du déroulé")
    args = ap.parse_args(argv)
    ns = args.ns.upper()
    if args.reset or args.only_reset:
        reset(ns)
        print(f"Jeu « {ns} » supprimé.")
        if args.only_reset:
            return 0
    elif exists(ns):
        print(f"Jeu « {ns} » déjà présent (utiliser --reset pour le reconstruire).")
        return 0
    p = Pilot.connect(args.base_url)
    try:
        ctx = build(p, ns)
    except ScenarioError as err:
        print(f"ÉCHEC du scénario : {err}", file=sys.stderr)
        if args.report:
            p.report(args.report, f"Jeu pilote « {ns} » — ÉCHEC", [str(err)])
        return 1
    finally:
        p.close()
    if args.report:
        p.report(args.report, f"Jeu pilote « {ns} »", ctx.log)
    s = p.summary()
    print(
        f"Jeu pilote « {ns} » construit : {s['steps']} appels API, {s['refused_as_expected']} refus attendus."
    )
    for line in ctx.log:
        print(f"  · {line}")
    print(f"Connexions (mot de passe {PASSWORD}) :")
    for _, alias, role, first, last, _ in ACCOUNTS:
        print(f"  {role:<11} {first + ' ' + last:<24} {ctx.email(alias)}")
    for alias, first, last, _ in INSPECTORS:
        print(f"  {'admin':<11} {first + ' ' + last:<24} {ctx.email(alias)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
