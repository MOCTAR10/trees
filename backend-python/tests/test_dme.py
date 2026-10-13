"""Per-UFA DME tests (Slice 9, Loi 016/01 art. 124; DB mocked in-memory).

The arrêté fixes a minimum exploitable diameter per species *per UFA*; this
suite covers the resolver (official value overrides the provisional default),
the Ministry-only write endpoints and the audit fields they persist.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import db


def _pw(password: str) -> str:
    return security.hash_password(password)


def _token(user: dict) -> str:
    return security.create_access_token(
        user["email"],
        user["role"],
        user["id"],
        get_settings().jwt_secret,
        3600,
    )


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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
            "organization_id": None,
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
            "organization_id": 10,
        },
        3: {
            "id": 3,
            "email": "other@x",
            "display_name": "Other",
            "role": "company",
            "password_hash": _pw("otherpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": 20,
        },
    }
    state = {
        "units": {
            60: {
                "id": 60,
                "title_id": 30,
                "label": "UFA-3",
                "surface_ha": 1000.0,
                "holder_org_id": 10,
            },
            61: {
                "id": 61,
                "title_id": 31,
                "label": "UFA-9",
                "surface_ha": 500.0,
                "holder_org_id": 20,
            },
        },
        "ufa_dme": {},
        "seq": 1,
    }
    return users, state


def _install_fake_db(monkeypatch, users, state):
    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            user = users.get(args[0])
            if user is None or not user["is_active"]:
                return None
            return {k: v for k, v in user.items() if k != "password_hash"}
        if "from management_units u" in s and "forest_titles t" in s:
            row = state["units"].get(args[0])
            return dict(row) if row else None
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from ufa_dme" in s:
            return [dict(r) for r in state["ufa_dme"].values() if r["ufa_id"] == args[0]]
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if "insert into ufa_dme" in s:
            ufa_id, species, dme_cm, source, decided_by = args[:5]
            state["ufa_dme"][(ufa_id, species)] = {
                "id": state["seq"],
                "ufa_id": ufa_id,
                "species_scientific_name": species,
                "dme_cm": dme_cm,
                "source": source,
                "decided_by": decided_by,
            }
            state["seq"] += 1
            return "INSERT 1"
        if "delete from ufa_dme" in s:
            state["ufa_dme"].pop((args[0], args[1]), None)
            return "DELETE 1"
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)


@pytest.fixture
def client():
    return TestClient(app)


def _entries(body: dict) -> dict:
    return {e["species_scientific_name"]: e for e in body["entries"]}


def test_ufa_dme_defaults_to_provisional(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = client.get("/api/titles/units/60/dme", headers=_auth(_token(users[1])))
    assert resp.status_code == 200
    body = resp.json()
    assert body["ufa_id"] == 60
    assert body["label"] == "UFA-3"
    entries = {e["species_scientific_name"]: e for e in body["entries"]}
    auc = entries["Aucoumea klaineana"]
    assert auc["dme_cm"] == 70.0
    assert auc["origin"] == "provisional"


def test_admin_sets_ufa_dme_over_default(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = client.put(
        "/api/titles/units/60/dme",
        json={
            "entries": [
                {
                    "species_scientific_name": "Aucoumea klaineana",
                    "dme_cm": 90.0,
                    "source": "Arrêté 0001/MEF — DME UFA-3",
                }
            ]
        },
        headers=_auth(_token(users[1])),
    )
    assert resp.status_code == 200
    entries = {e["species_scientific_name"]: e for e in resp.json()["entries"]}
    auc = entries["Aucoumea klaineana"]
    assert auc["dme_cm"] == 90.0
    assert auc["origin"] == "ufa"
    assert auc["source"] == "Arrêté 0001/MEF — DME UFA-3"
    # The Ministry decision is persisted with its author for audit.
    stored = state["ufa_dme"][(60, "Aucoumea klaineana")]
    assert stored["dme_cm"] == 90.0
    assert state["ufa_dme"][(60, "Aucoumea klaineana")]["decided_by"] == 1
    assert state["ufa_dme"][(60, "Aucoumea klaineana")]["source"] == "Arrêté 0001/MEF — DME UFA-3"


def test_common_name_is_canonicalised(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = client.put(
        "/api/titles/units/60/dme",
        json={"entries": [{"species_scientific_name": "Okoumé", "dme_cm": 95.0}]},
        headers=_auth(_token(users[1])),
    )
    assert resp.status_code == 200
    entries = {e["species_scientific_name"]: e for e in resp.json()["entries"]}
    assert entries["Aucoumea klaineana"]["dme_cm"] == 95.0
    assert entries["Aucoumea klaineana"]["origin"] == "ufa"
    assert ("Aucoumea klaineana") in {k[1] for k in state["ufa_dme"]}


def test_admin_clears_override_back_to_provisional(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    token = _auth(_token(users[1]))
    client.put(
        "/api/titles/units/60/dme",
        json={"entries": [{"species_scientific_name": "Aucoumea klaineana", "dme_cm": 90.0}]},
        headers=token,
    )
    cleared = client.delete("/api/titles/units/60/dme/Aucoumea%20klaineana", headers=token)
    assert cleared.status_code == 200
    entries = {e["species_scientific_name"]: e for e in cleared.json()["entries"]}
    assert entries["Aucoumea klaineana"]["dme_cm"] == 70.0
    assert entries["Aucoumea klaineana"]["origin"] == "provisional"
    assert state["ufa_dme"] == {}


def test_owner_company_can_read_other_cannot(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    ok = client.get("/api/titles/units/60/dme", headers=_auth(_token(users[2])))
    assert ok.status_code == 200
    denied = client.get("/api/titles/units/61/dme", headers=_auth(_token(users[2])))
    assert denied.status_code == 403


def test_company_cannot_write(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    token = _auth(_token(users[2]))
    put = client.put(
        "/api/titles/units/60/dme",
        json={"entries": [{"species_scientific_name": "Aucoumea klaineana", "dme_cm": 90.0}]},
        headers=token,
    )
    assert put.status_code == 403
    delete = client.delete("/api/titles/units/60/dme/Aucoumea%20klaineana", headers=token)
    assert delete.status_code == 403


def test_unknown_ufa_is_404(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _auth(_token(users[1]))
    assert client.get("/api/titles/units/999/dme", headers=admin).status_code == 404
    assert (
        client.put(
            "/api/titles/units/999/dme",
            json={"entries": [{"species_scientific_name": "Aucoumea klaineana", "dme_cm": 90.0}]},
            headers=admin,
        ).status_code
        == 404
    )
    assert (
        client.delete("/api/titles/units/999/dme/Aucoumea%20klaineana", headers=admin).status_code
        == 404
    )


def test_invalid_dme_rejected(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    token = _auth(_token(users[1]))
    zero = client.put(
        "/api/titles/units/60/dme",
        json={"entries": [{"species_scientific_name": "Aucoumea klaineana", "dme_cm": 0}]},
        headers=token,
    )
    assert zero.status_code == 422
    empty = client.put("/api/titles/units/60/dme", json={"entries": []}, headers=token)
    assert empty.status_code == 422
