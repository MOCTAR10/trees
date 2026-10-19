"""Fiscalité slice: tax dues (échéances) declared by the Ministry, settled by receipts."""

import re
from datetime import date, timedelta

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


def _user(uid, email, role, org=None, company=None):
    return {
        "id": uid,
        "email": email,
        "display_name": email,
        "role": role,
        "password_hash": _pw("pw"),
        "is_active": True,
        "cooperative_id": None,
        "company_id": company,
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
        "due_seq": 1,
        "dues": {},
        "receipt_seq": 500,
        "receipts": {},
        "titles": {30: {"id": 30, "holder_org_id": 10, "reference": "T-1"}},
    }

    def _enrich(d):
        if d is None:
            return None
        r = state["receipts"].get(d.get("receipt_id") or -1)
        return {
            **d,
            "paid_at": r["paid_at"] if r else None,
            "receipt_ref": r["receipt_ref"] if r else None,
            "receipt_amount_fcfa": r["amount_fcfa"] if r else None,
            "title_ref": "T-1",
            "org_name": "Bois SA",
        }

    def _apply(rows, s, args):
        for col, idx in re.findall(r"d\.(\w+) = \$(\d+)", s):
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
        if "insert into tax_dues" in s:
            did = state["due_seq"]
            state["due_seq"] += 1
            due = {
                "id": did,
                "org_id": args[0],
                "title_id": args[1],
                "tax_type": args[2],
                "period_year": args[3],
                "amount_fcfa": args[4],
                "due_at": args[5],
                "notes": args[6],
                "receipt_id": None,
                "created_at": "2026-05-10T10:00:00",
            }
            state["dues"][did] = due
            return dict(due)
        if "insert into tax_receipts" in s:
            rid = state["receipt_seq"]
            state["receipt_seq"] += 1
            state["receipts"][rid] = {
                "id": rid,
                "amount_fcfa": args[4],
                "receipt_ref": args[5],
                "paid_at": args[6],
            }
            return {"id": rid}
        if "select id from tax_dues where org_id" in s:
            org, tax_type, year, title = args
            for d in state["dues"].values():
                if (d["org_id"], d["tax_type"], d["period_year"]) == (org, tax_type, year) and (
                    d["receipt_id"] is None and (title is None or d["title_id"] == title)
                ):
                    return {"id": d["id"]}
            return None
        if "select * from tax_dues where id" in s:
            d = state["dues"].get(args[0])
            return dict(d) if d else None
        if "from tax_dues d" in s and "where d.id" in s:
            return _enrich(state["dues"].get(args[-1]))
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from tax_dues d" in s:
            rows = [_enrich(d) for d in state["dues"].values()]
            return _apply(rows, s, args)
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if "update tax_dues set receipt_id" in s:
            state["dues"][args[1]]["receipt_id"] = args[0]
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)
    return users, state


@pytest.fixture
def client():
    return TestClient(app)


def _create_due(client, token, **overrides):
    payload = {
        "title_id": 30,
        "tax_type": "superficie",
        "period_year": 2026,
        "amount_fcfa": 1_500_000,
        "due_at": (date.today() + timedelta(days=60)).isoformat(),
    }
    payload.update(overrides)
    return client.post(
        "/api/taxes/dues", json=payload, headers={"Authorization": f"Bearer {token}"}
    )


def test_admin_creates_due_for_title_holder(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = _create_due(client, _token(users[1]))
    assert resp.status_code == 201
    body = resp.json()
    assert body["org_id"] == 10
    assert body["status"] == "du"
    assert body["surcharge_fcfa"] == 0


def test_overdue_due_is_en_retard_with_double_right(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = _create_due(
        client, _token(users[1]), due_at=(date.today() - timedelta(days=5)).isoformat()
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "en_retard"
    assert body["surcharge_fcfa"] == body["amount_fcfa"]


def test_due_for_unknown_title_is_404(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create_due(client, _token(users[1]), title_id=999).status_code == 404


def test_company_cannot_create_due(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create_due(client, _token(users[2])).status_code == 403


def test_company_lists_only_own_dues_and_filters(client, monkeypatch):
    users, _state = _setup(monkeypatch)
    admin = _token(users[1])
    assert _create_due(client, admin).status_code == 201
    assert (
        _create_due(
            client, admin, due_at=(date.today() - timedelta(days=1)).isoformat()
        ).status_code
        == 201
    )

    co = _token(users[2])
    mine = client.get("/api/taxes/dues", headers={"Authorization": f"Bearer {co}"}).json()
    assert len(mine) == 2

    late = client.get(
        "/api/taxes/dues?status=en_retard", headers={"Authorization": f"Bearer {co}"}
    ).json()
    assert len(late) == 1 and late[0]["status"] == "en_retard"

    all_dues = client.get("/api/taxes/dues", headers={"Authorization": f"Bearer {admin}"}).json()
    assert len(all_dues) == 2


def test_settle_marks_due_paid(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    due_id = _create_due(client, admin).json()["id"]
    co = _token(users[2])
    resp = client.post(
        f"/api/taxes/dues/{due_id}/settle",
        json={"amount_fcfa": 1_500_000, "receipt_ref": "Q-1"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "paye"
    assert body["surcharge_fcfa"] == 0
    assert body["receipt_ref"] == "Q-1"


def test_settle_foreign_due_is_403(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    due_id = _create_due(client, _token(users[1])).json()["id"]
    other = _token(users[6])
    assert (
        client.post(
            f"/api/taxes/dues/{due_id}/settle",
            json={"amount_fcfa": 1},
            headers={"Authorization": f"Bearer {other}"},
        ).status_code
        == 403
    )


def test_settle_without_organization_is_conflict(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    due_id = _create_due(client, _token(users[1])).json()["id"]
    noorg = _token(users[5])
    assert (
        client.post(
            f"/api/taxes/dues/{due_id}/settle",
            json={"amount_fcfa": 1},
            headers={"Authorization": f"Bearer {noorg}"},
        ).status_code
        == 409
    )


def test_settle_twice_is_conflict(client, monkeypatch):
    users, state = _setup(monkeypatch)
    due_id = _create_due(client, _token(users[1])).json()["id"]
    co = _token(users[2])
    first = client.post(
        f"/api/taxes/dues/{due_id}/settle",
        json={"amount_fcfa": 1_500_000},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert first.status_code == 200
    again = client.post(
        f"/api/taxes/dues/{due_id}/settle",
        json={"amount_fcfa": 1_500_000},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert again.status_code == 409
    assert len(state["receipts"]) == 1


def test_paid_receipt_settles_the_matching_due(client, monkeypatch):
    users, state = _setup(monkeypatch)
    due_id = _create_due(client, _token(users[1])).json()["id"]
    resp = client.post(
        "/api/taxes",
        json={
            "tax_type": "superficie",
            "period_year": 2026,
            "amount_fcfa": 1_500_000,
            "paid_at": date.today().isoformat(),
            "title_id": 30,
        },
        headers={"Authorization": f"Bearer {_token(users[2])}"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["settled_due_id"] == due_id
    assert state["dues"][due_id]["receipt_id"] is not None


def test_receipt_on_another_organisations_title_is_refused(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = client.post(
        "/api/taxes",
        json={"tax_type": "superficie", "period_year": 2026, "amount_fcfa": 10, "title_id": 30},
        headers={"Authorization": f"Bearer {_token(users[6])}"},
    )
    assert resp.status_code == 403
