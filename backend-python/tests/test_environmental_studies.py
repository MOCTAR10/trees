"""Environmental studies PPF / EIE & certificat de conformité (Slice 11; DB mocked).

An environmental assessment is a precondition to producing a forest
concession: the operator deposits a Plan de Protection de la Faune (PPF,
DGFAP) or an Étude d'Impact Environnemental (EIE, DGE, Loi 007/2014); the
Ministry approves it (or rejects it, motivated) and issues the certificat de
conformité once validated. A validated study lapses to 'expire' at read time.
This suite covers the lifecycle rules, the audit trail and the API scoping.
"""

from datetime import date

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
            30: {
                "id": 30,
                "title_type": "CFAD",
                "reference": "T-1",
                "holder_org_id": 10,
                "status": "exploration",
            }
        },
        "studies": {},
        "study_seq": 900,
    }
    return users, state


def _derive_status(row: dict) -> dict:
    row = dict(row)
    valid_to = row.get("valid_to")
    if (
        row.get("status") == "valide"
        and valid_to is not None
        and str(valid_to)[:10] < date.today().isoformat()
    ):
        row["status"] = "expire"
    return row


def _enrich(state, study: dict) -> dict:
    study = _derive_status(study)
    title = state["forest_titles"].get(study["title_id"], {})
    org = state["organizations"].get(title.get("holder_org_id"), {})
    study["title_type"] = title.get("title_type")
    study["title_ref"] = title.get("reference")
    study["holder_org_id"] = title.get("holder_org_id")
    study["org_name"] = org.get("name")
    return study


def _install_fake_db(monkeypatch, users, state):
    def insert_row(args):
        sid = state["study_seq"]
        state["study_seq"] += 1
        row = {
            "id": sid,
            "title_id": args[0],
            "study_type": args[1],
            "reference": args[2],
            "authority": args[3],
            "conducted_at": args[4],
            "valid_from": args[5],
            "valid_to": args[6],
            "status": "soumis",
            "certificate_ref": None,
            "certificate_issued_at": None,
            "certificate_issued_by": None,
            "decision_motif": None,
            "submitted_by": args[7],
            "decided_by": None,
            "decided_at": None,
            "created_at": "now",
        }
        state["studies"][sid] = row
        return {
            k: row[k]
            for k in (
                "id",
                "title_id",
                "study_type",
                "reference",
                "authority",
                "conducted_at",
                "valid_from",
                "valid_to",
                "status",
                "certificate_ref",
                "decision_motif",
                "created_at",
            )
        }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            user = users.get(args[0])
            if user is None or not user["is_active"]:
                return None
            return {k: v for k, v in user.items() if k != "password_hash"}
        if "insert into environmental_studies" in s:
            return insert_row(args)
        if "update environmental_studies set status" in s:
            study = state["studies"][args[3]]
            study["status"] = args[0]
            study["decision_motif"] = args[1]
            study["decided_by"] = args[2]
            return {
                "id": study["id"],
                "title_id": study["title_id"],
                "study_type": study["study_type"],
                "status": study["status"],
                "decision_motif": study["decision_motif"],
                "decided_at": "now",
            }
        if "update environmental_studies set certificate_ref" in s:
            study = state["studies"][args[3]]
            study["certificate_ref"] = args[0]
            study["certificate_issued_at"] = args[1]
            study["certificate_issued_by"] = args[2]
            return {
                "id": study["id"],
                "title_id": study["title_id"],
                "certificate_ref": study["certificate_ref"],
                "certificate_issued_at": study["certificate_issued_at"],
            }
        if "from environmental_studies s" in s:
            study = state["studies"].get(args[0])
            if study is None or study["title_id"] != args[1]:
                return None
            return _enrich(state, study)
        if "from forest_titles where id" in s:
            row = state["forest_titles"].get(args[0])
            return dict(row) if row else None
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from environmental_studies s" in s:
            return [
                _enrich(state, study)
                for study in state["studies"].values()
                if study["title_id"] == args[0]
            ]
        return []

    async def execute(sql, *args):
        return None

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)


@pytest.fixture
def client():
    return TestClient(app)


def _deposit(client, token: str, **overrides):
    body = {"study_type": "eie", "reference": "EIE-2026-01"}
    body.update(overrides)
    return client.post("/api/titles/30/studies", json=body, headers=_auth(token))


