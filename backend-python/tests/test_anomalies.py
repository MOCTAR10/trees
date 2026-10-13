"""Slice 8 — extended anomaly register (Ministry sweep + review decisions)."""

import json

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
    }

    state = {
        "lines": {
            "below_dme": [
                {
                    "tree_code": "GA-DME-1",
                    "species_scientific_name": "Aucoumea klaineana",
                    "measured_dbh_cm": 40,
                    "dme_cm": 60,
                    "declaration_id": 5,
                    "title_id": 3,
                    "aac_id": 7,
                    "org_id": 10,
                    "created_at": "2026-01-02T10:00:00+00:00",
                    "title_ref": "CFAD-1",
                    "aac_label": "AAC-2026",
                }
            ],
            "outside_aac": [
                {
                    "tree_code": "GA-OUT-1",
                    "species_scientific_name": None,
                    "measured_dbh_cm": 80,
                    "dme_cm": 60,
                    "declaration_id": 5,
                    "title_id": 3,
                    "aac_id": 7,
                    "org_id": 10,
                    "created_at": "2026-01-02T10:00:00+00:00",
                    "title_ref": "CFAD-1",
                    "aac_label": "AAC-2026",
                }
            ],
            "reserved_species": [],
        },
        "unauth": [{"tree_code": "GA-WILD", "created_at": "2026-02-01T08:00:00+00:00", "actor_id": 4}],
        "closed_aac_decls": [
            {
                "declaration_id": 9,
                "permit_number": "PGG-9",
                "title_id": 3,
                "aac_id": 7,
                "aac_label": "AAC-2026",
                "aac_status": "ferme",
                "title_ref": "CFAD-1",
                "created_at": "2026-03-01T08:00:00+00:00",
            }
        ],
        "documents": [
            {
                "id": 21,
                "doc_type": "agrement_exploitation",
                "status": "expire",
                "expires_at": "2025-12-31",
                "scope_type": "company",
                "scope_id": 10,
                "doc_label": "Agrément d'exploitation",
                "authority": "DGF",
            }
        ],
        "dues": [
            {
                "id": 33,
                "tax_type": "superficie",
                "period_year": 2025,
                "due_at": "2025-06-30",
                "amount_fcfa": 1200000,
                "org_id": 10,
                "org_name": "Bois SA",
            }
        ],
        "cites": [
            {
                "tree_code": "GA-CITES-1",
                "species_scientific_name": "Pericopsis elata",
                "declaration_id": 12,
                "org_id": 10,
                "created_at": "2026-04-01T08:00:00+00:00",
            }
        ],
        "transport": [
            {
                "tree_code": "GA-MOVE-1",
                "status": "transporte",
                "felled_at": "2026-05-01T08:00:00+00:00",
                "org_id": 10,
            }
        ],
        "reviews": {},
    }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return {k: v for k, v in users[args[0]].items() if k != "password_hash"}
        if "insert into anomaly_reviews" in s:
            row = {
                "anomaly_type": args[0],
                "subject_key": args[1],
                "status": args[5],
                "decision_motif": args[6],
                "reviewed_at": "2026-06-01T00:00:00+00:00",
            }
            state["reviews"][(args[0], args[1])] = row
            return dict(row)
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from custody_events c" in s:
            return state["unauth"]
        if "from declaration_lines l" in s and "cites_listed" in s:
            return state["cites"]
        if "from declaration_lines l" in s:
            code = json.loads(args[0])[0]
            return state["lines"].get(code, [])
        if "from felling_declarations d" in s and "annual_cut_blocks a" in s:
            return state["closed_aac_decls"]
        if "from legal_documents ld" in s:
            return state["documents"]
        if "from tax_dues td" in s:
            return state["dues"]
        if "from tree_registry tr" in s:
            return state["transport"]
        if "from anomaly_reviews" in s:
            return list(state["reviews"].values())
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


def test_sweep_reports_every_family(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])

    resp = client.get("/api/anomalies", headers=_auth(admin))
    assert resp.status_code == 200
    types = sorted({i["type"] for i in resp.json()})
    assert types == [
        "aac_fermee",
        "abattage_hors_aac",
        "below_dme",
        "cites_sans_permis",
        "documents_expires",
        "felled_without_authorization",
        "taxes_impayees",
        "transport_sans_bordereau",
    ]

    severities = {i["type"]: i["severity"] for i in resp.json()}
    assert severities["below_dme"] == "hard"
    assert severities["documents_expires"] == "warning"
    assert all(i["review_status"] == "ouverte" for i in resp.json())


def test_summary_counts_by_severity(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])

    body = client.get("/api/anomalies/summary", headers=_auth(admin)).json()
    assert body["total"] == 8
    assert body["hard"] == 4
    assert body["warning"] == 4
    assert body["ouvertes"] == 8
    by_type = {e["type"]: e["count"] for e in body["by_type"]}
    assert by_type["below_dme"] == 1
    # Hard anomalies rank first.
    assert body["by_type"][0]["severity"] == "hard"


def test_filters_by_type_and_severity(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])

    only_docs = client.get("/api/anomalies?type=documents_expires", headers=_auth(admin)).json()
    assert [i["type"] for i in only_docs] == ["documents_expires"]

    hard = client.get("/api/anomalies?severity=hard", headers=_auth(admin)).json()
    assert {i["type"] for i in hard} == {
        "below_dme",
        "abattage_hors_aac",
        "felled_without_authorization",
        "aac_fermee",
    }

    warnings = client.get("/api/anomalies?severity=warning", headers=_auth(admin)).json()
    assert len(warnings) == 4


def test_review_requires_motif_when_dismissed(client, monkeypatch):
    users, state = _setup(monkeypatch)
    admin = _token(users[1])

    missing = client.post(
        "/api/anomalies/review",
        json={"anomaly_type": "below_dme", "subject_key": "GA-DME-1", "status": "ecartee"},
        headers=_auth(admin),
    )
    assert missing.status_code == 400

    created = client.post(
        "/api/anomalies/review",
        json={
            "anomaly_type": "below_dme",
            "subject_key": "GA-DME-1",
            "status": "ecartee",
            "decision_motif": "Erreur de mesure confirmée sur site",
        },
        headers=_auth(admin),
    )
    assert created.status_code == 201
    assert created.json()["status"] == "ecartee"
    assert ("below_dme", "GA-DME-1") in state["reviews"]

    listed = client.get("/api/anomalies", headers=_auth(admin)).json()
    reviewed = [i for i in listed if i["type"] == "below_dme"][0]
    assert reviewed["review_status"] == "ecartee"
    assert reviewed["review_motif"] == "Erreur de mesure confirmée sur site"

    open_only = client.get("/api/anomalies?review=ouverte", headers=_auth(admin)).json()
    assert all(i["type"] != "below_dme" for i in open_only)


def test_review_rejects_unknown_type(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.post(
        "/api/anomalies/review",
        json={"anomaly_type": "nope", "subject_key": "x", "status": "traitee"},
        headers=_auth(admin),
    )
    assert resp.status_code == 400


def test_company_cannot_read_anomalies(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    assert client.get("/api/anomalies", headers=_auth(co)).status_code == 403


def test_anomalies_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.get("/api/anomalies/pdf", headers=_auth(admin))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
