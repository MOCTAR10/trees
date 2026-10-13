"""Slice 8 — Ministry dashboard rollups."""

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

    registry = [
        {
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 90,
            "status": "transforme",
        },
        {
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80,
            "status": "abattu",
        },
        {
            "species_scientific_name": "Pericopsis elata",
            "measured_dbh_cm": 70,
            "status": "transporte",
        },
        {
            "species_scientific_name": "Entandrophragma",
            "measured_dbh_cm": 60,
            "status": "inventorie",
        },
    ]

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return {k: v for k, v in users[args[0]].items() if k != "password_hash"}
        if "from legal_documents" in s:
            return {"expired": 1, "expiring_soon": 2}
        if "from tax_dues" in s:
            return {
                "dues_total": 4,
                "overdue": 2,
                "settled": 1,
                "overdue_amount_fcfa": 900000,
            }
        if "from tax_receipts" in s:
            return {"receipts": 1, "amount_fcfa": 300000}
        if "from community_agreements" in s:
            return {
                "agreements": 2,
                "active": 1,
                "contribution_fcfa": 4000000,
                "annual_volume_m3": 5000,
                "avg_fdl_rate": 800,
            }
        if "from transport_documents" in s:
            return {"documents": 3, "volume_m3": 250.5}
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from tree_registry" in s:
            return registry
        if "from forest_titles group by status" in s:
            return [
                {"status": "actif", "count": 2, "surface_ha": 10000},
                {"status": "demande", "count": 1, "surface_ha": 0},
            ]
        if "from annual_cut_blocks group by status" in s:
            return [{"status": "ouvert", "count": 3, "possibility_m3": 15000}]
        if "from legal_documents group by status" in s:
            return [{"status": "valide", "count": 5}, {"status": "expire", "count": 1}]
        if "from certifications group by status" in s:
            return [{"status": "actif", "count": 2, "surface_ha": 20000}]
        if "from certifications group by scheme" in s:
            return [
                {"scheme": "FSC", "count": 1, "surface_ha": 10000},
                {"scheme": "PAFC", "count": 1, "surface_ha": 10000},
            ]
        return []

    async def execute(sql, *args):
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)
    return users, {}


@pytest.fixture
def client():
    return TestClient(app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_overview_rollups(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])

    resp = client.get("/api/dashboard", headers=_auth(admin))
    assert resp.status_code == 200
    body = resp.json()

    harvest = body["harvest"]
    assert harvest["stems_felled"] == 3
    assert harvest["estimated_volume_m3"] > 0
    assert harvest["transformation_rate"] == round(1 / 3, 4)
    by_species = {s["species"]: s["stems"] for s in harvest["by_species"]}
    assert by_species == {"Aucoumea klaineana": 2, "Pericopsis elata": 1}

    assert body["titles"]["total"] == 3
    assert body["titles"]["surface_ha"] == 10000
    assert body["aac"]["total"] == 3
    assert body["aac"]["possibility_m3"] == 15000
    assert body["documents"]["total"] == 6
    assert body["documents"]["expired"] == 1
    assert body["documents"]["expiring_soon"] == 2
    assert body["taxes"]["overdue"] == 2
    assert body["taxes"]["overdue_amount_fcfa"] == 900000
    assert body["community"]["active"] == 1
    assert body["community"]["contribution_fcfa"] == 4000000
    assert body["transport"]["volume_m3"] == 250.5
    assert body["certifications"]["total"] == 2
    assert [s["scheme"] for s in body["certifications"]["by_scheme"]] == ["FSC", "PAFC"]


def test_dashboard_requires_admin(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    assert client.get("/api/dashboard", headers=_auth(co)).status_code == 403


def test_dashboard_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.get("/api/dashboard/pdf", headers=_auth(admin))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
