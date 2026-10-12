"""Slice 6 tests: harvest authorizations + start-of-activities notification.

Loi 016/01 art. 14 — no felling without a prior authorization. A company
requests one of the four TTP authorizations on an AAC (soumis), the Ministry
delivers or rejects it (motif required to reject), and the company then
notifies the start of activities.
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


def _setup(monkeypatch):
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
        6: {
            "id": 6,
            "email": "other@x",
            "display_name": "Other",
            "role": "company",
            "password_hash": _pw("otherpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": 11,
        },
        5: {
            "id": 5,
            "email": "noorg@x",
            "display_name": "NoOrg",
            "role": "company",
            "password_hash": _pw("noorgpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": None,
        },
    }
    state = {
        "auth_seq": 700,
        "organizations": {
            10: {"id": 10, "name": "Bois SA"},
            11: {"id": 11, "name": "Autre SARL"},
        },
        "forest_titles": {
            30: {"id": 30, "reference": "T-1", "holder_org_id": 10, "status": "actif"}
        },
        "management_units": {60: {"id": 60, "title_id": 30, "label": "UFA-1"}},
        "annual_cut_blocks": {
            40: {
                "id": 40,
                "ufa_id": 60,
                "label": "AAC-2026",
                "status": "ouvert",
                "pao_reference": None,
            }
        },
        "aac_authorizations": {},
    }

    def _enrich(auth: dict) -> dict:
        aac = state["annual_cut_blocks"].get(auth["aac_id"], {})
        ufa = state["management_units"].get(aac.get("ufa_id"), {})
        title = state["forest_titles"].get(ufa.get("title_id"), {})
        org = state["organizations"].get(title.get("holder_org_id"), {})
        return {
            **auth,
            "aac_label": aac.get("label"),
            "title_id": title.get("id"),
            "title_ref": title.get("reference"),
            "holder_org_id": title.get("holder_org_id"),
            "org_name": org.get("name"),
        }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return {k: v for k, v in users[args[0]].items() if k != "password_hash"}
        if "from aac_authorizations" in s and "where aa.id" in s:
            auth = state["aac_authorizations"].get(args[0])
            return _enrich(auth) if auth is not None else None
        if "from annual_cut_blocks a join management_units" in s:
            aac = state["annual_cut_blocks"].get(args[0])
            if aac is None:
                return None
            ufa = state["management_units"].get(aac["ufa_id"], {})
            title = state["forest_titles"].get(ufa.get("title_id"), {})
            return {
                "id": aac["id"],
                "status": aac["status"],
                "pao_reference": aac.get("pao_reference"),
                "ufa_id": aac["ufa_id"],
                "holder_org_id": title.get("holder_org_id"),
            }
        if "insert into aac_authorizations" in s:
            aid = state["auth_seq"]
            state["auth_seq"] += 1
            row = {
                "id": aid,
                "aac_id": args[0],
                "authorization_type": args[1],
                "reference": args[2],
                "valid_from": args[3],
                "valid_to": args[4],
                "plan_document_id": args[5],
                "issued_by": None,
                "issued_at": None,
                "startup_notified_at": None,
                "startup_notified_by": None,
                "status": "soumis",
                "decision_motif": None,
                "created_at": "now",
            }
            state["aac_authorizations"][aid] = row
            return dict(row)
        if "update aac_authorizations set status" in s:
            auth = state["aac_authorizations"].get(args[4])
            if auth is None:
                return None
            auth["status"] = args[0]
            auth["decision_motif"] = args[1]
            auth["issued_by"] = args[2]
            auth["issued_at"] = args[3]
            return {
                "id": auth["id"],
                "aac_id": auth["aac_id"],
                "status": auth["status"],
                "decision_motif": auth["decision_motif"],
                "issued_at": auth["issued_at"],
            }
        if "update aac_authorizations set startup_notified_at" in s:
            auth = state["aac_authorizations"].get(args[1])
            if auth is None:
                return None
            auth["startup_notified_at"] = "now"
            auth["startup_notified_by"] = args[0]
            return {
                "id": auth["id"],
                "aac_id": auth["aac_id"],
                "status": auth["status"],
                "startup_notified_at": auth["startup_notified_at"],
            }
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from aac_authorizations" in s and "where aa.aac_id" in s:
            return [
                _enrich(a) for a in state["aac_authorizations"].values() if a["aac_id"] == args[0]
            ]
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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_company_requests_authorization_and_admin_delivers(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])

    created = client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "permis_annuel_operations", "reference": "PAO-2026-1"},
        headers=_auth(co),
    )
    assert created.status_code == 201
    assert created.json()["status"] == "soumis"
    auth_id = created.json()["id"]

    delivered = client.patch(
        f"/api/titles/authorizations/{auth_id}",
        json={"decision": "delivre"},
        headers=_auth(admin),
    )
    assert delivered.status_code == 200
    assert delivered.json()["status"] == "delivre"
    assert delivered.json()["issued_at"] is not None

    listed = client.get("/api/titles/aacs/40/authorizations", headers=_auth(co))
    assert listed.status_code == 200
    assert [a["id"] for a in listed.json()] == [auth_id]
    assert listed.json()[0]["aac_label"] == "AAC-2026"
    assert state["aac_authorizations"][auth_id]["issued_by"] == 1


def test_reject_requires_motif(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    # Seed directly: a submitted authorization.
    resp = client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "certificat_assiette"},
        headers=_auth(_token(users[2])),
    )
    auth_id = resp.json()["id"]

    no_motif = client.patch(
        f"/api/titles/authorizations/{auth_id}",
        json={"decision": "rejete"},
        headers=_auth(admin),
    )
    assert no_motif.status_code == 400

    rejected = client.patch(
        f"/api/titles/authorizations/{auth_id}",
        json={"decision": "rejete", "motif": "Pièces incomplètes"},
        headers=_auth(admin),
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejete"
    assert rejected.json()["decision_motif"] == "Pièces incomplètes"


def test_company_cannot_touch_foreign_aac(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    other = _token(users[6])  # organization 11

    listed = client.get("/api/titles/aacs/40/authorizations", headers=_auth(other))
    assert listed.status_code == 403

    created = client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "cae"},
        headers=_auth(other),
    )
    assert created.status_code == 403


def test_list_unknown_aac_is_404(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    assert client.get("/api/titles/aacs/999/authorizations", headers=_auth(co)).status_code == 404


def test_company_without_org_is_conflict(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    noorg = _token(users[5])
    resp = client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "cae"},
        headers=_auth(noorg),
    )
    assert resp.status_code == 409


def test_notify_startup_requires_delivered_authorization(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])

    created = client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "certificat_vente_coupe"},
        headers=_auth(co),
    )
    auth_id = created.json()["id"]

    too_early = client.post(
        f"/api/titles/authorizations/{auth_id}/notify-startup", headers=_auth(co)
    )
    assert too_early.status_code == 409

    client.patch(
        f"/api/titles/authorizations/{auth_id}",
        json={"decision": "delivre"},
        headers=_auth(admin),
    )
    notified = client.post(
        f"/api/titles/authorizations/{auth_id}/notify-startup", headers=_auth(co)
    )
    assert notified.status_code == 200
    assert notified.json()["startup_notified_at"] is not None
    assert state["aac_authorizations"][auth_id]["startup_notified_by"] == 2

    again = client.post(f"/api/titles/authorizations/{auth_id}/notify-startup", headers=_auth(co))
    assert again.status_code == 409


def test_authorization_pdf_is_scoped(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    other = _token(users[6])

    created = client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "permis_annuel_operations", "reference": "PAO-1"},
        headers=_auth(co),
    )
    auth_id = created.json()["id"]

    pdf = client.get(f"/api/titles/authorizations/{auth_id}/pdf", headers=_auth(co))
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    forbidden = client.get(f"/api/titles/authorizations/{auth_id}/pdf", headers=_auth(other))
    assert forbidden.status_code == 403


def test_admin_can_list_any_aac_authorizations(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])
    client.post(
        "/api/titles/aacs/40/authorizations",
        json={"authorization_type": "cae"},
        headers=_auth(co),
    )
    resp = client.get("/api/titles/aacs/40/authorizations", headers=_auth(admin))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