def test_company_deposits_a_study(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = _deposit(client, _token(users[2]))
    assert resp.status_code == 201
    body = resp.json()
    assert body["study_type"] == "eie"
    assert body["status"] == "soumis"
    assert body["certificate_ref"] is None
    assert state["studies"][body["id"]]["submitted_by"] == 2


def test_company_cannot_deposit_on_a_foreign_title(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    resp = _deposit(client, _token(users[3]))
    assert resp.status_code == 403


def test_admin_validates_then_issues_a_single_certificate(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    study_id = _deposit(client, _token(users[2])).json()["id"]

    validated = client.patch(
        f"/api/titles/30/studies/{study_id}",
        json={"decision": "valide"},
        headers=_auth(admin),
    )
    assert validated.status_code == 200
    assert validated.json()["status"] == "valide"
    assert state["studies"][study_id]["decided_by"] == 1

    issued = client.post(
        f"/api/titles/30/studies/{study_id}/certificate",
        json={"reference": "CERT-CONF-01"},
        headers=_auth(admin),
    )
    assert issued.status_code == 200
    assert issued.json()["certificate_ref"] == "CERT-CONF-01"
    assert issued.json()["certificate_issued_at"] is not None
    assert state["studies"][study_id]["certificate_issued_by"] == 1

    twice = client.post(
        f"/api/titles/30/studies/{study_id}/certificate",
        json={"reference": "CERT-CONF-02"},
        headers=_auth(admin),
    )
    assert twice.status_code == 409


def test_reject_requires_a_motif(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    study_id = _deposit(client, _token(users[2])).json()["id"]

    no_motif = client.patch(
        f"/api/titles/30/studies/{study_id}",
        json={"decision": "rejete"},
        headers=_auth(admin),
    )
    assert no_motif.status_code == 400

    rejected = client.patch(
        f"/api/titles/30/studies/{study_id}",
        json={"decision": "rejete", "motif": "Inventaire faunique incomplet"},
        headers=_auth(admin),
    )
    assert rejected.status_code == 200
    assert rejected.json()["decision_motif"] == "Inventaire faunique incomplet"


def test_certificate_requires_a_validated_study(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    study_id = _deposit(client, _token(users[2])).json()["id"]

    resp = client.post(
        f"/api/titles/30/studies/{study_id}/certificate",
        json={"reference": "CERT-CONF-01"},
        headers=_auth(admin),
    )
    assert resp.status_code == 409
    assert "validée" in resp.json()["detail"]


def test_company_reads_own_and_forbidden_on_foreign(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    _deposit(client, _token(users[2]), study_type="ppf", reference="PPF-2026-01")

    own = client.get("/api/titles/30/studies", headers=_auth(_token(users[2])))
    assert own.status_code == 200
    assert len(own.json()) == 1
    assert own.json()[0]["reference"] == "PPF-2026-01"

    denied = client.get("/api/titles/30/studies", headers=_auth(_token(users[3])))
    assert denied.status_code == 403


def test_company_cannot_decide_or_certify(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    co = _auth(_token(users[2]))
    study_id = _deposit(client, _token(users[2])).json()["id"]
    patch = client.patch(
        f"/api/titles/30/studies/{study_id}",
        json={"decision": "valide"},
        headers=co,
    )
    assert patch.status_code == 403
    cert = client.post(
        f"/api/titles/30/studies/{study_id}/certificate",
        json={"reference": "X"},
        headers=co,
    )
    assert cert.status_code == 403


def test_unknown_title_is_404(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _auth(_token(users[1]))
    assert client.get("/api/titles/999/studies", headers=admin).status_code == 404
    assert (
        client.post(
            "/api/titles/999/studies",
            json={"study_type": "eie", "reference": "X"},
            headers=_auth(_token(users[2])),
        ).status_code
        == 404
    )


def test_validated_study_expires_at_read(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    admin = _token(users[1])
    study_id = _deposit(
        client, _token(users[2]), valid_from="2019-01-01", valid_to="2020-01-01"
    ).json()["id"]
    client.patch(
        f"/api/titles/30/studies/{study_id}",
        json={"decision": "valide"},
        headers=_auth(admin),
    )

    rows = client.get("/api/titles/30/studies", headers=_auth(admin)).json()
    assert rows[0]["status"] == "expire"
    # The stored status is untouched; only the read view is derived.
    assert state["studies"][study_id]["status"] == "valide"


def test_study_pdf_is_scoped(client, monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    study_id = _deposit(client, _token(users[2])).json()["id"]

    pdf = client.get(f"/api/titles/30/studies/{study_id}/pdf", headers=_auth(_token(users[2])))
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    forbidden = client.get(
        f"/api/titles/30/studies/{study_id}/pdf", headers=_auth(_token(users[3]))
    )
    assert forbidden.status_code == 403
