"""Slice 22 — chain of custody of a log (DB mocked)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import custody, db

BASE = {
    "is_active": True,
    "cooperative_id": None,
    "first_name": None,
    "last_name": None,
    "matricule": None,
}
USERS = {
    2: {
        **BASE,
        "id": 2,
        "email": "co@x",
        "display_name": "Co",
        "role": "company",
        "company_id": None,
        "organization_id": 10,
    },
    4: {
        **BASE,
        "id": 4,
        "email": "agent@x",
        "display_name": "Agent",
        "role": "operator",
        "company_id": 2,
        "organization_id": None,
    },
    6: {
        **BASE,
        "id": 6,
        "email": "mill@x",
        "display_name": "Mill",
        "role": "company",
        "company_id": None,
        "organization_id": 20,
    },
}


def _auth(uid: int) -> dict:
    u = USERS[uid]
    token = security.create_access_token(u["email"], u["role"], uid, get_settings().jwt_secret, 600)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def state(monkeypatch):
    st = {
        "trees": {
            "GA-1": {
                "tree_code": "GA-1",
                "status": "autorise",
                "company_id": 2,
                "custodian_org_id": 10,
            },
            "GA-2": {
                "tree_code": "GA-2",
                "status": "receptionne",
                "company_id": 2,
                "custodian_org_id": 20,
            },
        },
        "events": [],
    }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return USERS.get(args[0])
        if "select * from tree_registry where tree_code" in s:
            tree = st["trees"].get(args[0])
            return dict(tree) if tree else None
        if "from tree_registry r" in s:
            tree = st["trees"].get(args[0])
            return dict(tree, custodian_name=None) if tree else None
        if "insert into custody_events" in s:
            st["events"].append((args[0], args[1]))
            return {
                "id": len(st["events"]),
                "tree_code": args[0],
                "event": args[1],
                "created_at": "now",
            }
        return None

    async def fetch_all(sql, *args):
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if s.startswith("update tree_registry set status=$1"):
            st["trees"][args[1]]["status"] = args[0]
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)
    return st


@pytest.fixture
def client():
    return TestClient(app)


def test_refusal_messages_cite_the_right_rule():
    assert "art. 14" in custody.refusal("abattu", "declare")
    assert "Déclaré" in custody.refusal("abattu", "declare")
    assert custody.refusal("abattu", "autorise") is None
    assert "bordereau" in custody.refusal("transporte", "abattu")
    assert "destinataire" in custody.refusal("receptionne", "transporte")
    assert "réceptionnée" in custody.refusal("transforme", "transporte")
    assert custody.refusal("transforme", "receptionne") is None


def test_holder_is_the_custodian_organisation_then_legacy_owner():
    assert custody.holds({"organization_id": 10, "role": "operator"}, {"custodian_org_id": 10})
    assert not custody.holds(
        {"organization_id": 11, "role": "company", "id": 2},
        {"custodian_org_id": 10, "company_id": 2},
    )
    assert custody.holds(
        {"organization_id": None, "role": "company", "id": 2},
        {"custodian_org_id": None, "company_id": 2},
    )


def test_agent_records_felling_then_transport_is_routed_to_the_slip(client, state):
    r = client.post(
        "/api/felling/events", json={"tree_code": "GA-1", "event": "abattu"}, headers=_auth(4)
    )
    assert r.status_code == 200, r.text
    assert state["trees"]["GA-1"]["status"] == "abattu"
    r = client.post(
        "/api/felling/events", json={"tree_code": "GA-1", "event": "transporte"}, headers=_auth(4)
    )
    assert r.status_code == 409 and "bordereau" in r.json()["detail"]
    r = client.post(
        "/api/felling/events", json={"tree_code": "GA-1", "event": "transforme"}, headers=_auth(2)
    )
    assert r.status_code == 409 and "réceptionnée" in r.json()["detail"]


def test_only_the_receiving_mill_processes_the_log(client, state):
    assert (
        client.post(
            "/api/felling/events",
            json={"tree_code": "GA-2", "event": "transforme"},
            headers=_auth(2),
        ).status_code
        == 403
    )
    r = client.post(
        "/api/felling/events", json={"tree_code": "GA-2", "event": "transforme"}, headers=_auth(6)
    )
    assert r.status_code == 200 and state["trees"]["GA-2"]["status"] == "transforme"


def test_lookup_gives_next_action_to_the_holder_only(client, state):
    mine = client.get("/api/felling/trees/GA-1", headers=_auth(4)).json()
    assert mine["is_holder"] and mine["next_event"] == "abattu"
    assert mine["status_label"] == "Autorisé"
    assert client.get("/api/felling/trees/GA-1", headers=_auth(6)).status_code == 403
    assert client.get("/api/felling/trees/NOPE", headers=_auth(4)).status_code == 404
    mill = client.get("/api/felling/trees/GA-2", headers=_auth(6)).json()
    assert mill["next_event"] == "transforme"
