"""Slice 21 — unified decisions, field controls, traceability warnings (DB mocked)."""

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import compliance, db, decisions, ministry

ADMIN = {
    "id": 1,
    "email": "admin@x",
    "display_name": "Admin",
    "role": "admin",
    "is_active": True,
    "cooperative_id": None,
    "company_id": None,
    "organization_id": None,
    "first_name": None,
    "last_name": None,
    "matricule": None,
}
COMPANY = {**ADMIN, "id": 2, "email": "co@x", "role": "company"}


def _auth(user: dict = ADMIN) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 600
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


TREES = {
    "GA-1": {
        "tree_code": "GA-1",
        "status": "abattu",
        "species_scientific_name": None,
        "measured_dbh_cm": 80,
        "marking_type": "qr",
        "hammer_mark": "HM-1",
        "df10_entry_no": "DF10-1",
        "aac_id": 29,
        "aac_label": "AAC-1",
        "aac_status": "ouvert",
        "org_id": 10,
        "org_name": "SFD",
    },
    "GA-9": {
        "tree_code": "GA-9",
        "status": "transporte",
        "species_scientific_name": None,
        "measured_dbh_cm": 80,
        "marking_type": "qr",
        "hammer_mark": None,
        "df10_entry_no": None,
        "aac_id": 29,
        "aac_label": "AAC-1",
        "aac_status": "ouvert",
        "org_id": 10,
        "org_name": "SFD",
    },
}


