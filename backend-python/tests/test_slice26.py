"""Slice 26 — transformation register, control follow-ups (DB mocked)."""

import asyncio
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import controls, db, decisions, mill

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
MILL = {**ADMIN, "id": 2, "email": "mill@x", "role": "company", "organization_id": 20}
OTHER = {**ADMIN, "id": 3, "email": "other@x", "role": "company", "organization_id": 30}
USERS = {u["id"]: u for u in (ADMIN, MILL, OTHER)}


def _auth(user: dict) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 600
    )
    return {"Authorization": f"Bearer {token}"}


class Fake:
    def __init__(self):
        self.trees = {
            "L-1": {"tree_code": "L-1", "status": "receptionne", "custodian_org_id": 20},
            "L-2": {"tree_code": "L-2", "status": "transforme", "custodian_org_id": 20},
            "L-3": {"tree_code": "L-3", "status": "transporte", "custodian_org_id": 20},
            "L-9": {"tree_code": "L-9", "status": "receptionne", "custodian_org_id": 30},
        }
        self.executed: list[tuple[str, tuple]] = []
        self.controls = {
            5: {"id": 5, "result": "non_conforme", "org_id": 20},
            6: {"id": 6, "result": "conforme", "org_id": 20},
        }
        self.followups: dict[int, dict] = {}
        self.inputs_m3 = 10.0
        self.outputs_m3 = 3.0

    def _followup_row(self, fid):
        f = self.followups[fid]
        return {
            **f,
            "org_id": self.controls[f["control_id"]]["org_id"],
            "pv_reference": "PV-5",
            "control_type": "route",
            "org_name": "Scierie",
        }

    async def fetch_one(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return USERS.get(args[0])
        if "insert into mill_outputs" in s:
            return {
                "id": 1,
                "org_id": args[0],
                "produced_on": args[1] or date.today(),
                "product_type": args[2],
                "species_scientific_name": args[3],
                "volume_m3": args[4],
                "tree_codes": args[5],
                "lot_reference": args[6],
                "destination": args[7],
                "notes": args[8],
                "created_at": "now",
            }
        if "from field_controls where id" in s:
            return self.controls.get(args[0])
        if "insert into control_followups" in s:
            fid = len(self.followups) + 1
            self.followups[fid] = {
                "id": fid,
                "control_id": args[0],
                "action_type": args[1],
                "amount_fcfa": args[2],
                "reference": args[3],
                "due_at": args[4],
                "notes": args[5],
                "status": "notifie",
                "reply": None,
                "replied_at": None,
                "decision_motif": None,
                "close_motif": None,
                "closed_at": None,
                "created_at": date.today(),
            }
            return {"id": fid}
        if "from control_followups f" in s and "where f.id" in s:
            return self._followup_row(args[0]) if args[0] in self.followups else None
        return None

    async def fetch_all(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from tree_registry where tree_code = any" in s:
            return [self.trees[c] for c in args[0] if c in self.trees]
        if "from mill_outputs where" in s and "sum(volume_m3)" in s:
            return [
                {
                    "org_id": 20,
                    "org_name": "Scierie",
                    "output_m3": self.outputs_m3,
                    "input_m3": self.inputs_m3,
                    "last_at": date.today(),
                }
            ]
        if "from control_followups f" in s:
            rows = [self._followup_row(fid) for fid in self.followups]
            if "f.status in ('notifie', 'conteste')" in s:
                rows = [r for r in rows if r["status"] in ("notifie", "conteste")]
                if args and args[0] is not None:
                    rows = [r for r in rows if r["org_id"] == args[0]]
            return rows
        return []

    async def execute(self, sql, *args):
        s = " ".join(sql.split()).lower()
        self.executed.append((s, args))
        if s.startswith("update control_followups set status = 'conteste'"):
            self.followups[args[1]].update(status="conteste", reply=args[0])
        elif s.startswith("update control_followups set status = 'notifie'"):
            self.followups[args[2]].update(status="notifie", decision_motif=args[0])
        elif s.startswith("update control_followups set status"):
            self.followups[args[3]].update(status=args[0], close_motif=args[1])
        return "OK"


@pytest.fixture
def fake(monkeypatch):
    f = Fake()
    monkeypatch.setattr(db, "fetch_one", f.fetch_one)
    monkeypatch.setattr(db, "fetch_all", f.fetch_all)
    monkeypatch.setattr(db, "execute", f.execute)
    return f


@pytest.fixture
def client():
    return TestClient(app)


def _lot(codes, **extra):
    return {"product_type": "sciage", "volume_m3": 4.2, "tree_codes": codes, **extra}


def test_lot_transforms_its_received_logs(fake):
    out = asyncio.run(mill.record_output(_lot(["L-1", "L-2", " L-1 "]), MILL, 20))
    assert out["tree_codes"] == ["L-1", "L-2"]
    assert out["transformed"] == ["L-1"]
    events = [a for s, a in fake.executed if s.startswith("insert into custody_events")]
    assert len(events) == 1 and events[0][0] == "L-1" and "Sciages" in events[0][2]


@pytest.mark.parametrize(
    ("codes", "status"),
    [([], 422), (["NOPE"], 404), (["L-9"], 403), (["L-3"], 409)],
)
def test_lot_rules(fake, codes, status):
    with pytest.raises(HTTPException) as err:
        asyncio.run(mill.record_output(_lot(codes), MILL, 20))
    assert err.value.status_code == status


def test_yield_alert_when_outputs_exceed_inputs(fake):
    assert asyncio.run(mill.yield_alerts()) == []
    fake.outputs_m3 = 9.0
    alerts = asyncio.run(mill.yield_alerts())
    assert alerts[0]["yield_pct"] == 90.0 and alerts[0]["alert"]
    fake.inputs_m3 = 0
    fake.outputs_m3 = 1.0
    assert asyncio.run(mill.yield_alerts())[0]["yield_pct"] is None


def test_mill_endpoints_roles(client, fake):
    assert client.get("/api/mill/register", headers=_auth(ADMIN)).status_code == 422
    assert client.get("/api/mill/alerts", headers=_auth(MILL)).status_code == 403
    resp = client.post("/api/mill/outputs", json=_lot(["L-1"]), headers=_auth(ADMIN))
    assert resp.status_code == 403
    resp = client.post("/api/mill/outputs", json=_lot(["L-1"]), headers=_auth(MILL))
    assert resp.status_code == 201, resp.text


def test_followup_rules(fake):
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.add_followup(6, {"action_type": "amende", "amount_fcfa": 10}, ADMIN))
    assert err.value.status_code == 409
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.add_followup(5, {"action_type": "amende"}, ADMIN))
    assert err.value.status_code == 422
    notice = asyncio.run(
        controls.add_followup(5, {"action_type": "mise_en_demeure", "amount_fcfa": 99}, ADMIN)
    )
    assert notice["amount_fcfa"] is None and notice["label"] == "Mise en demeure"
    assert notice["competent_codes"]


