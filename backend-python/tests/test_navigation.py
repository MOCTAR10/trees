"""Navigation/menu endpoints: species, my-trees, group, diagnostics (DB mocked)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import db


def _token(user_row: dict) -> str:
    return security.create_access_token(
        user_row["email"],
        user_row["role"],
        user_row["id"],
        get_settings().jwt_secret,
        3600,
    )


def _install(monkeypatch, users, coops, scans):
    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from community_cooperatives where id" in s:
            return coops.get(args[0])
        if "from users where id" in s:
            user = users.get(args[0])
            return {k: v for k, v in user.items() if k != "password_hash"} if user else None
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where cooperative_id" in s:
            return [u for u in users.values() if u.get("cooperative_id") == args[0]]
        if "from users where company_id" in s:
            return [u for u in users.values() if u.get("company_id") == args[0]]
        if "from tree_scans" in s:
            if "u.cooperative_id = $1 or u.company_id = $2" in s:
                coop_id, company_id = args[0], args[1]
                out = []
                for x in scans:
                    owner = users.get(x["user_id"])
                    if owner is None:
                        continue
                    if (coop_id is not None and owner.get("cooperative_id") == coop_id) or (
                        company_id is not None and owner.get("company_id") == company_id
                    ):
                        out.append(
                            {**x, "owner_name": owner["display_name"], "owner_id": owner["id"]}
                        )
                return out
            if "where ($1::int is null or user_id = $1)" in s:
                scope = args[0]
                return [x for x in scans if scope is None or x["user_id"] == scope]
            if "where user_id = $1" in s:
                return [x for x in scans if x["user_id"] == args[0]]
        return []

    async def execute(sql, *args):
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)


def _seed():
    users = {
        1: {
            "id": 1,
            "email": "admin@x",
            "display_name": "Admin",
            "role": "admin",
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
        },
        2: {
            "id": 2,
            "email": "company@x",
            "display_name": "Bois & Cie",
            "role": "company",
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
        },
        4: {
            "id": 4,
            "email": "field@x",
            "display_name": "Field",
            "role": "operator",
            "is_active": True,
            "cooperative_id": None,
            "company_id": 2,
        },
        5: {
            "id": 5,
            "email": "op2@x",
            "display_name": "Field Two",
            "role": "operator",
            "is_active": True,
            "cooperative_id": None,
            "company_id": 2,
        },
        6: {
            "id": 6,
            "email": "coop@x",
            "display_name": "Coop User",
            "role": "cooperative",
            "is_active": True,
            "cooperative_id": 10,
            "company_id": None,
        },
    }
    coops = {
        10: {
            "id": 10,
            "cooperative_name": "Coop Nkoltang",
            "profile_type": "agricultural_biochar",
            "capacity_kg_per_day": 250.0,
            "is_certified": True,
            "latitude": 0.4,
            "longitude": 9.45,
        }
    }
    scans = [
        {
            "id": 100,
            "user_id": 4,
            "species_scientific_name": "Aucoumea klaineana",
            "species_confidence": 0.9,
            "measured_dbh_cm": 55.0,
            "health_status": "saine_apparence",
            "created_at": "2026-01-01T00:00:00Z",
        },
        {
            "id": 101,
            "user_id": 4,
            "species_scientific_name": None,
            "species_confidence": 0.2,
            "measured_dbh_cm": None,
            "health_status": "anomalie_sombre_possible",
            "created_at": "2026-01-02T00:00:00Z",
        },
        {
            "id": 102,
            "user_id": 2,
            "species_scientific_name": "Milicia excelsa",
            "species_confidence": 0.8,
            "measured_dbh_cm": 40.0,
            "health_status": "saine_apparence",
            "created_at": "2026-01-03T00:00:00Z",
        },
    ]
    return users, coops, scans


@pytest.fixture
def client():
    return TestClient(app)


def _setup(monkeypatch):
    users, coops, scans = _seed()
    _install(monkeypatch, users, coops, scans)
    return users, coops, scans


def _auth(user_row: dict) -> dict:
    return {"Authorization": f"Bearer {_token(user_row)}"}


def test_species_endpoints_require_auth(client):
    assert client.get("/api/species").status_code == 401
    assert client.get("/api/species/Aucoumea klaineana").status_code == 401


def test_species_list_and_detail(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/species", headers=_auth(users[1]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
    okoume = next(s for s in body["species"] if s["scientific_name"] == "Aucoumea klaineana")
    assert okoume["common_name_fr"] == "Okoumé"

    detail = client.get("/api/species/Aucoumea klaineana", headers=_auth(users[1]))
    assert detail.status_code == 200
    assert detail.json()["wood_density_g_cm3"] == 0.44


def test_species_detail_unknown_404(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/species/Nonexistentus arbor", headers=_auth(users[1]))
    assert resp.status_code == 404


def test_my_trees_scopes_to_caller(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/my-trees", headers=_auth(users[4]))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert ids == [101, 100] or ids == [100, 101]
    assert 102 not in ids


def test_group_company_for_operator(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/group", headers=_auth(users[4]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "company"
    assert body["id"] == 2
    assert body["name"] == "Bois & Cie"
    assert {m["id"] for m in body["members"]} == {4, 5}


def test_group_cooperative_for_coop_user(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/group", headers=_auth(users[6]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "cooperative"
    assert body["name"] == "Coop Nkoltang"
    assert body["detail"]["is_certified"] is True


def test_group_none_for_admin(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/group", headers=_auth(users[1]))
    assert resp.status_code == 200
    assert resp.json()["type"] is None


def test_group_trees_for_operator_company(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/group/trees", headers=_auth(users[4]))
    assert resp.status_code == 200
    body = resp.json()
    assert {s["id"] for s in body} == {100, 101}
    assert all(s["owner_name"] == "Field" for s in body)


def test_group_trees_empty_for_coop_and_admin(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    for uid in (6, 1):
        resp = client.get("/api/group/trees", headers=_auth(users[uid]))
        assert resp.status_code == 200
        assert resp.json() == []


def test_diagnostics_admin_sees_all(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/diagnostics", headers=_auth(users[1]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope"] == "all"
    assert body["total"] == 3
    assert body["anomalies"] == 1
    flagged_ids = {r["id"] for r in body["flagged"]}
    assert 101 in flagged_ids


def test_diagnostics_operator_scopes_to_own(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    resp = client.get("/api/diagnostics", headers=_auth(users[4]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["scope"] == "own"
    assert body["total"] == 2
    assert body["by_health"].get("saine_apparence") == 1
