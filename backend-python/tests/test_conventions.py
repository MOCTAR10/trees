"""Title conventions & attestation de conformité (Slice 10, Loi 016/01; DB mocked).

The convention provisoire (signed after the CPAET) then the convention
définitive (~15 ans) are the legal instruments that confer the right to
harvest; the Ministry issues the attestation de conformité on satisfactory
completion. This suite covers the lifecycle rules, the audit trail and the
API scoping.
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
            "organization_id": 11,
        },
    }
    state = {
        "organizations": {
            10: {"id": 10, "name": "Bois SA"},
            11: {"id": 11, "name": "Autre SARL"},
        },
        "forest_titles": {
            30: {"id": 30, "reference": "T-1", "holder_org_id": 10, "status": "exploration"}
        },
        "conventions": {},
        "conv_seq": 900,
    }
    return users, state


def _enrich(state, conv: dict) -> dict:
    title = state["forest_titles"].get(conv["title_id"], {})
    org = state["organizations"].get(title.get("holder_org_id"), {})
    return {
        **conv,
        "title_type": "CFAD",
        "title_ref": title.get("reference"),
        "holder_org_id": title.get("holder_org_id"),
        "org_name": org.get("name"),
    }


def _install_fake_db(monkeypatch, users, state):
    def insert_row(args):
        cid = state["conv_seq"]
        state["conv_seq"] += 1
        row = {
            "id": cid,
            "title_id": args[0],
            "convention_type": args[1],
            "reference": args[2],
            "signed_at": args[3],
            "start_date": args[4],
            "end_date": args[5],
            "surface_ha": args[6],
            "status": "active",
            "attestation_ref": None,
            "attestation_issued_at": None,
            "attestation_issued_by": None,
            "decision_motif": args[7],
            "decided_by": args[8],
            "created_at": "now",
        }
        state["conventions"][cid] = row
        return {
            "id": row["id"],
            "title_id": row["title_id"],
            "convention_type": row["convention_type"],
            "reference": row["reference"],
            "signed_at": row["signed_at"],
            "start_date": row["start_date"],
            "end_date": row["end_date"],
            "surface_ha": row["surface_ha"],
            "status": row["status"],
            "attestation_ref": row["attestation_ref"],
            "decision_motif": row["decision_motif"],
            "created_at": row["created_at"],
        }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            user = users.get(args[0])
            if user is None or not user["is_active"]:
                return None
            return {k: v for k, v in user.items() if k != "password_hash"}
        if "from forest_titles where id" in s:
            row = state["forest_titles"].get(args[0])
            return dict(row) if row else None
        if "insert into title_conventions" in s:
            return insert_row(args)
        if "update title_conventions set status" in s:
            conv = state["conventions"][args[3]]
            conv["status"] = args[0]
            conv["decision_motif"] = args[1]
            conv["decided_by"] = args[2]
            return {
                "id": conv["id"],
                "title_id": conv["title_id"],
                "convention_type": conv["convention_type"],
                "status": conv["status"],
                "decision_motif": conv["decision_motif"],
            }
        if "update title_conventions set attestation_ref" in s:
            conv = state["conventions"][args[3]]
            conv["attestation_ref"] = args[0]
            conv["attestation_issued_at"] = args[1]
            conv["attestation_issued_by"] = args[2]
            return {
                "id": conv["id"],
                "title_id": conv["title_id"],
                "attestation_ref": conv["attestation_ref"],
                "attestation_issued_at": conv["attestation_issued_at"],
            }
        if "from title_conventions c" in s:
            conv = state["conventions"].get(args[0])
            return _enrich(state, dict(conv)) if conv else None
        if "from title_conventions where" in s:
            ctype = "provisoire" if "convention_type = 'provisoire'" in s else "definitive"
            for conv in state["conventions"].values():
                if (
                    conv["title_id"] == args[0]
                    and conv["convention_type"] == ctype
                    and conv["status"] == "active"
                ):
                    return {"id": conv["id"]}
            return None
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from title_conventions c" in s:
            return [
                _enrich(state, dict(c))
                for c in state["conventions"].values()
                if c["title_id"] == args[0]
            ]
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if "update forest_titles set status = $1" in s:
            state["forest_titles"][args[3]]["status"] = args[0]
        elif "update forest_titles set status = 'provisoire'" in s:
            state["forest_titles"][args[0]]["status"] = "provisoire"
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)


@pytest.fixture
def client():
    return TestClient(app)


def _record(client, token, ctype, reference):
    return client.post(
        "/api/titles/30/conventions",
        json={"convention_type": ctype, "reference": reference},
        headers=_auth(token),
    )


def test_admin_records_provisoire_and_promotes_title(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = _record(client, _token(users[1]), "provisoire", "CONV-PROV-01")
    assert resp.status_code == 201
    body = resp.json()
    assert body["convention_type"] == "provisoire"
    assert body["title_status"] == "provisoire"
    assert state["forest_titles"][30]["status"] == "provisoire"
    assert state["conventions"][body["id"]]["decided_by"] == 1


def test_definitive_requires_an_active_provisoire(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = _record(client, _token(users[1]), "definitive", "CONV-DEF-01")
    assert resp.status_code == 409
    assert "provisoire" in resp.json()["detail"]


def test_definitive_after_provisoire_activates_title_once(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    _record(client, admin, "provisoire", "CONV-PROV-01")

    definitive = _record(client, admin, "definitive", "CONV-DEF-01")
    assert definitive.status_code == 201
    assert definitive.json()["title_status"] == "actif"
    assert state["forest_titles"][30]["status"] == "actif"

    again = _record(client, admin, "definitive", "CONV-DEF-02")
    assert again.status_code == 409
    assert "déjà" in again.json()["detail"]


def test_attestation_is_issued_once_on_an_active_convention(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    _record(client, admin, "provisoire", "CONV-PROV-01")
    conv_id = _record(client, admin, "definitive", "CONV-DEF-01").json()["id"]

    issued = client.post(
        f"/api/titles/30/conventions/{conv_id}/attestation",
        json={"reference": "ATT-2026-01"},
        headers=_auth(admin),
    )
    assert issued.status_code == 200
    assert issued.json()["attestation_ref"] == "ATT-2026-01"
    assert issued.json()["attestation_issued_at"] is not None
    assert state["conventions"][conv_id]["attestation_issued_by"] == 1

    twice = client.post(
        f"/api/titles/30/conventions/{conv_id}/attestation",
        json={"reference": "ATT-2026-02"},
        headers=_auth(admin),
    )
    assert twice.status_code == 409


def test_terminate_requires_motif_and_drops_title_to_provisoire(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    _record(client, admin, "provisoire", "CONV-PROV-01")
    conv_id = _record(client, admin, "definitive", "CONV-DEF-01").json()["id"]

    no_motif = client.patch(
        f"/api/titles/30/conventions/{conv_id}",
        json={"status": "resiliee"},
        headers=_auth(admin),
    )
    assert no_motif.status_code == 400

    terminated = client.patch(
        f"/api/titles/30/conventions/{conv_id}",
        json={"status": "resiliee", "motif": "Obligations non remplies"},
        headers=_auth(admin),
    )
    assert terminated.status_code == 200
    assert terminated.json()["status"] == "resiliee"
    assert terminated.json()["title_status"] == "provisoire"
    assert state["forest_titles"][30]["status"] == "provisoire"


def test_company_reads_own_and_forbidden_on_foreign(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    _record(client, _token(users[1]), "provisoire", "CONV-PROV-01")

    own = client.get("/api/titles/30/conventions", headers=_auth(_token(users[2])))
    assert own.status_code == 200
    assert len(own.json()) == 1
    assert own.json()[0]["reference"] == "CONV-PROV-01"

    denied = client.get("/api/titles/30/conventions", headers=_auth(_token(users[3])))
    assert denied.status_code == 403


def test_company_cannot_write(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    co = _auth(_token(users[2]))
    post = client.post(
        "/api/titles/30/conventions",
        json={"convention_type": "provisoire", "reference": "X"},
        headers=co,
    )
    assert post.status_code == 403
    patch = client.patch(
        "/api/titles/30/conventions/900",
        json={"status": "resiliee", "motif": "x"},
        headers=co,
    )
    assert patch.status_code == 403


def test_unknown_title_is_404(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _auth(_token(users[1]))
    assert client.get("/api/titles/999/conventions", headers=admin).status_code == 404
    assert (
        client.post(
            "/api/titles/999/conventions",
            json={"convention_type": "provisoire", "reference": "X"},
            headers=admin,
        ).status_code
        == 404
    )


def test_convention_pdf_is_scoped(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    conv_id = _record(client, admin, "provisoire", "CONV-PROV-01").json()["id"]

    pdf = client.get(f"/api/titles/30/conventions/{conv_id}/pdf", headers=_auth(_token(users[2])))
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    forbidden = client.get(
        f"/api/titles/30/conventions/{conv_id}/pdf", headers=_auth(_token(users[3]))
    )
    assert forbidden.status_code == 403
