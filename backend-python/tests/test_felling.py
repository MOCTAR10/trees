"""Abattage lifecycle tests (DB service mocked in-memory)."""

import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.core.dme import dme_for
from app.core.reserved_species import is_reserved_species, reserved_species_for
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
        },
    }
    for u in users.values():
        u["organization_id"] = None
    state = {
        "decl_seq": 1,
        "line_seq": 1,
        "event_seq": 1,
        "declarations": {},
        "lines": [],
        "registry": {
            "GA-OTHER": {
                "tree_code": "GA-OTHER",
                "marking_type": "qr",
                "species_scientific_name": "Aucoumea klaineana",
                "measured_dbh_cm": 80.0,
                "company_id": 5,
                "status": "autorise",
                "permit_number": "P-9",
                "aac_label": "AAC-1",
            },
        },
        "events": [],
        "outside_aac": [],
        "aac_ufa": {},
        "aac_status": {},
        "ufa_dme": [],
        "authorizations": {
            11: [{"status": "delivre", "valid_to": None, "startup_notified_at": "2026-01-10"}],
            7: [{"status": "delivre", "valid_to": None, "startup_notified_at": "2026-01-10"}],
        },
        "aac_holder": {11: None, 7: None},
    }
    return users, state


def _install_fake_db(monkeypatch, users, state):
    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from gfw_features where layer = 'logging_concessions'" in s:
            return {"n": state.get("concessions_loaded", 0)}
        if "from users where id" in s:
            user = users.get(args[0])
            if user is None or not user["is_active"]:
                return None
            return {k: v for k, v in user.items() if k != "password_hash"}
        if "insert into felling_declarations" in s:
            did = state["decl_seq"]
            state["decl_seq"] += 1
            state["declarations"][did] = {
                "id": did,
                "company_id": args[0],
                "permit_type": args[1],
                "permit_number": args[2],
                "ufa_label": args[3],
                "aac_label": args[4],
                "campaign_year": args[5],
                "title_id": args[6],
                "aac_id": args[7],
                "status": "soumise",
                "decision_motif": None,
                "decided_by": None,
            }
            return {"id": did, "status": "soumise"}
        if "select tree_code, status, company_id from tree_registry where tree_code" in s:
            row = state["registry"].get(args[0])
            return dict(row) if row else None
        if "select * from felling_declarations where id" in s:
            row = state["declarations"].get(args[0])
            return dict(row) if row else None
        if "update felling_declarations set status" in s:
            row = state["declarations"].get(args[3])
            if row is None:
                return None
            row.update({"status": args[0], "decision_motif": args[1], "decided_by": args[2]})
            return {"id": row["id"], "status": row["status"]}
        if "select * from tree_registry where tree_code" in s:
            row = state["registry"].get(args[0])
            return dict(row) if row else None
        if "insert into custody_events" in s:
            eid = state["event_seq"]
            state["event_seq"] += 1
            event = {
                "id": eid,
                "tree_code": args[0],
                "event": args[1],
                "actor_id": args[2],
                "created_at": "now",
            }
            state["events"].append(event)
            return dict(event)
        if "select ufa_id from annual_cut_blocks" in s:
            ufa_id = state["aac_ufa"].get(args[0])
            return {"ufa_id": ufa_id} if ufa_id is not None else None
        if "select status from annual_cut_blocks" in s:
            return {"status": state["aac_status"].get(args[0])}
        if "select t.holder_org_id" in s:
            if args[0] not in state["aac_holder"]:
                return None
            return {"holder_org_id": state["aac_holder"][args[0]]}
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from ufa_dme" in s:
            return [dict(r) for r in state["ufa_dme"] if r["ufa_id"] == args[0]]
        if "from aac_authorizations where aac_id" in s:
            return [dict(r) for r in state["authorizations"].get(args[0], [])]
        if "lateral" in s and "protected_areas" in s:
            ctx = state.get("spatial", {})
            return [
                {
                    "tree_code": code,
                    "protected_area": ctx.get(code, {}).get("protected_area"),
                    "in_concession": ctx.get(code, {}).get("in_concession", True),
                    "in_title": False,
                    "in_aac": False,
                }
                for code in args[0]
            ]
        if "from annual_cut_blocks" in s and "unnest" in s:
            return [{"tree_code": code} for code in state.get("outside_aac", [])]
        if "from felling_declarations d" in s:
            rows = list(state["declarations"].values())
            for a in args:
                if isinstance(a, int):
                    rows = [r for r in rows if r["company_id"] == a]
                elif isinstance(a, str):
                    rows = [r for r in rows if r["status"] == a]
            return [
                dict(
                    r, line_count=sum(1 for ln in state["lines"] if ln["declaration_id"] == r["id"])
                )
                for r in rows
            ]
        if "from declaration_lines where declaration_id" in s:
            return [dict(ln) for ln in state["lines"] if ln["declaration_id"] == args[0]]
        if "from tree_registry" in s:
            rows = list(state["registry"].values())
            for a in args:
                if isinstance(a, int):
                    rows = [r for r in rows if r.get("company_id") == a]
                elif isinstance(a, str):
                    rows = [r for r in rows if r.get("status") == a]
            return [dict(r) for r in rows]
        if "violations @>" in s:
            out = []
            for ln in state["lines"]:
                decl = state["declarations"].get(ln["declaration_id"])
                if (
                    decl
                    and decl["status"] == "autorisee"
                    and "below_dme"
                    in (
                        ln["violations"]
                        if isinstance(ln["violations"], list)
                        else json.loads(ln["violations"])
                    )
                ):
                    out.append(
                        dict(ln, permit_number=decl["permit_number"], company_id=decl["company_id"])
                    )
            return out
        if "c.event = 'abattu'" in s:
            authorized = {
                ln["tree_code"]
                for ln in state["lines"]
                if (state["declarations"].get(ln["declaration_id"]) or {}).get("status")
                == "autorisee"
            }
            return [
                dict(e)
                for e in state["events"]
                if e["event"] == "abattu" and e["tree_code"] not in authorized
            ]
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if "insert into declaration_lines" in s:
            lid = state["line_seq"]
            state["line_seq"] += 1
            state["lines"].append(
                {
                    "id": lid,
                    "declaration_id": args[0],
                    "tree_code": args[1],
                    "marking_type": args[2],
                    "species_scientific_name": args[3],
                    "measured_dbh_cm": args[4],
                    "latitude": args[5],
                    "longitude": args[6],
                    "dme_cm": args[7],
                    "violations": json.loads(args[8]),
                    "dme_source": args[9] if len(args) > 9 else None,
                }
            )
            return "INSERT 1"
        if "insert into tree_registry" in s:
            code = args[0]
            existing = state["registry"].get(code)
            if existing is not None:
                if existing["status"] == "inventorie":
                    existing["status"] = "declare"
                return "UPDATE 1"
            state["registry"][code] = {
                "tree_code": code,
                "marking_type": args[1],
                "species_scientific_name": args[4],
                "measured_dbh_cm": args[5],
                "company_id": args[6],
                "status": "declare",
                "permit_number": args[7],
                "aac_label": args[8],
            }
            return "INSERT 1"
        if "update tree_registry set status='autorise'" in s:
            codes = {ln["tree_code"] for ln in state["lines"] if ln["declaration_id"] == args[0]}
            for code in codes:
                row = state["registry"].get(code)
                if row is not None and row["status"] == "declare":
                    row["status"] = "autorise"
            return "UPDATE n"
        if "update tree_registry set status=$1" in s:
            row = state["registry"].get(args[1])
            if row is not None:
                row["status"] = args[0]
            return "UPDATE 1"
        if "update felling_declarations set compliance" in s:
            row = state["declarations"].get(args[1])
            if row is not None:
                row["compliance"] = json.loads(args[0])
            return "UPDATE 1"
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)


