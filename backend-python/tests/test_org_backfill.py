"""Slice 13 — rattachement des comptes legacy aux organizations.

Les comptes ``company`` / ``cooperative`` antérieurs au registre ``organizations``
n'ont pas d'entité légale (``organization_id`` NULL). On liste puis on rattache
ces comptes de façon idempotente, en traçant le compte d'origine.
"""

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


def _account(uid, email, role, org=None):
    return {
        "id": uid,
        "email": email,
        "display_name": email,
        "role": role,
        "password_hash": _pw("pw"),
        "is_active": True,
        "cooperative_id": None,
        "company_id": None,
        "organization_id": org,
        "created_at": "now",
    }


def _setup(monkeypatch):
    users = {
        1: _account(1, "admin@x", "admin"),
        2: _account(2, "co@x", "company"),
        3: _account(3, "coop@x", "cooperative"),
        5: _account(5, "linked@x", "company", org=10),
    }
    state = {"organizations": {10: {"id": 10, "name": "Bois SA"}}, "org_seq": 20}

    def _orphans():
        return [
            {k: u[k] for k in ("id", "email", "display_name", "role", "created_at")}
            for u in users.values()
            if u["role"] in ("company", "cooperative")
            and u["organization_id"] is None
            and u["is_active"]
        ]

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            user = users.get(args[0])
            return {k: v for k, v in user.items() if k != "password_hash"} if user else None
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where role = any" in s:
            return _orphans()
        if "insert into organizations" in s:
            created = []
            for u in _orphans():
                oid = state["org_seq"]
                state["org_seq"] += 1
                org = {
                    "id": oid,
                    "org_type": "cooperative" if u["role"] == "cooperative" else "entreprise",
                    "name": u["display_name"],
                    "legacy_user_id": u["id"],
                }
                state["organizations"][oid] = org
                created.append(dict(org))
            return created
        if "update users u set organization_id" in s:
            linked = []
            for org in state["organizations"].values():
                legacy = org.get("legacy_user_id")
                if legacy and users.get(legacy) and users[legacy]["organization_id"] is None:
                    users[legacy]["organization_id"] = org["id"]
                    linked.append(
                        {
                            "id": legacy,
                            "email": users[legacy]["email"],
                            "organization_id": org["id"],
                        }
                    )
            return linked
        return []

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    return users, state


@pytest.fixture
def client():
    return TestClient(app)


def _auth(user_row):
    return {"Authorization": f"Bearer {_token(user_row)}"}


def test_admin_lists_legacy_accounts_without_organization(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = client.get("/api/organizations/orphans", headers=_auth(users[1]))
    assert resp.status_code == 200
    body = resp.json()
    assert {u["id"] for u in body} == {2, 3}
    # An already-linked account is not reported.
    assert all(u["id"] != 5 for u in body)


def test_company_cannot_list_orphan_accounts(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = client.get("/api/organizations/orphans", headers=_auth(users[2]))
    assert resp.status_code == 403


def test_backfill_creates_and_links_one_organization_per_account(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = client.post("/api/organizations/backfill", headers=_auth(users[1]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["created_count"] == 2
    assert body["linked_count"] == 2
    assert users[2]["organization_id"] is not None
    assert users[3]["organization_id"] is not None
    # Each organization keeps the legacy account it came from.
    assert {o["legacy_user_id"] for o in body["created"]} == {2, 3}
    # Nothing left to migrate.
    remaining = client.get("/api/organizations/orphans", headers=_auth(users[1]))
    assert remaining.json() == []


def test_backfill_is_idempotent(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    client.post("/api/organizations/backfill", headers=_auth(users[1]))
    body = client.post("/api/organizations/backfill", headers=_auth(users[1])).json()
    assert body["created_count"] == 0
    assert body["linked_count"] == 0


def test_backfill_requires_admin(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = client.post("/api/organizations/backfill", headers=_auth(users[2]))
    assert resp.status_code == 403