class Fake:
    def __init__(self):
        self.inserted = []
        self.permit = None
        self.missing_df10 = 0
        self.user = ADMIN

    async def fetch_one(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return self.user
        if "from tree_registry r" in s:
            return TREES.get(args[0])
        if "from transport_documents where tree_codes" in s:
            return None
        if "from transport_documents where reference" in s:
            if args[0] != "BRD-1":
                return None
            return {
                "id": 15,
                "doc_type": "bordereau_roulage",
                "status": "emis",
                "reference": args[0],
                "tree_codes": '["GA-1"]',
                "issued_at": None,
                "org_id": 10,
                "aac_id": 29,
                "from_label": None,
                "to_label": None,
                "volume_m3": 4,
            }
        if "insert into field_controls" in s:
            self.inserted.append(args)
            return {
                "id": 1,
                "control_type": args[0],
                "result": args[1],
                "tree_code": args[2],
                "aac_id": args[4],
                "org_id": args[5],
                "controlled_at": "now",
            }
        if "from legal_documents where scope_id" in s:
            return self.permit
        if "count(*) as n from tree_registry" in s:
            return {"n": self.missing_df10}
        return None

    async def fetch_all(self, sql, *args):
        return []

    async def execute(self, sql, *args):
        return "OK"


@pytest.fixture
def fake(monkeypatch):
    f = Fake()
    monkeypatch.setattr(db, "fetch_one", f.fetch_one)
    monkeypatch.setattr(db, "fetch_all", f.fetch_all)
    monkeypatch.setattr(db, "execute", f.execute)

    async def gate(aac_id, org_id):
        return None

    monkeypatch.setattr(compliance, "authorization_gate", gate)
    return f


def test_lookup_tree_flags_transport_without_slip_and_missing_df10(client, fake):
    ok = client.get("/api/controls/lookup?code=GA-1", headers=_auth()).json()
    assert ok["kind"] == "tree" and all(c["level"] == "ok" for c in ok["checks"])
    bad = client.get("/api/controls/lookup?code=GA-9", headers=_auth()).json()
    levels = {c["label"]: c["level"] for c in bad["checks"]}
    assert levels["Abattu sans inscription au carnet DF10"] == "ko"
    assert levels["En transport sans bordereau / feuille de route"] == "ko"
    assert levels["Empreinte du marteau non saisie"] == "warn"


def test_lookup_slip_and_unknown(client, fake):
    slip = client.get("/api/controls/lookup?code=BRD-1", headers=_auth()).json()
    assert slip["kind"] == "transport" and slip["transport"]["tree_codes"] == ["GA-1"]
    unknown = client.get("/api/controls/lookup?code=NOPE", headers=_auth()).json()
    assert unknown["kind"] == "unknown" and unknown["checks"][0]["level"] == "ko"


def test_record_control_requires_findings_and_subject(client, fake):
    def post(body):
        return client.post("/api/controls", json=body, headers=_auth())

    assert (
        post({"control_type": "route", "result": "non_conforme", "tree_code": "GA-9"}).status_code
        == 400
    )
    assert post({"control_type": "marquage", "result": "conforme"}).status_code == 422
    assert post({"control_type": "visa_df10", "result": "conforme"}).status_code == 422
    assert post({"control_type": "transformation", "result": "conforme"}).status_code == 422
    assert (
        post({"control_type": "marquage", "result": "conforme", "tree_code": "XX"}).status_code
        == 404
    )
    ok = post(
        {
            "control_type": "route",
            "result": "non_conforme",
            "tree_code": "GA-9",
            "notes": "Sans bordereau",
            "latitude": -0.5,
            "longitude": 11.2,
        }
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["aac_id"] == 29 and ok.json()["org_id"] == 10


def test_controls_are_ministry_only(client, fake):
    fake.user = COMPANY
    assert client.get("/api/controls/lookup?code=GA-1", headers=_auth(COMPANY)).status_code == 403


def test_traceability_warnings_cites_permit_and_df10(fake):
    lines = [
        {"tree_code": "GA-5", "violations": '["cites_listed"]'},
        {"tree_code": "GA-6", "violations": []},
    ]
    warnings = asyncio.run(compliance.assess_traceability_warnings(10, 29, lines))
    assert {"kind": "cites_without_permit", "tree_code": "GA-5"} in warnings
    fake.permit = {"id": 3}
    fake.missing_df10 = 2
    warnings = asyncio.run(compliance.assess_traceability_warnings(10, 29, lines))
    assert [w["kind"] for w in warnings] == ["logbook_not_kept"]


def test_decision_detail_and_reason_required(client, fake, monkeypatch):
    async def inbox_items(kind=None, province=None):
        return [
            {
                "id": 7,
                "type": "eudr",
                "label": "Diligence n° 7",
                "org_name": "SFD",
                "created_at": None,
                "authority": "DGF",
                "province_code": "GA-6",
                "province_name": "Ogooué-Ivindo",
            }
        ]

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return ADMIN
        if "from eudr_diligence where id" in s:
            return {
                "parcel_label": "P1",
                "felled_stem_count": 10,
                "geolocated_stem_count": 6,
                "outside_parcel_stem_count": 1,
                "declared_volume_m3": 120,
                "parcel_geom": "x",
            }
        return None

    monkeypatch.setattr(ministry, "inbox_items", inbox_items)
    monkeypatch.setattr(db, "fetch_one", fetch_one)
    d = client.get("/api/admin/inbox/eudr/7", headers=_auth()).json()
    assert d["approve_label"] == "Valider" and d["province_name"] == "Ogooué-Ivindo"
    assert [c["level"] for c in d["checks"]] == ["ok", "warn", "warn"] and d["blocking"] is False
    assert client.get("/api/admin/inbox/eudr/8", headers=_auth()).status_code == 404
    assert client.get("/api/admin/inbox/nope/7", headers=_auth()).status_code == 404
    r = client.post("/api/admin/inbox/eudr/7/decision", json={"approve": False}, headers=_auth())
    assert r.status_code == 400


def test_decide_dispatches_to_the_domain_rules(monkeypatch):
    calls = []

    async def inbox_items(kind=None, province=None):
        return [{"id": 41, "type": kind}]

    from app.api import felling

    async def fake_decide(declaration_id, body, user):
        calls.append((declaration_id, body.decision, body.motif, user["id"]))
        return {"id": declaration_id, "status": body.decision}

    monkeypatch.setattr(ministry, "inbox_items", inbox_items)
    monkeypatch.setattr(felling, "decide", fake_decide)
    out = asyncio.run(decisions.decide("declarations", 41, False, " Hors AAC ", ADMIN))
    assert out == {"id": 41, "status": "rejetee"}
    assert calls == [(41, "rejetee", "Hors AAC", 1)]
    with pytest.raises(HTTPException):
        asyncio.run(decisions.decide("declarations", 41, False, "  ", ADMIN))


def test_controle_non_conforme_is_a_hard_anomaly():
    from app.services import anomalies

    assert anomalies.TYPES["controle_non_conforme"] == anomalies.HARD