def test_followup_overdue_is_derived(fake):
    past = date.today() - timedelta(days=3)
    asyncio.run(
        controls.add_followup(
            5, {"action_type": "amende", "amount_fcfa": 500000, "due_at": past}, ADMIN
        )
    )
    [open_one] = asyncio.run(controls.open_followups(20))
    assert open_one["display_status"] == "en_retard"
    assert open_one["status_label"] == "En retard"
    assert asyncio.run(controls.open_followups(30)) == []


def test_contest_then_maintain_then_execute(fake):
    f = asyncio.run(controls.add_followup(5, {"action_type": "saisie"}, ADMIN))
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.contest_followup(f["id"], "non", OTHER))
    assert err.value.status_code == 403
    asyncio.run(controls.contest_followup(f["id"], "Bordereau présenté", MILL))
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.set_followup_status(f["id"], "execute", None, ADMIN))
    assert err.value.status_code == 409
    items = asyncio.run(decisions._followup(f["id"]))
    assert ("Contestation", "Bordereau présenté") in [(x["label"], x["value"]) for x in items[0]]
    with pytest.raises(HTTPException):
        asyncio.run(controls.set_followup_status(f["id"], "notifie", None, ADMIN))
    kept = asyncio.run(controls.set_followup_status(f["id"], "notifie", "Maintenue", ADMIN))
    assert kept["status"] == "notifie" and kept["decision_motif"] == "Maintenue"
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.contest_followup(f["id"], "encore", MILL))
    assert err.value.status_code == 409
    done = asyncio.run(controls.set_followup_status(f["id"], "execute", None, ADMIN))
    assert done["status"] == "execute"
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.set_followup_status(f["id"], "annule", "x", ADMIN))
    assert err.value.status_code == 409


def test_cancel_needs_a_motif(fake):
    f = asyncio.run(controls.add_followup(5, {"action_type": "suspension"}, ADMIN))
    with pytest.raises(HTTPException) as err:
        asyncio.run(controls.set_followup_status(f["id"], "annule", " ", ADMIN))
    assert err.value.status_code == 400


def test_followup_endpoints_roles(client, fake):
    body = {"action_type": "amende", "amount_fcfa": 1000}
    assert (
        client.post("/api/controls/5/followups", json=body, headers=_auth(MILL)).status_code == 403
    )
    created = client.post("/api/controls/5/followups", json=body, headers=_auth(ADMIN))
    assert created.status_code == 201, created.text
    fid = created.json()["id"]
    mine = client.get("/api/controls/followups", headers=_auth(MILL)).json()
    assert [f["id"] for f in mine] == [fid]
    assert client.get("/api/controls/followups", headers=_auth(OTHER)).json() == []
    reply = {"reply": "Contestation"}
    resp = client.post(f"/api/controls/followups/{fid}/contest", json=reply, headers=_auth(ADMIN))
    assert resp.status_code == 403
    resp = client.post(f"/api/controls/followups/{fid}/contest", json=reply, headers=_auth(MILL))
    assert resp.status_code == 200
    resp = client.post(
        f"/api/controls/followups/{fid}/status", json={"status": "annule"}, headers=_auth(MILL)
    )
    assert resp.status_code == 403
