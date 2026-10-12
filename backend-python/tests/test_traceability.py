"""Traceability: DF10 carnet de chantier register + regulatory statements."""

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
        4: {
            "id": 4,
            "email": "field@x",
            "display_name": "Field",
            "role": "operator",
            "password_hash": _pw("fieldpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": 2,
            "organization_id": None,
        },
        5: {
            "id": 5,
            "email": "co5@x",
            "display_name": "Co5",
            "role": "company",
            "password_hash": _pw("co5pw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": None,
        },
    }
    registry = {
        "GA-1": {
            "tree_code": "GA-1",
            "company_id": 2,
            "status": "abattu",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,
            "marking_type": "qr",
            "hammer_mark": "M-1",
            "felled_at": "2026-03-15",
            "df10_entry_no": "DF10-2026-000001",
            "abandon_code": None,
            "df10_notes": None,
            "permit_number": "P-1",
            "aac_label": "AAC-1",
            "title_id": 30,
            "aac_id": 40,
        },
        "GA-2": {
            "tree_code": "GA-2",
            "company_id": 2,
            "status": "transforme",
            "species_scientific_name": "Lophira alata",
            "measured_dbh_cm": 90.0,
            "marking_type": "peinture",
            "hammer_mark": "M-2",
            "felled_at": "2026-04-02",
            "df10_entry_no": "DF10-2026-000002",
            "abandon_code": None,
            "title_id": 30,
            "aac_id": 40,
        },
        "GA-3": {
            "tree_code": "GA-3",
            "company_id": 2,
            "status": "declare",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 72.0,
            "marking_type": "gps_photo",
            "felled_at": None,
            "df10_entry_no": None,
            "abandon_code": None,
            "title_id": 30,
            "aac_id": 40,
        },
        "GA-4": {
            "tree_code": "GA-4",
            "company_id": 2,
            "status": "autorise",
            "species_scientific_name": "Entandrophragma cylindricum",
            "measured_dbh_cm": 95.0,
            "marking_type": "peinture",
            "felled_at": None,
            "df10_entry_no": None,
            "abandon_code": "creux",
            "df10_notes": "cœur pourri",
            "title_id": 30,
            "aac_id": 40,
        },
        "GA-OLD": {
            "tree_code": "GA-OLD",
            "company_id": 2,
            "status": "abattu",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,
            "marking_type": "qr",
            "felled_at": "2025-11-01",
            "df10_entry_no": "DF10-2025-000009",
            "abandon_code": None,
            "title_id": 30,
            "aac_id": 40,
        },
        "GA-OTHER": {
            "tree_code": "GA-OTHER",
            "company_id": 5,
            "status": "abattu",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,
            "marking_type": "qr",
            "felled_at": "2026-03-01",
            "df10_entry_no": "DF10-2026-000900",
            "abandon_code": None,
            "title_id": 31,
            "aac_id": 41,
        },
    }
    state = {
        "registry": registry,
        "organizations": {10: {"id": 10, "name": "Bois SA"}},
        "transport_documents": {
            1: {"id": 1, "org_id": 10, "volume_m3": 12.5, "created_at": "2026-05-10T10:00:00"},
        },
    }

    def _filters(s):
        return re.findall(r"(\w+) = \$(\d+)", s)

    def _apply(rows, s, args):
        for col, idx in _filters(s):
            value = args[int(idx) - 1]
            rows = [r for r in rows if r.get(col) == value]
        return rows

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            user = users.get(args[0])
            return {k: v for k, v in user.items() if k != "password_hash"} if user else None
        if "from organizations where id" in s:
            return (
                dict(state["organizations"].get(args[0]))
                if args[0] in state["organizations"]
                else None
            )
        if "select tree_code, company_id, status from tree_registry where tree_code" in s:
            row = state["registry"].get(args[0])
            return dict(row) if row else None
        if "update tree_registry set abandon_code" in s:
            row = state["registry"].get(args[2])
            if row is None:
                return None
            row["abandon_code"] = args[0]
            row["df10_notes"] = args[1]
            return {
                "tree_code": row["tree_code"],
                "abandon_code": row["abandon_code"],
                "df10_notes": row["df10_notes"],
                "status": row["status"],
            }
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from tree_registry" in s:
            rows = list(state["registry"].values())
            if "where 1 = 1" not in s:  # DF10: only scope by the caller
                rows = [r for r in rows if r.get("company_id") is not None]
            return [dict(r) for r in _apply(rows, s, args)]
        if "from transport_documents" in s:
            rows = list(state["transport_documents"].values())
            return [dict(r) for r in _apply(rows, s, args)]
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


def test_company_df10_is_scoped_and_labelled(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get("/api/traceability/df10", headers={"Authorization": f"Bearer {co}"})
    assert resp.status_code == 200
    rows = resp.json()
    codes = {r["tree_code"] for r in rows}
    assert "GA-OTHER" not in codes
    assert "GA-4" in codes
    ga4 = next(r for r in rows if r["tree_code"] == "GA-4")
    assert ga4["abandon_label"] == "Creux / cœur pourri"


def test_admin_df10_sees_all(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    rows = client.get("/api/traceability/df10", headers={"Authorization": f"Bearer {admin}"}).json()
    assert "GA-OTHER" in {r["tree_code"] for r in rows}


def test_operator_df10_scoped_to_their_company(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    op = _token(users[4])
    rows = client.get("/api/traceability/df10", headers={"Authorization": f"Bearer {op}"}).json()
    assert "GA-OTHER" not in {r["tree_code"] for r in rows}


def test_df10_status_filter(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    rows = client.get(
        "/api/traceability/df10?status=abattu", headers={"Authorization": f"Bearer {co}"}
    ).json()
    assert {r["tree_code"] for r in rows} == {"GA-1", "GA-OLD"}


def test_set_abandon_code(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.patch(
        "/api/traceability/df10/GA-3",
        json={"abandon_code": "penche", "notes": "vent"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 200
    assert resp.json()["abandon_code"] == "penche"
    assert resp.json()["abandon_label"] == "Arbre penché / risque de chute"
    assert state["registry"]["GA-3"]["abandon_code"] == "penche"


def test_set_abandon_code_rejects_unknown_code(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.patch(
        "/api/traceability/df10/GA-3",
        json={"abandon_code": "fantaisiste"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 400


def test_set_abandon_code_refuses_felled_tree(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.patch(
        "/api/traceability/df10/GA-1",
        json={"abandon_code": "creux"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 409


def test_set_abandon_code_unknown_tree(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.patch(
        "/api/traceability/df10/GA-MISSING",
        json={"abandon_code": "creux"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 404


def test_set_abandon_code_foreign_tree(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.patch(
        "/api/traceability/df10/GA-OTHER",
        json={"abandon_code": "creux"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 403


def test_admin_cannot_set_abandon_code(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.patch(
        "/api/traceability/df10/GA-3",
        json={"abandon_code": "creux"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert resp.status_code == 403


def test_annual_statement(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get(
        "/api/traceability/statements?year=2026", headers={"Authorization": f"Bearer {co}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["period"] == {"year": 2026, "quarter": None}
    assert body["totals"]["stems_felled"] == 2
    assert body["totals"]["estimated_volume_m3"] > 0
    assert body["transformation_rate"] == 0.5
    species = {s["species"] for s in body["by_species"]}
    assert species == {"Aucoumea klaineana", "Lophira alata"}
    assert body["abandoned"] == [{"code": "creux", "label": "Creux / cœur pourri", "count": 1}]
    assert body["transport"]["documents"] == 1
    assert body["transport"]["volume_m3"] == 12.5


def test_quarterly_statement_excludes_other_quarters(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    body = client.get(
        "/api/traceability/statements?year=2026&quarter=1",
        headers={"Authorization": f"Bearer {co}"},
    ).json()
    assert body["totals"]["stems_felled"] == 1  # only GA-1 (March)
    assert body["transformation_rate"] == 0.0
    assert body["transport"]["documents"] == 0  # transport document is in Q2


def test_statement_requires_explicit_year(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    assert (
        client.get(
            "/api/traceability/statements", headers={"Authorization": f"Bearer {co}"}
        ).status_code
        == 422
    )


def test_df10_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get("/api/traceability/df10/pdf", headers={"Authorization": f"Bearer {co}"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_statement_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get(
        "/api/traceability/statements/pdf?year=2026&quarter=1",
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"