def _setup(monkeypatch):
    users, state = _seed()
    _install_fake_db(monkeypatch, users, state)
    return users, state


@pytest.fixture
def client():
    return TestClient(app)


def _declare_payload():
    return {
        "permit_type": "PFA",
        "permit_number": "PFA-2026-07",
        "ufa_label": "UFA-3",
        "aac_label": "AAC-2026",
        "campaign_year": 2026,
        "aac_id": 11,
        "lines": [
            {
                "tree_code": "GA-2026-0001",
                "marking_type": "qr",
                "species_scientific_name": "Aucoumea klaineana",
                "measured_dbh_cm": 80.0,
                "latitude": 0.4162,
                "longitude": 9.4541,
            },
            {
                "tree_code": "GA-2026-0002",
                "marking_type": "peinture",
                "species_scientific_name": "Lophira alata",
                "measured_dbh_cm": 90.0,
                "latitude": 0.4163,
                "longitude": 9.4542,
            },
        ],
    }


def test_dme_reference_values():
    dme, source = dme_for("Aucoumea klaineana")
    assert dme == 70.0
    assert "provisional" in source
    assert dme_for("Xyz unknownensis") == (None, None)


def test_reserved_species_resolution():
    entry = reserved_species_for("Baillonella toxisperma")
    assert entry is not None and entry.common_name_fr == "Moabi"
    # Common trade name resolves through the shared registry / alias table.
    assert is_reserved_species("Moabi") is True
    assert reserved_species_for("Kévazingo").common_name_fr == "Kévazingo"
    # Ordinary commercial species are not reserved.
    assert is_reserved_species("Aucoumea klaineana") is False
    assert reserved_species_for(None) is None


