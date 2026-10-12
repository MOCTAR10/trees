"""Social slice: community agreements (CCC / FDL, art. 251) + CGSP proof."""

import re

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


def _user(uid, email, role, org=None):
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
    }


def _setup(monkeypatch):
    users = {
        1: _user(1, "admin@x", "admin"),
        2: _user(2, "co@x", "company", org=10),
        5: _user(5, "noorg@x", "company"),
        6: _user(6, "other@x", "company", org=20),
    }
    state = {
        "seq": 1,
        "agreements": {},
        "titles": {30: {"holder_org_id": 10, "reference": "T-1"}},
        "orgs": {10: "entreprise", 20: "entreprise", 40: "communaute"},
    }

    def _enrich(a):
        if a is None:
            return None
        return {**a, "title_ref": "T-1", "community_name": "Village Mbe"}

    def _apply(rows, s, args):
        for col, idx in re.findall(r"t\.(\w+) = \$(\d+)", s):
            value = args[int(idx) - 1]
            rows = [r for r in rows if r.get(col) == value]
        return rows

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            user = users.get(args[0])
            return {k: v for k, v in user.items() if k != "password_hash"} if user else None
        if "select holder_org_id from forest_titles" in s:
            t = state["titles"].get(args[0])
            return {"holder_org_id": t["holder_org_id"]} if t else None
        if "select org_type from organizations where id" in s:
            org_type = state["orgs"].get(args[0])
            return {"org_type": org_type} if org_type else None
        if "insert into community_agreements" in s:
            aid = state["seq"]
            state["seq"] += 1
            agreement = {
                "id": aid,
                "title_id": args[0],
                "community_org_id": args[1],
                "ccc_ref": args[2],
                "ccc_signed_at": args[3],
                "fdl_rate_fcfa_m3": args[4],
                "annual_volume_m3": args[5],
                "contribution_fcfa": args[6],
                "cgsp_minutes_document_id": None,
                "status": "actif",
                "created_at": "2026-05-10T10:00:00",
                "holder_org_id": 10,
            }
            state["agreements"][aid] = agreement
            return {k: v for k, v in agreement.items() if k != "holder_org_id"}
        if "update community_agreements set" in s:
            aid = args[-1]
            a = state["agreements"].get(aid)
            if a is None:
                return None
            for m in re.findall(r"(\w+) = \$(\d+)", s):
                col = m[0]
                if col in ("status", "ccc_ref", "cgsp_minutes_document_id"):
                    a[col] = args[int(m[1]) - 1]
            return {k: v for k, v in a.items() if k != "holder_org_id"}
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from organizations where org_type = 'communaute'" in s:
            return [{"id": 40, "name": "Village Mbe", "address": None}]
        if "group by status" in s and "from community_agreements" in s:
            return []
        if "from community_agreements a" in s:
            rows = [_enrich(a) for a in state["agreements"].values()]
            return _apply(rows, s, args)
        return []

    async def execute(sql, *args):
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)
    return users, state


@pytest.fixture
def client():
    return TestClient(app)


def _create(client, token, **overrides):
    payload = {
        "title_id": 30,
        "community_org_id": 40,
        "ccc_ref": "CCC-1",
        "annual_volume_m3": 1000,
    }
    payload.update(overrides)
    return client.post(
        "/api/community/agreements", json=payload, headers={"Authorization": f"Bearer {token}"}
    )


def test_company_creates_ccc_with_default_rate(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = _create(client, _token(users[2]))
    assert resp.status_code == 201
    body = resp.json()
    assert body["fdl_rate_fcfa_m3"] == 800
    assert body["contribution_fcfa"] == 800 * 1000
    assert body["status"] == "actif"


def test_custom_rate_and_missing_volume(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = _create(client, _token(users[2]), fdl_rate_fcfa_m3=1200, annual_volume_m3=None)
    assert resp.status_code == 201
    assert resp.json()["contribution_fcfa"] is None


def test_foreign_title_is_403(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[6])).status_code == 403


def test_target_not_a_community_is_400(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[2]), community_org_id=20).status_code == 400


def test_missing_organization_is_conflict(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[5])).status_code == 409


def test_communities_directory_is_available(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = client.get(
        "/api/community/communities", headers={"Authorization": f"Bearer {_token(users[2])}"}
    )
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "Village Mbe"


def test_admin_lists_all_company_lists_own(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[2])).status_code == 201
    admin = client.get(
        "/api/community/agreements", headers={"Authorization": f"Bearer {_token(users[1])}"}
    ).json()
    assert len(admin) == 1
    mine = client.get(
        "/api/community/agreements", headers={"Authorization": f"Bearer {_token(users[2])}"}
    ).json()
    assert len(mine) == 1
    other = client.get(
        "/api/community/agreements", headers={"Authorization": f"Bearer {_token(users[6])}"}
    ).json()
    assert other == []


def test_admin_decides_agreement(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    aid = _create(client, _token(users[2])).json()["id"]
    resp = client.patch(
        f"/api/community/agreements/{aid}",
        json={"status": "suspendu", "cgsp_minutes_document_id": 77},
        headers={"Authorization": f"Bearer {_token(users[1])}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "suspendu"
    assert body["cgsp_minutes_document_id"] == 77


def test_company_cannot_decide(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    aid = _create(client, _token(users[2])).json()["id"]
    assert (
        client.patch(
            f"/api/community/agreements/{aid}",
            json={"status": "clos"},
            headers={"Authorization": f"Bearer {_token(users[2])}"},
        ).status_code
        == 403
    )
