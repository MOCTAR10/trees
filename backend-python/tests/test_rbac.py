"""Role-based access control tests (DB service mocked in-memory)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import db


def _pw(password: str) -> str:
    return security.hash_password(password)


def _token(user_row: dict) -> str:
    return security.create_access_token(
        user_row["email"],
        user_row["role"],
        user_row["id"],
        get_settings().jwt_secret,
        3600,
    )


def _install_fake_db(monkeypatch, users, coops, residues):
    state = {"next_id": max(users, default=0) + 1}

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "insert into users" in s:
            uid = state["next_id"]
            state["next_id"] += 1
            row = {
                "id": uid,
                "email": args[0],
                "display_name": args[1],
                "role": args[2],
                "is_active": True,
                "cooperative_id": args[4],
                "company_id": args[5],
            }
            users[uid] = row
            return row
        if "from users where email" in s:
            return next((u for u in users.values() if u["email"] == args[0]), None)
        if "from users where id" in s:
            user = users.get(args[0])
            return {k: v for k, v in user.items() if k != "password_hash"} if user else None
        if "from community_cooperatives where id" in s:
            return coops.get(args[0])
        if "update tree_scans_and_residues" in s:
            if "set status='allocated'" in s:
                coop_id, residue_id, company_id = args
                residue = residues.get(residue_id)
                if (
                    residue
                    and residue.get("logging_company_id") == company_id
                    and residue.get("status") == "available"
                ):
                    residue["status"] = "allocated"
                    residue["assigned_community_cooperative_id"] = coop_id
                    return dict(residue)
                return None
            if "set status='collected'" in s:
                residue_id, coop_id = args
                residue = residues.get(residue_id)
                if (
                    residue
                    and residue.get("assigned_community_cooperative_id") == coop_id
                    and residue.get("status") == "allocated"
                ):
                    residue["status"] = "collected"
                    return dict(residue)
                return None
        if "count(*) from users" in s:
            return {
                "users": len(users),
                "cooperatives": len(coops),
                "scans": 0,
                "residues": len(residues),
                "residues_available": 0,
                "residues_allocated": 0,
                "residues_collected": 0,
                "waste_kg": 0.0,
            }
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users" in s and "order by id" in s:
            return list(users.values())
        if "from community_cooperatives" in s:
            return list(coops.values())
        if "from tree_scans_and_residues" in s:
            if "logging_company_id = $1" in s:
                return [r for r in residues.values() if r.get("logging_company_id") == args[0]]
            return [
                dict(
                    r,
                    distance_km=1.0,
                    assigned_to_me=r.get("assigned_community_cooperative_id") == args[3],
                )
                for r in residues.values()
            ]
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
            "password_hash": _pw("adminpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
        },
        2: {
            "id": 2,
            "email": "co@x",
            "display_name": "Co",
            "role": "company",
            "password_hash": _pw("copw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
        },
        3: {
            "id": 3,
            "email": "op@x",
            "display_name": "Coop",
            "role": "cooperative",
            "password_hash": _pw("cooppw"),
            "is_active": True,
            "cooperative_id": 10,
            "company_id": None,
        },
        4: {
            "id": 4,
            "email": "field@x",
            "display_name": "Field",
            "role": "operator",
            "password_hash": _pw("fieldpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": 2,
        },
    }
    coops = {
        10: {
            "id": 10,
            "cooperative_name": "Coop Test",
            "profile_type": "agricultural_biochar",
            "is_certified": True,
        }
    }
    residues = {
        100: {
            "id": 100,
            "species_scientific_name": "Aucoumea klaineana",
            "status": "available",
            "logging_company_id": 2,
            "assigned_community_cooperative_id": None,
        },
        101: {
            "id": 101,
            "species_scientific_name": "Okoume",
            "status": "available",
            "logging_company_id": 999,
            "assigned_community_cooperative_id": None,
        },
    }
    return users, coops, residues


@pytest.fixture
def client():
    return TestClient(app)


def test_login_and_me(client, monkeypatch):
    users, coops, residues = _setup(monkeypatch)
    del coops, residues
    resp = client.post("/api/auth/login", json={"email": "co@x", "password": "copw"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "company"
    assert body["token_type"] == "bearer"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "co@x"
    assert "password_hash" not in me.json()
    assert users[2]["email"] == "co@x"


def test_login_wrong_password(client, monkeypatch):
    _setup(monkeypatch)
    resp = client.post("/api/auth/login", json={"email": "co@x", "password": "nope"})
    assert resp.status_code == 401


def test_requires_authentication(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/admin/stats").status_code == 401


def test_role_forbidden(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    token = _token(users[3])
    resp = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_company_lists_only_own_residues(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = client.get("/api/company/residues", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert ids == [100]


def test_company_allocate(client, monkeypatch):
    users, _, residues = _setup(monkeypatch)
    token = _token(users[2])
    resp = client.post(
        "/api/company/residues/100/allocate",
        json={"cooperative_id": 10},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "allocated"
    assert residues[100]["assigned_community_cooperative_id"] == 10
    assert "password_hash" not in resp.json().get("cooperative", {})


def test_company_cannot_allocate_foreign_residue(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = client.post(
        "/api/company/residues/101/allocate",
        json={"cooperative_id": 10},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


def test_cooperative_nearby_matching(client, monkeypatch):
    users, _, residues = _setup(monkeypatch)
    residues[100]["weight_branches_fine_kg"] = 300.0
    residues[100]["weight_bark_kg"] = 100.0
    token = _token(users[3])
    resp = client.get(
        "/api/cooperative/residues?latitude=0&longitude=0&radius_km=100",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["profile_type"] == "agricultural_biochar"
    top = body["residues"][0]
    assert top["id"] == 100
    assert top["relevant_mass_kg"] == 300.0
    assert top["match_score"] == 0.75


def test_cooperative_only_matching_filter(client, monkeypatch):
    users, _, residues = _setup(monkeypatch)
    residues[100]["weight_bark_kg"] = 12.0
    token = _token(users[3])
    resp = client.get(
        "/api/cooperative/residues?latitude=0&longitude=0&only_matching=true",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()["residues"]]
    assert 100 not in ids


def test_cooperative_collect(client, monkeypatch):
    users, _, residues = _setup(monkeypatch)
    residues[100]["status"] = "allocated"
    residues[100]["assigned_community_cooperative_id"] = 10
    token = _token(users[3])
    resp = client.post(
        "/api/cooperative/residues/100/collect",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "collected"


def test_cooperative_cannot_collect_unassigned(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    token = _token(users[3])
    resp = client.post(
        "/api/cooperative/residues/101/collect",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


def test_admin_creates_user_and_stats(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    token = _token(users[1])
    resp = client.post(
        "/api/admin/users",
        json={
            "email": "new@x",
            "display_name": "Nouveau",
            "password": "secret123",
            "role": "cooperative",
            "cooperative_id": 10,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["role"] == "cooperative"

    stats = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert stats.status_code == 200
    assert stats.json()["cooperatives"] == 1


def _setup(monkeypatch):
    users, coops, residues = _seed()
    _install_fake_db(monkeypatch, users, coops, residues)
    return users, coops, residues
