"""Transport documents (bordereau de roulage / feuille de route / spécification)."""

import json
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
            "email": "co2@x",
            "display_name": "Co2",
            "role": "company",
            "password_hash": _pw("co2pw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": None,
        },
        6: {
            "id": 6,
            "email": "mill@x",
            "display_name": "Mill",
            "role": "company",
            "password_hash": _pw("millpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": 20,
        },
    }
    registry = {
        "GA-A1": {
            "tree_code": "GA-A1",
            "company_id": 2,
            "status": "abattu",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,
            "hammer_mark": "M-1",
        },
        "GA-A2": {
            "tree_code": "GA-A2",
            "company_id": 2,
            "status": "abattu",
            "species_scientific_name": "Lophira alata",
            "measured_dbh_cm": 90.0,
            "hammer_mark": "M-2",
        },
        "GA-SOFT": {
            "tree_code": "GA-SOFT",
            "company_id": 2,
            "status": "declare",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 75.0,
        },
        "GA-OTHER": {
            "tree_code": "GA-OTHER",
            "company_id": 5,
            "status": "abattu",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,
        },
    }
    state = {
        "transport_seq": 1,
        "documents": {},
        "registry": registry,
        "organizations": {10: {"id": 10, "name": "Bois SA"}, 20: {"id": 20, "name": "Scierie"}},
        "custody": [],
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
        if "insert into transport_documents" in s:
            did = state["transport_seq"]
            state["transport_seq"] += 1
            codes = json.loads(args[5]) if isinstance(args[5], str) else list(args[5])
            doc = {
                "id": did,
                "org_id": args[0],
                "doc_type": args[1],
                "reference": args[2],
                "from_label": args[3],
                "to_label": args[4],
                "tree_codes": codes,
                "volume_m3": args[6],
                "issued_by": args[7],
                "status": "brouillon",
                "qr_payload": args[8],
                "title_id": args[9],
                "aac_id": args[10],
                "transporter": args[11],
                "vehicle_ref": args[12],
                "destination_org_id": args[13],
                "issued_at": None,
                "created_at": "2026-05-10T10:00:00",
            }
            state["documents"][did] = doc
            return {
                k: doc[k]
                for k in ("id", "doc_type", "reference", "status", "volume_m3", "tree_codes")
            }
        if "select * from transport_documents where id" in s:
            doc = state["documents"].get(args[0])
            return dict(doc) if doc else None
        if "update transport_documents set status" in s:
            doc = state["documents"].get(args[1])
            if doc is None:
                return None
            doc["status"] = args[0]
            return {k: doc[k] for k in ("id", "doc_type", "reference", "status", "volume_m3")}
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from tree_registry where tree_code = any" in s:
            codes = args[0] or []
            return [dict(r) for c, r in state["registry"].items() if c in codes]
        if "from transport_documents d" in s:
            rows = list(state["documents"].values())
            if "d.destination_org_id = $1" in s:
                rows = [r for r in rows if args[0] in (r["org_id"], r["destination_org_id"])]
            if "d.status = $" in s:
                rows = [r for r in rows if r["status"] == args[-1]]
            return [dict(r, org_name=None, destination_name=None) for r in rows]
        if "from transport_documents" in s:
            rows = list(state["documents"].values())
            if "status in ('brouillon','emis')" in s:
                rows = [r for r in rows if r["status"] in ("brouillon", "emis")]
            return [dict(r) for r in _apply(rows, s, args)]
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if s.startswith("update tree_registry set status = 'transporte'"):
            for c in args[0]:
                state["registry"][c]["status"] = "transporte"
        elif s.startswith("update tree_registry set status = 'receptionne'"):
            for c in args[0]:
                tree = state["registry"][c]
                if tree["status"] == "transporte":
                    tree["status"] = "receptionne"
                    tree["custodian_org_id"] = args[1]
        elif s.startswith("insert into custody_events"):
            state["custody"].extend((c, args[1], args[3]) for c in args[0])
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
        "doc_type": "bordereau_roulage",
        "tree_codes": ["GA-A1", "GA-A2"],
        "from_label": "AAC-1",
        "to_label": "Port d'Owendo",
        "transporter": "Transport Bois",
        "vehicle_ref": "TR-1234",
    }
    payload.update(overrides)
    return client.post(
        "/api/transport/documents",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )


def test_create_bordereau_computes_volume(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = _create(client, token)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "brouillon"
    assert body["reference"].startswith("BDR-")
    assert body["tree_codes"] == ["GA-A1", "GA-A2"]
    assert body["volume_m3"] > 0


def test_unknown_tree_refused(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = _create(client, token, tree_codes=["GA-A1", "GA-MISSING"])
    assert resp.status_code == 404
    assert resp.json()["detail"]["tree_codes"] == ["GA-MISSING"]


def test_foreign_tree_refused(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = _create(client, token, tree_codes=["GA-OTHER"])
    assert resp.status_code == 403
    assert resp.json()["detail"]["tree_codes"] == ["GA-OTHER"]


def test_unfelled_tree_refused(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = _create(client, token, tree_codes=["GA-SOFT"])
    assert resp.status_code == 409
    assert resp.json()["detail"]["tree_codes"] == ["GA-SOFT"]


def test_stem_cannot_ride_two_open_documents(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    assert _create(client, token).status_code == 201
    second = _create(client, token, tree_codes=["GA-A1"])
    assert second.status_code == 409
    assert second.json()["detail"]["tree_codes"] == ["GA-A1"]


def test_company_without_organization_is_refused(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[5])
    assert _create(client, token).status_code == 409


def test_admin_cannot_create_document(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[1])
    assert _create(client, token).status_code == 403


def test_company_lists_and_admin_sees_all(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    assert _create(client, co).status_code == 201
    mine = client.get("/api/transport/documents", headers={"Authorization": f"Bearer {co}"}).json()
    assert len(mine) == 1
    admin = _token(users[1])
    all_docs = client.get(
        "/api/transport/documents", headers={"Authorization": f"Bearer {admin}"}
    ).json()
    assert len(all_docs) == 1
    filtered = client.get(
        "/api/transport/documents?status=emis", headers={"Authorization": f"Bearer {co}"}
    ).json()
    assert filtered == []


def test_detail_returns_document_and_trees(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    doc_id = _create(client, co).json()["id"]
    resp = client.get(
        f"/api/transport/documents/{doc_id}", headers={"Authorization": f"Bearer {co}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["document"]["id"] == doc_id
    assert {t["tree_code"] for t in body["trees"]} == {"GA-A1", "GA-A2"}


def test_other_company_cannot_access_document(client, monkeypatch):
    users, _state = _setup(monkeypatch)
    co = _token(users[2])
    doc_id = _create(client, co).json()["id"]
    co2 = _token(users[5])
    assert (
        client.get(
            f"/api/transport/documents/{doc_id}", headers={"Authorization": f"Bearer {co2}"}
        ).status_code
        == 403
    )


def test_status_transitions(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    doc_id = _create(client, co).json()["id"]
    # brouillon → receptionne is not allowed.
    bad = client.patch(
        f"/api/transport/documents/{doc_id}",
        json={"status": "receptionne"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert bad.status_code == 409
    issued = client.patch(
        f"/api/transport/documents/{doc_id}",
        json={"status": "emis"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert issued.status_code == 200 and issued.json()["status"] == "emis"
    received = client.patch(
        f"/api/transport/documents/{doc_id}",
        json={"status": "receptionne"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert received.status_code == 200 and received.json()["status"] == "receptionne"
    # Re-issuing a received document is refused.
    assert (
        client.patch(
            f"/api/transport/documents/{doc_id}",
            json={"status": "emis"},
            headers={"Authorization": f"Bearer {co}"},
        ).status_code
        == 409
    )


def test_transport_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    doc_id = _create(client, co).json()["id"]
    resp = client.get(
        f"/api/transport/documents/{doc_id}/pdf", headers={"Authorization": f"Bearer {co}"}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_issue_moves_logs_and_destination_receives(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co, mill = _token(users[2]), _token(users[6])
    created = _create(client, co, destination_org_id=20)
    assert created.status_code == 201, created.text
    doc_id = created.json()["id"]

    def patch(token, status):
        return client.patch(
            f"/api/transport/documents/{doc_id}",
            json={"status": status},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert patch(mill, "emis").status_code == 403
    assert patch(co, "emis").status_code == 200
    assert state["registry"]["GA-A1"]["status"] == "transporte"
    assert ("GA-A1", "transporte", doc_id) in state["custody"]
    incoming = client.get(
        "/api/transport/documents", headers={"Authorization": f"Bearer {mill}"}
    ).json()
    assert [d["direction"] for d in incoming] == ["entrant"]
    assert patch(co, "receptionne").status_code == 403
    assert patch(mill, "receptionne").status_code == 200
    assert state["registry"]["GA-A2"]["status"] == "receptionne"
    assert state["registry"]["GA-A2"]["custodian_org_id"] == 20
    assert ("GA-A2", "receptionne", doc_id) in state["custody"]


def test_destination_must_be_another_known_organization(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    assert _create(client, co, destination_org_id=10).status_code == 400
    assert _create(client, co, destination_org_id=99).status_code == 404
