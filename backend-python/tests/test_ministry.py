"""Slice 20 — Ministry cockpit, organisations, title registration (DB mocked)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import anomalies, db, ministry

ADMIN = {
    "id": 1,
    "email": "admin@x",
    "display_name": "Admin",
    "role": "admin",
    "is_active": True,
    "cooperative_id": None,
    "company_id": None,
    "organization_id": None,
    "first_name": "Awa",
    "last_name": "Ndong",
    "matricule": None,
}
COMPANY = {**ADMIN, "id": 14, "email": "co@x", "role": "company", "organization_id": 10}
USERS = {u["id"]: u for u in (ADMIN, COMPANY)}


def _auth(user: dict) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 600
    )
    return {"Authorization": f"Bearer {token}"}


ORGS = [
    {
        "id": 10,
        "org_type": "entreprise",
        "name": "Société Forestière Démo",
        "profile_code": "integre",
        "profile_label": "Exploitant intégré",
        "is_active": True,
        "tax_id": None,
        "email": None,
        "phone": None,
        "titles": 1,
        "surface_ha": 60000,
        "provinces": ["GA-6"],
        "accounts": 2,
        "documents_missing": 0,
        "documents_pending": 1,
        "taxes_overdue": 1,
    },
    {
        "id": 13,
        "org_type": "cooperative",
        "name": "Coop Demo",
        "profile_code": None,
        "profile_label": None,
        "is_active": True,
        "tax_id": None,
        "email": None,
        "phone": None,
        "titles": 0,
        "surface_ha": 0,
        "provinces": None,
        "accounts": 1,
        "documents_missing": 0,
        "documents_pending": 0,
        "taxes_overdue": 0,
    },
]


class Fake:
    def __init__(self):
        self.inserted: list[tuple[str, tuple]] = []
        self.emails = {"taken@x"}
        self.coop_by_org: dict[int, dict] = {}
        self.manager_id: int | None = 14
        self.executed: list[tuple[str, tuple]] = []

    async def fetch_one(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if s.startswith("select count(*) as n, min(q.created_at) as oldest"):
            if "from felling_declarations d" in s:
                return {"n": 1, "oldest": "2026-10-08"}
            if "from environmental_studies s" in s:
                return {"n": 1, "oldest": "2026-10-12"}
            return {"n": 0, "oldest": None}
        if "from users where id" in s:
            return USERS.get(args[0])
        if "from users where lower(email)" in s:
            return {"id": 99} if args[0].lower() in self.emails else None
        if "from organizations where id" in s:
            return (
                {"id": args[0], "org_type": "entreprise", "name": "Société Forestière Démo"}
                if args[0] in (10, 13)
                else None
            )
        if "from admin_areas where code" in s:
            return {"code": args[0]} if args[0] in {f"GA-{i}" for i in range(1, 10)} else None
        if "insert into forest_titles" in s:
            self.inserted.append(("title", args))
            return {
                "id": 5,
                "title_type": args[0],
                "reference": args[1],
                "status": args[5],
                "holder_org_id": args[2],
                "province_code": args[7],
                "created_at": "now",
            }
        if "update forest_titles set province_code" in s:
            return {"id": args[0], "province_code": args[1]} if args[0] == 5 else None
        if "select min(id) as id from users" in s:
            return {"id": self.manager_id} if self.manager_id else None
        if "from community_cooperatives where organization_id" in s:
            return self.coop_by_org.get(args[0])
        if "insert into community_cooperatives" in s:
            self.inserted.append(("coop", args))
            self.coop_by_org[args[4]] = {"id": 77}
            return {"id": 77}
        if "insert into users" in s:
            self.inserted.append(("user", args))
            return {
                "cooperative_id": args[8],
                "company_id": args[9],
                "id": 30,
                "email": args[0],
                "display_name": args[1],
                "role": args[2],
                "organization_id": args[4],
                "first_name": args[5],
                "last_name": args[6],
                "matricule": args[7],
            }
        if "insert into organizations" in s:
            self.inserted.append(("org", args))
            return {"id": 40, "org_type": args[0], "profile_code": args[8]}
        if "from org_profiles where code" in s:
            return (
                {"code": args[0], "org_type": "entreprise", "doc_required": []}
                if args[0] == "integre"
                else None
            )
        if "as expired from legal_documents" in s:
            return {"expired": 2}
        if "from tax_dues where receipt_id is null" in s:
            return {"n": 1, "amount": 3500000}
        if "from users where role in" in s:
            return {"n": 3}
        return None

    async def fetch_all(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from organizations o" in s and "v_title_province" in s:
            return [dict(o) for o in ORGS]
        if "from forest_titles t" in s and "holder_org_id = $1" in s:
            return [
                {
                    "id": 5,
                    "title_type": "CFAD",
                    "reference": "CFAD-01",
                    "status": "actif",
                    "zone": "permanent",
                    "surface_ha": 60000,
                    "province_code": "GA-6",
                    "province_source": "geometrie",
                    "province_name": "Ogooué-Ivindo",
                }
            ]
        if "from users where organization_id" in s:
            return [
                {
                    "id": 14,
                    "email": "co@x",
                    "display_name": "SFD",
                    "first_name": None,
                    "last_name": None,
                    "matricule": None,
                    "role": "company",
                    "is_active": True,
                }
            ]
        if "from certifications where org_id" in s:
            return []
        if "from admin_areas a" in s:
            return [
                {
                    "code": "GA-6",
                    "name": "Ogooué-Ivindo",
                    "organisations": 1,
                    "titles": 1,
                    "surface_ha": 60000,
                }
            ]
        return []

    async def execute(self, sql, *args):
        self.executed.append((" ".join(sql.split()).lower(), args))
        return "OK"


@pytest.fixture
def fake(monkeypatch):
    f = Fake()
    monkeypatch.setattr(db, "fetch_one", f.fetch_one)
    monkeypatch.setattr(db, "fetch_all", f.fetch_all)
    monkeypatch.setattr(db, "execute", f.execute)

    async def queue_rows(key):
        if key == "declarations":
            return [
                {
                    "id": 41,
                    "type": key,
                    "label": "Déclaration n° 41",
                    "org_name": "SFD",
                    "created_at": "2026-10-08",
                    "authority": "Direction Provinciale",
                    "province_code": "GA-6",
                    "province_name": "Ogooué-Ivindo",
                }
            ]
        if key == "studies":
            return [
                {
                    "id": 3,
                    "type": key,
                    "label": "EIE",
                    "org_name": "SFD",
                    "created_at": "2026-10-12",
                    "authority": "DGFAP / DGE",
                    "province_code": "GA-7",
                    "province_name": "Ogooué-Lolo",
                }
            ]
        return []

    async def collect(*_a, **_k):
        return [
            {
                "type": "below_dme",
                "label": "DME",
                "severity": anomalies.HARD,
                "review_status": "ouverte",
            },
            {
                "type": "taxes_impayees",
                "label": "Taxes",
                "severity": anomalies.WARNING,
                "review_status": "ouverte",
            },
        ]

    monkeypatch.setattr(ministry, "_queue_rows", queue_rows)
    monkeypatch.setattr(anomalies, "collect", collect)
    return f


@pytest.fixture
def client():
    return TestClient(app)


def test_inbox_counts_queues_anomalies_orphans_and_alerts(client, fake):
    body = client.get("/api/admin/inbox", headers=_auth(ADMIN)).json()
    counts = {q["key"]: q["count"] for q in body["queues"]}
    assert counts["declarations"] == 1 and counts["studies"] == 1
    assert counts["anomalies"] == 2 and counts["orphans"] == 3
    assert body["total"] == 7
    decl = next(q for q in body["queues"] if q["key"] == "declarations")
    assert decl["authority"] == "Direction Provinciale" and decl["oldest_at"] == "2026-10-08"
    kinds = {a["kind"]: a for a in body["alerts"]}
    assert kinds["anomalies_hard"]["count"] == 1
    assert kinds["documents_expired"]["count"] == 2
    assert kinds["taxes_overdue"]["amount_fcfa"] == 3500000


def test_inbox_items_filter_by_type_and_province(client, fake):
    all_items = client.get("/api/admin/inbox/items", headers=_auth(ADMIN)).json()
    assert [i["id"] for i in all_items] == [41, 3]
    only = client.get("/api/admin/inbox/items?type=studies", headers=_auth(ADMIN)).json()
    assert [i["type"] for i in only] == ["studies"]
    prov = client.get("/api/admin/inbox/items?province=GA-6", headers=_auth(ADMIN)).json()
    assert [i["id"] for i in prov] == [41]


def test_cockpit_is_ministry_only(client, fake):
    assert client.get("/api/admin/inbox", headers=_auth(COMPANY)).status_code == 403
    assert client.get("/api/organizations/directory", headers=_auth(COMPANY)).status_code == 403


def test_directory_filters_by_province_and_type(client, fake):
    all_orgs = client.get("/api/organizations/directory", headers=_auth(ADMIN)).json()
    assert [o["name"] for o in all_orgs] == ["Société Forestière Démo", "Coop Demo"]
    assert all_orgs[1]["provinces"] == []
    in_ivindo = client.get(
        "/api/organizations/directory?province=GA-6", headers=_auth(ADMIN)
    ).json()
    assert [o["id"] for o in in_ivindo] == [10]
    coops = client.get("/api/organizations/directory?type=cooperative", headers=_auth(ADMIN)).json()
    assert [o["id"] for o in coops] == [13]


def test_organisation_sheet(client, fake):
    sheet = client.get("/api/organizations/10/sheet", headers=_auth(ADMIN)).json()
    assert sheet["titles"][0]["province_name"] == "Ogooué-Ivindo"
    assert sheet["accounts"][0]["role"] == "company"
    assert client.get("/api/organizations/999/sheet", headers=_auth(ADMIN)).status_code == 404


def test_create_linked_agent_account(client, fake):
    resp = client.post(
        "/api/organizations/10/accounts",
        json={
            "email": "agent@x",
            "password": "Secret123",
            "role": "operator",
            "first_name": "Nzé",
            "last_name": "Obiang",
            "matricule": "AGT-1",
        },
        headers=_auth(ADMIN),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["organization_id"] == 10 and resp.json()["display_name"] == "Nzé Obiang"
    taken = client.post(
        "/api/organizations/10/accounts",
        json={"email": "taken@x", "password": "Secret123", "first_name": "A", "last_name": "B"},
        headers=_auth(ADMIN),
    )
    assert taken.status_code == 409


def test_agent_account_is_linked_to_the_company_account(client, fake):
    body = {"password": "Secret123", "role": "operator", "first_name": "Jean", "last_name": "Ndong"}
    agent = client.post(
        "/api/organizations/10/accounts", json={**body, "email": "a1@x"}, headers=_auth(ADMIN)
    )
    assert agent.status_code == 201, agent.text
    assert agent.json()["company_id"] == 14
    fake.manager_id = None
    early = client.post(
        "/api/organizations/10/accounts", json={**body, "email": "a2@x"}, headers=_auth(ADMIN)
    )
    assert early.json()["company_id"] is None
    manager = client.post(
        "/api/organizations/10/accounts",
        json={**body, "email": "dg@x", "role": "company"},
        headers=_auth(ADMIN),
    )
    assert manager.status_code == 201
    assert any("update users set company_id" in q for q, _ in fake.executed)


def test_cooperative_account_is_linked_to_its_community_cooperative(client, fake):
    def create(email):
        return client.post(
            "/api/organizations/13/accounts",
            json={
                "email": email,
                "password": "Secret123",
                "role": "cooperative",
                "first_name": "Esther",
                "last_name": "Mabika",
                "cooperative_profile": "energy_briquettes",
                "latitude": 0.39,
                "longitude": 9.76,
            },
            headers=_auth(ADMIN),
        )

    first = create("coop1@x")
    assert first.status_code == 201, first.text
    assert first.json()["cooperative_id"] == 77
    coop = next(a for kind, a in fake.inserted if kind == "coop")
    assert coop[0] == 9.76 and coop[1] == 0.39 and coop[3] == "energy_briquettes" and coop[4] == 13
    second = create("coop2@x")
    assert second.json()["cooperative_id"] == 77
    assert sum(1 for kind, _ in fake.inserted if kind == "coop") == 1


def test_cooperative_can_be_created_without_profile(client, fake):
    resp = client.post(
        "/api/organizations",
        json={"name": "Coop Ngounié", "org_type": "cooperative"},
        headers=_auth(ADMIN),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["organization"]["org_type"] == "cooperative"
    missing = client.post("/api/organizations", json={"name": "X"}, headers=_auth(ADMIN))
    assert missing.status_code == 422


def test_ministry_registers_a_title_with_province(client, fake):
    resp = client.post(
        "/api/titles/register",
        json={
            "title_type": "CFAD",
            "reference": "CFAD-99",
            "holder_org_id": 10,
            "status": "actif",
            "province_code": "GA-7",
            "surface_ha": 80000,
        },
        headers=_auth(ADMIN),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "actif" and resp.json()["province_code"] == "GA-7"
    bad = client.post(
        "/api/titles/register",
        json={"title_type": "CFAD", "holder_org_id": 10, "province_code": "GA-42"},
        headers=_auth(ADMIN),
    )
    assert bad.status_code == 404
    company = client.post(
        "/api/titles/register",
        json={"title_type": "CFAD", "holder_org_id": 10},
        headers=_auth(COMPANY),
    )
    assert company.status_code == 403


def test_set_title_province(client, fake):
    assert client.post(
        "/api/titles/5/province", json={"province_code": "GA-4"}, headers=_auth(ADMIN)
    ).json() == {
        "id": 5,
        "province_code": "GA-4",
    }
    assert (
        client.post(
            "/api/titles/5/province", json={"province_code": "GA-0"}, headers=_auth(ADMIN)
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/titles/77/province", json={"province_code": None}, headers=_auth(ADMIN)
        ).status_code
        == 404
    )


def test_provinces_summary(client, fake):
    rows = client.get("/api/admin/provinces", headers=_auth(ADMIN)).json()
    assert rows[0]["name"] == "Ogooué-Ivindo" and rows[0]["organisations"] == 1


def test_province_import_parser_cleans_names_and_skips_incomplete():
    from tools.import_provinces import provinces

    rows = provinces(
        {
            "features": [
                {
                    "properties": {"shapeName": "Ogooué-Ivindo\t", "shapeISO": "GA-6"},
                    "geometry": {"type": "Polygon"},
                },
                {"properties": {"shapeName": "Sans code"}, "geometry": {"type": "Polygon"}},
                {
                    "properties": {"shapeName": "Sans géométrie", "shapeISO": "GA-9"},
                    "geometry": None,
                },
            ]
        }
    )
    assert rows == [{"code": "GA-6", "name": "Ogooué-Ivindo", "geometry": {"type": "Polygon"}}]


def test_company_aac_options_say_whether_felling_is_allowed(client, monkeypatch):
    from app.services import compliance

    async def fetch_one(sql, *args):
        return COMPANY if "from users where id" in " ".join(sql.split()).lower() else None

    async def fetch_all(sql, *args):
        return [{"id": 29, "label": "AAC-01"}, {"id": 30, "label": "AAC-02"}]

    async def gate(aac_id, org_id):
        return None if aac_id == 29 else "no_authorization"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(compliance, "authorization_gate", gate)
    rows = client.get("/api/felling/aac-options", headers=_auth(COMPANY)).json()
    assert [(r["label"], r["blocker"]) for r in rows] == [
        ("AAC-01", None),
        ("AAC-02", "no_authorization"),
    ]


def test_bundled_provinces_file_has_the_nine_provinces():
    import json

    from tools.import_provinces import BUNDLED, provinces

    rows = provinces(json.loads(BUNDLED.read_text(encoding="utf-8")))
    assert sorted(r["code"] for r in rows) == [f"GA-{i}" for i in range(1, 10)]
    assert {"Haut-Ogooué", "Nyanga", "Ogooué-Ivindo"} <= {r["name"] for r in rows}
