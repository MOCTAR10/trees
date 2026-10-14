"""Slice 24 — legal deadlines, annual statement filing, control PV (DB mocked)."""

import asyncio
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import anomalies, controls, db, deadlines, pdf_report

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
OTHER = {**COMPANY, "id": 3, "email": "other@x", "organization_id": 11}
ORPHAN = {**COMPANY, "id": 4, "email": "orphan@x", "organization_id": None}
ADMIN = {
    **BASE,
    "id": 1,
    "email": "admin@x",
    "display_name": "Admin",
    "role": "admin",
    "company_id": None,
    "organization_id": None,
}
USERS = {u["id"]: u for u in (COMPANY, OTHER, ORPHAN, ADMIN)}


def _auth(user: dict) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 600
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


def test_deadline_arithmetic():
    assert deadlines.statement_due(2025) == date(2026, 3, 31)
    assert deadlines.aac_deadline(datetime(2023, 9, 15, tzinfo=UTC)) == date(2026, 9, 15)
    assert deadlines.aac_deadline(date(2024, 2, 29)) == date(2027, 2, 28)
    assert deadlines.aac_deadline(None) is None


def test_open_aac_past_and_near_the_three_year_limit(monkeypatch):
    today = date(2026, 10, 14)

    async def fetch_all(sql, *args):
        return [
            {
                "id": 1,
                "label": "AAC-A",
                "opened_at": datetime(2023, 9, 1, tzinfo=UTC),
                "org_id": 10,
                "org_name": "SFD",
                "title_id": 5,
                "title_ref": "CFAD-1",
            },
            {
                "id": 2,
                "label": "AAC-B",
                "opened_at": datetime(2023, 12, 1, tzinfo=UTC),
                "org_id": 10,
                "org_name": "SFD",
                "title_id": 5,
                "title_ref": "CFAD-1",
            },
            {
                "id": 3,
                "label": "AAC-C",
                "opened_at": datetime(2025, 6, 1, tzinfo=UTC),
                "org_id": 10,
                "org_name": "SFD",
                "title_id": 5,
                "title_ref": "CFAD-1",
            },
        ]

    monkeypatch.setattr(db, "fetch_all", fetch_all)
    rows = asyncio.run(deadlines.aac_open_too_long(today=today))
    assert [(r["label"], r["overdue"]) for r in rows] == [("AAC-A", True), ("AAC-B", False)]


def test_statement_is_overdue_only_after_31_march(monkeypatch):
    async def fetch_all(sql, *args):
        assert args[0] == 2025
        return [{"org_id": 10, "org_name": "SFD"}]

    monkeypatch.setattr(db, "fetch_all", fetch_all)
    before = asyncio.run(deadlines.statements_missing(today=date(2026, 2, 1)))
    after = asyncio.run(deadlines.statements_missing(today=date(2026, 4, 2)))
    assert before[0]["overdue"] is False and after[0]["overdue"] is True
    assert after[0]["due"] == date(2026, 3, 31)


def test_new_anomaly_families_are_warnings():
    assert anomalies.TYPES["aac_ouverture_depassee"] == anomalies.WARNING
    assert anomalies.TYPES["etat_annuel_non_transmis"] == anomalies.WARNING


@pytest.fixture
def fake(monkeypatch):
    state = {"filings": {}}

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return USERS.get(args[0])
        if "select filed_at from statement_filings" in s:
            return state["filings"].get((args[0], args[1]))
        if "insert into statement_filings" in s:
            row = {
                "id": 1,
                "period_year": args[1],
                "stems_felled": args[2],
                "volume_m3": args[3],
                "reference": args[4],
                "filed_at": datetime.now(UTC),
            }
            state["filings"][(args[0], args[1])] = row
            return row
        return None

    async def fetch_all(sql, *args):
        return []

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    return state


def test_annual_statement_filing(client, fake):
    last = date.today().year - 1

    def file(user, year):
        return client.post(
            "/api/traceability/statements/file", json={"year": year}, headers=_auth(user)
        )

    assert file(COMPANY, date.today().year).status_code == 400
    assert file(ORPHAN, last).status_code == 409
    ok = file(COMPANY, last)
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert body["reference"] == f"EA-{last}-0010"
    assert body["due"] == f"{last + 1}-03-31"
    assert body["late"] == (date.today() > date(last + 1, 3, 31))
    again = file(COMPANY, last)
    assert again.status_code == 409 and "déjà transmis" in again.json()["detail"]


def test_control_pv_for_the_ministry_and_the_controlled_operator(client, fake, monkeypatch):
    control = {
        "id": 7,
        "control_type": "route",
        "result": "non_conforme",
        "tree_code": "GA-9",
        "transport_reference": None,
        "aac_label": "AAC-1",
        "org_id": 10,
        "org_name": "SFD",
        "pv_reference": "PV-12/2026",
        "controlled_at": datetime(2026, 10, 1, 9, 30, tzinfo=UTC),
        "controlled_by_name": "Aline Kombila",
        "controlled_by_matricule": "MEF-BRG-01",
        "latitude": -0.7,
        "longitude": 13.1,
        "notes": "Grume sans bordereau",
        "findings": [{"level": "ko", "label": "En transport sans bordereau"}],
        "acting_authority": "Ministère des Eaux et Forêts",
        "competent_codes": ["DGF"],
        "competent_names": ["Direction Générale des Forêts"],
    }

    async def get_control(control_id):
        return control if control_id == 7 else None

    monkeypatch.setattr(controls, "get_control", get_control)
    r = client.get("/api/controls/7/pdf", headers=_auth(ADMIN))
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert 'filename="PV_PV-12-2026.pdf"' in r.headers["content-disposition"]
    assert client.get("/api/controls/7/pdf", headers=_auth(COMPANY)).status_code == 200
    assert client.get("/api/controls/7/pdf", headers=_auth(OTHER)).status_code == 403
    assert client.get("/api/controls/8/pdf", headers=_auth(ADMIN)).status_code == 404


def test_pv_renders_without_optional_fields():
    pdf = pdf_report.render_control_pdf(
        {
            "id": 1,
            "control_type": "marquage",
            "result": "conforme",
            "controlled_at": (datetime.now(UTC) - timedelta(hours=1)),
        }
    )
    assert pdf.startswith(b"%PDF")
