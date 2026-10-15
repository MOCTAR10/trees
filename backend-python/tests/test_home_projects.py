"""Slice 19 — Accueil summary, names, chantiers / participative projects (DB mocked)."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import db
from app.services import projects as project_rules

OPERATOR = {
    "id": 4,
    "email": "field@x",
    "display_name": "Operateur Terrain",
    "role": "operator",
    "is_active": True,
    "cooperative_id": None,
    "company_id": 2,
    "organization_id": None,
    "first_name": "Nzé",
    "last_name": "Obiang",
    "matricule": "AGT-0004",
}
COMPANY = {
    **OPERATOR,
    "id": 2,
    "email": "company@x",
    "display_name": "Scierie Demo",
    "role": "company",
    "company_id": None,
    "organization_id": 12,
    "first_name": None,
    "last_name": None,
    "matricule": None,
}
ADMIN = {**COMPANY, "id": 1, "email": "admin@x", "role": "admin", "organization_id": None}
USERS = {u["id"]: u for u in (OPERATOR, COMPANY, ADMIN)}


def _auth(user: dict) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 3600
    )
    return {"Authorization": f"Bearer {token}"}


class FakeDb:
    def __init__(self):
        self.projects = {
            1: {
                "id": 1,
                "title": "Cartographier le Moabi",
                "status": "open",
                "participation": "open",
                "created_by": 1,
                "latitude": 0.4,
                "longitude": 9.4,
                "radius_km": 5.0,
                "aac_id": None,
            },
            2: {
                "id": 2,
                "title": "Chantier AAC 2026-01",
                "status": "open",
                "participation": "invitation",
                "created_by": 2,
                "latitude": None,
                "longitude": None,
                "radius_km": None,
                "aac_id": 25,
            },
        }
        self.participants: dict[tuple[int, int], str] = {}
        self.executed: list[tuple[str, tuple]] = []
        self.aac_inside = True

    async def fetch_one(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "where id=$1 and is_active" in s:
            return {"id": args[0]} if args[0] in USERS else None
        if "cooperative_name as name" in s or "as name from users u" in s:
            return {"name": "Scierie Demo"}
        if "from users where id" in s:
            return USERS.get(args[0])
        if "from users where lower(email)" in s:
            found = [u for u in USERS.values() if u["email"] == args[0].lower()]
            return {"id": found[0]["id"]} if found else None
        if "update users set first_name" in s:
            return {
                "id": args[0],
                "first_name": args[1],
                "last_name": args[2],
                "matricule": "AGT-0004",
                "display_name": args[3],
            }
        if "from project_participants where project_id" in s:
            status = self.participants.get((args[0], args[1]))
            return {"status": status} if status else None
        if "from annual_cut_blocks b join management_units" in s:
            return (
                {"id": 25, "label": "DEMO-AAC-2026-01", "holder_org_id": 12}
                if args[0] == 25
                else None
            )
        if "st_covers" in s:
            return {"has_geom": True, "inside": self.aac_inside}
        if "from projects where id" in s:
            p = self.projects.get(args[0])
            return dict(p) if p else None
        if "insert into projects" in s:
            return {
                "id": 3,
                "title": args[0],
                "kind": args[9],
                "participation": args[10],
                "aac_id": args[11],
                "status": "open",
            }
        if "count(*) as n from projects" in s:
            return {"n": 3}
        if "as today_count" in s:
            return {
                "today_count": 3,
                "today_species": 2,
                "today_co2e_kg": 4000.0,
                "today_for_projects": 1,
                "week_count": 7,
                "week_species": 4,
                "week_co2e_kg": 9000.0,
                "week_for_projects": 2,
                "month_count": 10,
                "month_species": 5,
                "month_co2e_kg": 15000.0,
                "month_for_projects": 3,
                "all_count": 12,
                "all_species": 5,
                "all_co2e_kg": 18450.5,
                "all_for_projects": 4,
                "last_at": None,
            }
        if "as members" in s:
            return {
                "members": 6,
                "trees_by_period": '{"trees_today": 2, "trees_week": 9, "trees_month": 20, "trees_all": 40}',
            }
        return None

    async def fetch_all(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from project_participants pp join projects p" in s:
            return [
                {
                    "id": 2,
                    "title": "Chantier AAC 2026-01",
                    "kind": "chantier",
                    "my_status": "invited",
                    "registry_trees": 9,
                    "registry_scanned": 0,
                },
                {
                    "id": 1,
                    "title": "Cartographier le Moabi",
                    "kind": "participatif",
                    "my_status": "active",
                    "my_scans": 4,
                },
            ]
        if "from projects p where p.status = 'open' and p.participation = 'open'" in s:
            return [{"id": 5, "title": "Inventaire Okoumé", "kind": "participatif"}]
        if "from projects p" in s:
            return [{"id": 1, "my_status": "active"}]
        return []

    async def execute(self, sql, *args):
        s = " ".join(sql.split()).lower()
        self.executed.append((s, args))
        if "insert into project_participants" in s and "values ($1, $2, 'active'" in s:
            self.participants[(args[0], args[1])] = "active"
        elif "insert into project_participants" in s:
            if self.participants.get((args[0], args[1])) != "active":
                self.participants[(args[0], args[1])] = "invited"
        elif "set status='active'" in s:
            self.participants[(args[0], args[1])] = "active"
        elif "set status='declined'" in s:
            self.participants[(args[0], args[1])] = "declined"
        return "OK"


@pytest.fixture
def fake(monkeypatch):
    f = FakeDb()
    monkeypatch.setattr(db, "fetch_one", f.fetch_one)
    monkeypatch.setattr(db, "fetch_all", f.fetch_all)
    monkeypatch.setattr(db, "execute", f.execute)
    return f


@pytest.fixture
def client():
    return TestClient(app)


def test_summary_greets_by_first_name_and_aggregates(client, fake):
    body = client.get("/api/home/summary", headers=_auth(OPERATOR)).json()
    assert body["person"]["first_name"] == "Nzé"
    assert body["person"]["full_name"] == "Nzé Obiang"
    assert body["person"]["matricule"] == "AGT-0004"
    scans = body["scans"]
    assert (scans["total"], scans["today"], scans["week"], scans["species"]) == (12, 3, 7, 5)
    assert scans["co2e_kg"] == 18450.5 and scans["for_projects"] == 4
    assert scans["periods"]["month"] == {
        "count": 10,
        "species": 5,
        "co2e_kg": 15000.0,
        "for_projects": 3,
    }
    assert scans["periods"]["today"]["co2e_kg"] == 4000.0
    assert body["group"] == {
        "type": "company",
        "name": "Scierie Demo",
        "members": 6,
        "trees": 40,
        "trees_week": 9,
        "trees_by_period": {"today": 2, "week": 9, "month": 20, "all": 40},
    }
    assert [p["id"] for p in body["projects"]["invitations"]] == [2]
    assert [p["id"] for p in body["projects"]["joined"]] == [1]
    assert [p["id"] for p in body["projects"]["available"]] == [5]
    assert body["projects"]["available_count"] == 3


def test_summary_requires_auth(client):
    assert client.get("/api/home/summary").status_code == 401


def test_operator_sets_own_names_and_display_name_follows(client, fake):
    resp = client.patch(
        "/api/home/me", json={"first_name": " Nzé ", "last_name": "Obiang"}, headers=_auth(OPERATOR)
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Nzé Obiang"


def test_company_names_keep_the_organisation_display_name(client, fake):
    resp = client.patch(
        "/api/home/me", json={"first_name": "Ada", "last_name": "Mba"}, headers=_auth(COMPANY)
    )
    assert resp.json()["display_name"] == "Scierie Demo"


def test_chantier_requires_an_aac_held_by_the_company(client, fake):
    no_aac = client.post(
        "/api/projects", json={"title": "Chantier", "kind": "chantier"}, headers=_auth(COMPANY)
    )
    assert no_aac.status_code == 422
    other = {**COMPANY, "organization_id": 99}
    USERS[other["id"]] = other
    try:
        refused = client.post(
            "/api/projects",
            json={"title": "Chantier", "kind": "chantier", "aac_id": 25},
            headers=_auth(other),
        )
        assert refused.status_code == 403
    finally:
        USERS[COMPANY["id"]] = COMPANY
    ok = client.post(
        "/api/projects",
        json={"title": "Chantier", "kind": "chantier", "aac_id": 25},
        headers=_auth(COMPANY),
    )
    assert ok.status_code == 200
    assert ok.json()["participation"] == "invitation"
    assert ok.json()["aac_id"] == 25


def test_participative_project_is_open_by_default(client, fake):
    resp = client.post("/api/projects", json={"title": "Moabi"}, headers=_auth(ADMIN))
    assert resp.json()["participation"] == "open"
    assert resp.json()["aac_id"] is None


def test_operator_cannot_create_a_project(client, fake):
    resp = client.post("/api/projects", json={"title": "X"}, headers=_auth(OPERATOR))
    assert resp.status_code == 403


def test_operator_joins_an_open_project_in_one_tap(client, fake):
    resp = client.post("/api/projects/1/join", headers=_auth(OPERATOR))
    assert resp.status_code == 200
    assert fake.participants[(1, 4)] == "active"


def test_invitation_project_needs_an_invitation(client, fake):
    assert client.post("/api/projects/2/join", headers=_auth(OPERATOR)).status_code == 403
    assert client.post("/api/projects/2/accept", headers=_auth(OPERATOR)).status_code == 404


def test_creator_invites_then_operator_accepts_or_declines(client, fake):
    refused = client.post(
        "/api/projects/2/invite", json={"emails": ["field@x"]}, headers=_auth(OPERATOR)
    )
    assert refused.status_code == 403
    resp = client.post(
        "/api/projects/2/invite", json={"emails": ["field@x"]}, headers=_auth(COMPANY)
    )
    assert resp.json()["invited"] == [4]
    assert fake.participants[(2, 4)] == "invited"
    assert (
        client.post("/api/projects/2/decline", headers=_auth(OPERATOR)).json()["status"]
        == "declined"
    )
    assert (
        client.post("/api/projects/2/accept", headers=_auth(OPERATOR)).json()["status"] == "active"
    )


def test_unknown_invitee_is_reported(client, fake):
    resp = client.post(
        "/api/projects/2/invite", json={"emails": ["nobody@x"]}, headers=_auth(COMPANY)
    )
    assert resp.status_code == 404


def test_scan_for_project_rules(fake):
    run = asyncio.run
    assert run(project_rules.resolve_scan_project(None, OPERATOR, 0.4, 9.4)) == (None, None, None)
    assert run(project_rules.resolve_scan_project(1, None, 0.4, 9.4))[2] == "project_login_required"
    assert run(project_rules.resolve_scan_project(1, OPERATOR, 0.4, 9.4))[2] == "project_not_member"
    fake.participants[(1, 4)] = "active"
    assert run(project_rules.resolve_scan_project(1, OPERATOR, 0.4, 9.4)) == (
        1,
        "Cartographier le Moabi",
        None,
    )
    assert (
        run(project_rules.resolve_scan_project(1, OPERATOR, 1.4, 9.4))[2] == "project_out_of_zone"
    )
    fake.participants[(2, 4)] = "active"
    assert run(project_rules.resolve_scan_project(2, OPERATOR, 5.0, 5.0))[0] == 2
    fake.aac_inside = False
    assert (
        run(project_rules.resolve_scan_project(2, OPERATOR, 5.0, 5.0))[2] == "project_out_of_zone"
    )
    fake.projects[1]["status"] = "closed"
    assert run(project_rules.resolve_scan_project(1, OPERATOR, 0.4, 9.4))[2] == "project_closed"
    assert run(project_rules.resolve_scan_project(9, OPERATOR, 0.4, 9.4))[2] == "project_unknown"


def test_admin_creates_a_named_operator(client, monkeypatch):
    captured = {}

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return ADMIN
        if "from users where email" in s:
            return None
        if "insert into users" in s:
            captured["args"] = args
            return {"id": 9, "display_name": args[1], "first_name": args[7], "matricule": args[9]}
        return None

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    resp = client.post(
        "/api/admin/users",
        json={
            "email": "agent@x",
            "password": "Secret123",
            "role": "operator",
            "first_name": "Nzé",
            "last_name": "Obiang",
            "matricule": "AGT-0009",
        },
        headers=_auth(ADMIN),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["display_name"] == "Nzé Obiang"
    assert resp.json()["matricule"] == "AGT-0009"


def test_aac_options_are_scoped_to_the_company(client, fake, monkeypatch):
    seen = {}

    async def fetch_all(sql, *args):
        if "from annual_cut_blocks b" in " ".join(sql.split()).lower():
            seen["args"] = args
            return [{"id": 25, "label": "DEMO-AAC-2026-01"}]
        return []

    monkeypatch.setattr(db, "fetch_all", fetch_all)
    assert client.get("/api/projects/aac-options", headers=_auth(OPERATOR)).json() == []
    resp = client.get("/api/projects/aac-options", headers=_auth(COMPANY))
    assert resp.json()[0]["id"] == 25
    assert seen["args"] == ("company", 12)


def _chantier_db(monkeypatch, participant_status_value):
    async def fetch_one(sql, *args):
        q = " ".join(sql.split()).lower()
        if "from users where id" in q:
            return USERS.get(args[0])
        if "from projects p left join users" in q:
            return {
                "id": 2,
                "title": "Chantier AAC 2026-01",
                "description": "",
                "status": "open",
                "kind": "chantier",
                "participation": "invitation",
                "aac_id": 25,
                "created_by": 2,
                "created_at": "2026-10-01T00:00:00Z",
                "created_by_name": "Scierie Demo",
            }
        if "from project_participants where project_id" in q:
            return {"status": participant_status_value} if participant_status_value else None
        if "st_asgeojson" in q:
            return {
                "id": 25,
                "label": "DEMO-AAC-2026-01",
                "status": "ouvert",
                "campaign_year": 2026,
                "surface_ha": 1200.0,
                "ufa_label": "UFA Démo 1",
                "title_reference": "DEMO-CFAD-01",
                "geometry": '{"type": "Polygon", "coordinates": [[[11.4, -0.3], [11.6, -0.3], [11.6, -0.1], [11.4, -0.3]]]}',
            }
        return None

    async def fetch_all(sql, *args):
        q = " ".join(sql.split()).lower()
        if "from tree_registry r" in q:
            return [
                {
                    "id": 1,
                    "tree_code": "GA-1",
                    "measured": True,
                    "measured_by_me": True,
                    "latitude": -0.2,
                    "longitude": 11.5,
                },
                {
                    "id": 2,
                    "tree_code": "GA-2",
                    "measured": False,
                    "measured_by_me": False,
                    "latitude": -0.21,
                    "longitude": 11.51,
                },
                {
                    "id": 3,
                    "tree_code": "GA-3",
                    "measured": False,
                    "measured_by_me": False,
                    "latitude": None,
                    "longitude": None,
                },
            ]
        if "from project_participants pp join users" in q:
            return [
                {
                    "user_id": 4,
                    "status": "active",
                    "display_name": "Nzé Obiang",
                    "first_name": "Nzé",
                    "last_name": "Obiang",
                    "scans": 1,
                }
            ]
        if "from tree_scans ts where ts.project_id" in q:
            return [
                {
                    "id": 9,
                    "tree_code": "GA-1",
                    "species_scientific_name": None,
                    "measured_dbh_cm": 61.0,
                    "created_at": "2026-10-13",
                }
            ]
        return []

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)


def test_chantier_view_for_a_participant(client, monkeypatch):
    _chantier_db(monkeypatch, "active")
    body = client.get("/api/projects/2/chantier", headers=_auth(OPERATOR)).json()
    assert body["aac"]["label"] == "DEMO-AAC-2026-01"
    assert body["aac"]["geometry"]["type"] == "Polygon"
    assert body["progress"] == {"measured": 1, "total": 3}
    assert [m["first_name"] for m in body["team"]] == ["Nzé"]
    assert "email" not in body["team"][0]
    assert body["my_scans"][0]["tree_code"] == "GA-1"
    assert body["my_status"] == "active"


def test_chantier_view_is_hidden_from_outsiders(client, monkeypatch):
    _chantier_db(monkeypatch, None)
    assert client.get("/api/projects/2/chantier", headers=_auth(OPERATOR)).status_code == 404
    assert client.get("/api/projects/2/chantier", headers=_auth(COMPANY)).status_code == 200