def test_company_declares_with_auto_checks(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    resp = client.post(
        "/api/felling/declarations",
        json=_declare_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "soumise"
    checked = {c["tree_code"]: c for c in body["lines_checked"]}
    assert checked["GA-2026-0001"]["dme_cm"] == 70.0
    assert checked["GA-2026-0001"]["violations"] == []
    assert checked["GA-2026-0002"]["violations"] == []
    assert body["compliance"]["compliant"] is True
    assert body["compliance"]["blockers"] == []


def test_below_dme_blocks_submission(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    payload = _declare_payload()
    payload["lines"][0]["measured_dbh_cm"] = 40.0
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
    assert any(b["code"] == "below_dme" for b in resp.json()["detail"]["blockers"])


def test_missing_measurement_blocks_submission(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    payload = _declare_payload()
    payload["lines"][0]["measured_dbh_cm"] = None
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
    assert any(b["code"] == "no_measurement" for b in resp.json()["detail"]["blockers"])


def test_cites_species_flagged(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    payload = _declare_payload()
    payload["lines"] = [
        {
            "tree_code": "GA-2026-0009",
            "marking_type": "gps_photo",
            "species_scientific_name": "Pericopsis elata",
            "measured_dbh_cm": 90.0,
        }
    ]
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert "cites_listed" in resp.json()["lines_checked"][0]["violations"]


def test_reserved_species_blocks_submission(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    payload = _declare_payload()
    payload["lines"] = [
        {
            "tree_code": "GA-2026-RES",
            "marking_type": "gps_photo",
            "species_scientific_name": "Baillonella toxisperma",
            "measured_dbh_cm": 120.0,
        }
    ]
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
    assert any(b["code"] == "reserved_species" for b in resp.json()["detail"]["blockers"])


def test_reserved_species_common_name_blocks(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    payload = _declare_payload()
    payload["lines"] = [
        {
            "tree_code": "GA-2026-KEV",
            "marking_type": "peinture",
            "species_scientific_name": "Kévazingo",
            "measured_dbh_cm": 90.0,
        }
    ]
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
    assert any(b["code"] == "reserved_species" for b in resp.json()["detail"]["blockers"])


def test_tree_outside_aac_blocks_submission(client, monkeypatch):
    users, state = _setup(monkeypatch)
    state["outside_aac"] = ["GA-2026-0001"]
    token = _token(users[2])
    payload = _declare_payload()
    payload["aac_id"] = 7
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
    blockers = resp.json()["detail"]["blockers"]
    assert any(b["code"] == "outside_aac" and b["tree_code"] == "GA-2026-0001" for b in blockers)
    assert all(b["tree_code"] != "GA-2026-0002" for b in blockers)


def test_no_aac_id_is_blocked_before_any_spatial_check(client, monkeypatch):
    users, state = _setup(monkeypatch)
    state["outside_aac"] = ["GA-2026-0001"]
    payload = _declare_payload()
    payload.pop("aac_id")
    resp = _declare_with(client, users, payload)
    assert _blocker(resp) == "no_aac"


def test_park_and_out_of_concession_stems_warn_but_do_not_block(client, monkeypatch):
    users, state = _setup(monkeypatch)
    state["concessions_loaded"] = 70
    state["spatial"] = {
        "GA-2026-0001": {"protected_area": "Parc national de la Lopé", "in_concession": True},
        "GA-2026-0002": {"protected_area": None, "in_concession": False},
    }
    token = _token(users[2])
    resp = client.post(
        "/api/felling/declarations",
        json=_declare_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    lines = {line["tree_code"]: line["violations"] for line in resp.json()["lines_checked"]}
    assert "in_protected_area" in lines["GA-2026-0001"]
    assert "outside_concession" not in lines["GA-2026-0001"]
    assert "outside_concession" in lines["GA-2026-0002"]
    warnings = {w.get("code") for w in resp.json()["compliance"]["warnings"]}
    assert {"in_protected_area", "outside_concession"} <= warnings
    assert resp.json()["compliance"]["compliant"] is True


def test_concession_check_silent_without_imported_layers(client, monkeypatch):
    users, state = _setup(monkeypatch)
    state["spatial"] = {"GA-2026-0002": {"protected_area": None, "in_concession": False}}
    token = _token(users[2])
    resp = client.post(
        "/api/felling/declarations",
        json=_declare_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert all(
        "outside_concession" not in line["violations"] for line in resp.json()["lines_checked"]
    )


def test_duplicate_code_flagged_on_redeclare(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    headers = {"Authorization": f"Bearer {token}"}
    assert (
        client.post(
            "/api/felling/declarations", json=_declare_payload(), headers=headers
        ).status_code
        == 200
    )
    second = client.post("/api/felling/declarations", json=_declare_payload(), headers=headers)
    assert second.status_code == 422
    assert any(b["code"] == "duplicate_code" for b in second.json()["detail"]["blockers"])


def test_own_inventoried_stem_can_be_declared(client, monkeypatch):
    users, state = _setup(monkeypatch)
    headers = {"Authorization": f"Bearer {_token(users[2])}"}
    state["registry"]["GA-2026-0001"] = {
        "tree_code": "GA-2026-0001",
        "status": "inventorie",
        "company_id": users[2]["id"],
    }
    state["registry"]["GA-2026-0002"] = {
        "tree_code": "GA-2026-0002",
        "status": "inventorie",
        "company_id": 999,
    }
    resp = client.post("/api/felling/declarations", json=_declare_payload(), headers=headers)
    assert resp.status_code == 422
    blocked = {b["tree_code"] for b in resp.json()["detail"]["blockers"]}
    assert blocked == {"GA-2026-0002"}
    del state["registry"]["GA-2026-0002"]
    resp = client.post("/api/felling/declarations", json=_declare_payload(), headers=headers)
    assert resp.status_code == 200, resp.text
    assert state["registry"]["GA-2026-0001"]["status"] == "declare"


def test_declare_forbidden_roles(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    for uid in (1, 4):
        token = _token(users[uid])
        resp = client.post(
            "/api/felling/declarations",
            json=_declare_payload(),
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


def test_admin_authorizes_advances_registry(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    decl = client.post(
        "/api/felling/declarations",
        json=_declare_payload(),
        headers={"Authorization": f"Bearer {co}"},
    ).json()
    admin = _token(users[1])
    resp = client.patch(
        f"/api/felling/declarations/{decl['id']}",
        json={"decision": "autorisee", "motif": "Dossier complet"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "autorisee"
    trees = client.get("/api/felling/trees", headers={"Authorization": f"Bearer {co}"}).json()
    assert {t["tree_code"]: t["status"] for t in trees} == {
        "GA-2026-0001": "autorise",
        "GA-2026-0002": "autorise",
    }
    again = client.patch(
        f"/api/felling/declarations/{decl['id']}",
        json={"decision": "rejetee"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert again.status_code == 409


def test_operator_records_felling_with_proof(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co, op, admin = _token(users[2]), _token(users[4]), _token(users[1])
    decl = client.post(
        "/api/felling/declarations",
        json=_declare_payload(),
        headers={"Authorization": f"Bearer {co}"},
    ).json()
    # Felling before authorization is refused (Art. 14).
    early = client.post(
        "/api/felling/events",
        json={"tree_code": "GA-2026-0001", "event": "abattu", "latitude": 0.41, "longitude": 9.45},
        headers={"Authorization": f"Bearer {op}"},
    )
    assert early.status_code == 409
    client.patch(
        f"/api/felling/declarations/{decl['id']}",
        json={"decision": "autorisee"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    done = client.post(
        "/api/felling/events",
        json={
            "tree_code": "GA-2026-0001",
            "event": "abattu",
            "latitude": 0.41,
            "longitude": 9.45,
            "photo_url": "stored://stump/1",
        },
        headers={"Authorization": f"Bearer {op}"},
    )
    assert done.status_code == 200
    assert done.json()["event"] == "abattu"
    # Out-of-order custody transition refused.
    skip = client.post(
        "/api/felling/events",
        json={"tree_code": "GA-2026-0002", "event": "transporte"},
        headers={"Authorization": f"Bearer {op}"},
    )
    assert skip.status_code == 409


def test_operator_cannot_fell_other_company_tree(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    op = _token(users[4])
    resp = client.post(
        "/api/felling/events",
        json={"tree_code": "GA-OTHER", "event": "abattu"},
        headers={"Authorization": f"Bearer {op}"},
    )
    assert resp.status_code == 403


def test_company_scoping_and_anomalies(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co, admin = _token(users[2]), _token(users[1])
    decl = client.post(
        "/api/felling/declarations",
        json=_declare_payload(),
        headers={"Authorization": f"Bearer {co}"},
    ).json()
    client.patch(
        f"/api/felling/declarations/{decl['id']}",
        json={"decision": "autorisee"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    # Rogue felling recorded outside the API path.
    state["events"].append(
        {"id": 99, "tree_code": "GA-WILD", "event": "abattu", "actor_id": 4, "created_at": "now"}
    )
    # Historical below-DME line attached to an authorized declaration.
    state["lines"].append(
        {
            "id": 777,
            "declaration_id": decl["id"],
            "tree_code": "GA-DME-OLD",
            "violations": json.dumps(["below_dme"]),
        }
    )
    mine = client.get("/api/felling/trees", headers={"Authorization": f"Bearer {co}"}).json()
    assert "GA-OTHER" not in {t["tree_code"] for t in mine}
    anomalies = client.get(
        "/api/felling/anomalies", headers={"Authorization": f"Bearer {admin}"}
    ).json()
    assert [r["tree_code"] for r in anomalies["below_dme_authorized"]] == ["GA-DME-OLD"]
    assert [r["tree_code"] for r in anomalies["felled_without_authorization"]] == ["GA-WILD"]


def test_declaration_uses_ufa_dme(client, monkeypatch):
    """The DME floor follows the AAC's UFA arrêté, not the provisional default."""
    users, state = _setup(monkeypatch)
    token = _token(users[2])
    state["aac_ufa"][7] = 60
    state["aac_status"][7] = "ouvert"
    state["ufa_dme"].append(
        {
            "ufa_id": 60,
            "species_scientific_name": "Aucoumea klaineana",
            "dme_cm": 90.0,
            "source": "Arrêté 0001/MEF — UFA-3",
        }
    )
    payload = _declare_payload()
    payload["aac_id"] = 7
    payload["lines"] = [
        {
            "tree_code": "GA-2026-UFA",
            "marking_type": "qr",
            "species_scientific_name": "Aucoumea klaineana",
            "measured_dbh_cm": 80.0,  # ≥ provisional 70 but < UFA 90
            "latitude": 0.4162,
            "longitude": 9.4541,
        }
    ]
    blocked = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert blocked.status_code == 422
    assert any(b["code"] == "below_dme" for b in blocked.json()["detail"]["blockers"])

    payload["lines"][0]["measured_dbh_cm"] = 95.0
    ok = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok.status_code == 200
    checked = ok.json()["lines_checked"][0]
    assert checked["dme_cm"] == 90.0
    line = state["lines"][-1]
    assert line["dme_cm"] == 90.0
    assert line["dme_source"] == "Arrêté 0001/MEF — UFA-3"


def test_declaration_without_ufa_override_uses_provisional(client, monkeypatch):
    users, _state = _setup(monkeypatch)
    token = _token(users[2])
    payload = _declare_payload()
    payload["aac_id"] = 7
    resp = client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    checked = {c["tree_code"]: c for c in resp.json()["lines_checked"]}
    assert checked["GA-2026-0001"]["dme_cm"] == 70.0


def test_declaration_plates_pdf(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    token = _token(users[2])
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/felling/declarations", json=_declare_payload(), headers=headers)
    assert created.status_code == 200
    resp = client.get(
        f"/api/felling/declarations/{created.json()['id']}/plates.pdf", headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")
    assert (
        client.get("/api/felling/declarations/9999/plates.pdf", headers=headers).status_code == 404
    )


def _declare_with(client, users, payload):
    return client.post(
        "/api/felling/declarations",
        json=payload,
        headers={"Authorization": f"Bearer {_token(users[2])}"},
    )


def _blocker(resp) -> str:
    assert resp.status_code == 422, resp.text
    return resp.json()["detail"]["blockers"][0]["code"]


def test_art14_declaration_without_aac_is_blocked(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    payload = _declare_payload()
    payload.pop("aac_id")
    assert _blocker(_declare_with(client, users, payload)) == "no_aac"


def test_art14_no_authorization_or_pending_is_blocked(client, monkeypatch):
    users, state = _setup(monkeypatch)
    state["authorizations"][11] = []
    assert _blocker(_declare_with(client, users, _declare_payload())) == "no_authorization"
    state["authorizations"][11] = [
        {"status": "soumis", "valid_to": None, "startup_notified_at": None}
    ]
    assert _blocker(_declare_with(client, users, _declare_payload())) == "authorization_pending"


def test_art14_expired_or_not_notified_is_blocked(client, monkeypatch):
    users, state = _setup(monkeypatch)
    state["authorizations"][11] = [
        {"status": "delivre", "valid_to": date(2020, 1, 1), "startup_notified_at": "2019-01-01"}
    ]
    assert _blocker(_declare_with(client, users, _declare_payload())) == "no_authorization"
    state["authorizations"][11] = [
        {"status": "delivre", "valid_to": None, "startup_notified_at": None}
    ]
    assert _blocker(_declare_with(client, users, _declare_payload())) == "startup_not_notified"


def test_art14_aac_of_another_organisation_is_blocked(client, monkeypatch):
    users, state = _setup(monkeypatch)
    users[2]["organization_id"] = 12
    state["aac_holder"][11] = 99
    assert _blocker(_declare_with(client, users, _declare_payload())) == "aac_not_held"
    state["aac_holder"][11] = 12
    assert _declare_with(client, users, _declare_payload()).status_code == 200
