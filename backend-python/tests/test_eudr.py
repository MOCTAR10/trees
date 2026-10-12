"""EUDR slice: due diligence at the parcel of origin (parcel + geolocation)."""

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
        "seq": 1,
        "diligence": {},
        "titles": {30: {"holder_org_id": 10, "reference": "T-1"}},
        "counts": {"felled": 3, "geolocated": 2},
    }

    def _enrich(d):
        if d is None:
            return None
        return {
            **d,
            "parcel_wkt": "POLYGON((0 0, 1 0, 1 1, 0 0))",
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
        if "count(*) as felled" in s:
            return dict(state["counts"])
        if "insert into eudr_diligence" in s:
            did = state["seq"]
            state["seq"] += 1
            row = {
                "id": did,
                "org_id": args[0],
                "title_id": args[1],
                "parcel_label": args[2],
                "consultation_document_id": args[4],
                "geolocated_stem_count": args[5],
                "felled_stem_count": args[6],
                "declared_volume_m3": args[7],
                "notes": args[8],
                "status": "soumis",
                "submitted_by": args[9],
                "decided_by": None,
                "decided_at": None,
                "decision_motif": None,
                "created_at": "2026-05-10T10:00:00",
            }
            state["diligence"][did] = row
            return dict(row)
        if "update eudr_diligence set status" in s:
            did = args[-1]
            row = state["diligence"].get(did)
            if row is None:
                return None
            row["status"] = args[0]
            row["decision_motif"] = args[1]
            row["decided_by"] = args[2]
            row["decided_at"] = "2026-05-11T10:00:00"
            return {k: row[k] for k in ("id", "org_id", "status", "decision_motif", "decided_at")}
        if "from eudr_diligence d" in s and "where d.id" in s:
            return _enrich(state["diligence"].get(args[-1]))
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from eudr_diligence d" in s:
            rows = [_enrich(d) for d in state["diligence"].values()]
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
        "parcel_label": "Parcelle Nord",
        "parcel_wkt": "POLYGON((0 0, 1 0, 1 1, 0 0))",
        "declared_volume_m3": 42.0,
    }
    payload.update(overrides)
    return client.post(
        "/api/eudr/diligence", json=payload, headers={"Authorization": f"Bearer {token}"}
    )


def test_company_submits_diligence_with_geolocation_counts(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    resp = _create(client, _token(users[2]))
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "soumis"
    assert body["felled_stem_count"] == 3
    assert body["geolocated_stem_count"] == 2


def test_foreign_title_is_403(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[6])).status_code == 403


def test_missing_organization_is_conflict(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[5])).status_code == 409


def test_admin_cannot_submit(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[1])).status_code == 403


def test_list_scoped_and_filterable(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    assert _create(client, _token(users[2])).status_code == 201
    co = client.get(
        "/api/eudr/diligence", headers={"Authorization": f"Bearer {_token(users[2])}"}
    ).json()
    assert len(co) == 1
    other = client.get(
        "/api/eudr/diligence", headers={"Authorization": f"Bearer {_token(users[6])}"}
    ).json()
    assert other == []
    admin = client.get(
        "/api/eudr/diligence", headers={"Authorization": f"Bearer {_token(users[1])}"}
    ).json()
    assert len(admin) == 1
    none = client.get(
        "/api/eudr/diligence?status=valide", headers={"Authorization": f"Bearer {_token(users[2])}"}
    ).json()
    assert none == []


def test_detail_forbidden_for_other_company(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    did = _create(client, _token(users[2])).json()["id"]
    assert (
        client.get(
            f"/api/eudr/diligence/{did}", headers={"Authorization": f"Bearer {_token(users[6])}"}
        ).status_code
        == 403
    )


def test_admin_validates_and_rejects(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    did = _create(client, _token(users[2])).json()["id"]
    admin = _token(users[1])
    assert (
        client.patch(
            f"/api/eudr/diligence/{did}",
            json={"status": "rejete"},
            headers={"Authorization": f"Bearer {admin}"},
        ).status_code
        == 400
    )
    ok = client.patch(
        f"/api/eudr/diligence/{did}",
        json={"status": "valide"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert ok.status_code == 200 and ok.json()["status"] == "valide"
    rejected = client.patch(
        f"/api/eudr/diligence/{did}",
        json={"status": "rejete", "motif": "Parcelle incomplète"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["decision_motif"] == "Parcelle incomplète"


def test_diligence_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    did = _create(client, _token(users[2])).json()["id"]
    resp = client.get(
        f"/api/eudr/diligence/{did}/pdf", headers={"Authorization": f"Bearer {_token(users[2])}"}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"
