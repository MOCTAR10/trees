"""Slice 23 — company space and authority compass (DB mocked)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import anomalies, authorities, company_space, compliance, controls, db

BASE = {
    "is_active": True,
    "cooperative_id": None,
    "first_name": None,
    "last_name": None,
    "matricule": None,
}
COMPANY = {
    **BASE,
    "id": 2,
    "email": "co@x",
    "display_name": "Co",
    "role": "company",
    "company_id": None,
    "organization_id": 10,
}
ORPHAN = {**COMPANY, "id": 3, "email": "orphan@x", "organization_id": None}
ADMIN = {
    **BASE,
    "id": 1,
    "email": "admin@x",
    "display_name": "Admin",
    "role": "admin",
    "company_id": None,
    "organization_id": None,
}
USERS = {u["id"]: u for u in (COMPANY, ORPHAN, ADMIN)}


def _auth(user: dict) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 600
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


def test_authority_codes_are_read_from_free_text():
    assert authorities.codes_from("DGFAP / DGE") == ["DGFAP", "DGE"]
    assert authorities.codes_from("ANPN / DGICBVPF") == ["DGICBVPF", "ANPN"]
    assert authorities.codes_from("Direction Provinciale / DGF") == ["DGF", "DP"]
    assert authorities.codes_from("DGI") == ["DGI"]
    assert authorities.codes_from(None) == []


def test_competence_says_the_ministry_acts_for_the_competent_authority():
    c = authorities.competence("DGFAP / DGE")
    assert c["acting_authority"] == "Ministère des Eaux et Forêts"
    assert c["competent_codes"] == ["DGFAP", "DGE"]
    assert "pour le compte de : DGFAP / DGE" in c["competence_note"]
    assert "après la phase pilote" in c["competence_note"]


def test_compass_lists_every_stakeholder_with_pending_files():
    rows = authorities.compass({"studies": 2, "titles": 1, "eudr": 3})
    by = {r["code"]: r for r in rows}
    assert set(by) >= {"DGF", "DP", "DGFAP", "DGE", "ANPN", "DGICBVPF", "DGI", "DOUANES"}
    assert by["DGF"]["pending"] == 4 and by["DGFAP"]["pending"] == 2
    assert all(r["interface"] == "a_venir" for r in rows)


@pytest.fixture
def fake(monkeypatch):
    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return USERS.get(args[0])
        if "from organizations where id" in s:
            return {"id": 10, "name": "SFD", "org_type": "entreprise", "profile_code": "integre"}
        if "from tree_registry r" in s:
            return {"to_fell": 2, "to_ship": 1, "to_process": 0}
        if "from transport_documents" in s:
            return {"drafts": 0, "incoming": 1}
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "union all" in s:
            return [
                {
                    "kind": "declarations",
                    "id": 41,
                    "label": "Déclaration n° 41",
                    "status": "rejetee",
                    "motif": "Tiges sous le DME",
                    "decided_at": None,
                },
                {
                    "kind": "studies",
                    "id": 3,
                    "label": "EIE",
                    "status": "valide",
                    "motif": None,
                    "decided_at": None,
                },
            ]
        if "from document_types" in s:
            return [{"code": "agrement", "label": "Agrément professionnel"}]
        if "from aac_authorizations a" in s and "startup_notified_at is null" in s:
            return [{"id": 4, "authorization_type": "pao", "aac_label": "AAC-1"}]
        if "from certifications" in s:
            return []
        return []

    async def warnings(org_id):
        return [
            {"kind": "document", "doc_type": "agrement", "status": "manquant"},
            {"kind": "tax", "tax_type": "superficie", "period_year": 2026, "amount_fcfa": 1000},
        ]

    async def collect(**_kw):
        return [
            {"type": "below_dme", "org_id": 10, "review_status": "ouverte"},
            {"type": "below_dme", "org_id": 11, "review_status": "ouverte"},
            {"type": "aac_fermee", "org_id": 10, "review_status": "traitee"},
        ]

    async def list_controls(kind=None, result=None, org_id=None):
        return [{"id": 1, "org_id": org_id, "result": "non_conforme"}]

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(compliance, "assess_org_warnings", warnings)
    monkeypatch.setattr(anomalies, "collect", collect)
    monkeypatch.setattr(controls, "list_controls", list_controls)


def test_company_space_orders_actions_and_reports_decisions(client, fake):
    r = client.get("/api/company/space", headers=_auth(COMPANY))
    assert r.status_code == 200, r.text
    d = r.json()
    kinds = [t["kind"] for t in d["todo"]]
    assert kinds[:2] == ["document", "tax"]
    assert {"startup", "to_fell", "to_ship", "slip_incoming"} <= set(kinds)
    assert d["todo"][0]["label"] == "Agrément professionnel : manquant"
    rejected = d["decisions"][0]
    assert rejected["outcome"] == "rejet" and rejected["motif"] == "Tiges sous le DME"
    assert rejected["competent_codes"] == ["DP"]
    assert d["decisions"][1]["outcome"] == "accord"
    assert len(d["anomalies"]) == 1 and d["controls"][0]["org_id"] == 10


def test_company_space_without_organisation_is_empty(client, fake):
    d = client.get("/api/company/space", headers=_auth(ORPHAN)).json()
    assert d == {
        "organization": None,
        "todo": [],
        "decisions": [],
        "anomalies": [],
        "controls": [],
        "cooperatives": [],
    }


def test_company_space_is_company_only(client, fake):
    assert client.get("/api/company/space", headers=_auth(ADMIN)).status_code == 403


def test_space_window_constant():
    assert company_space.DECISION_WINDOW_DAYS >= 90
