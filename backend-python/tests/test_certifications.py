"""Slice 7 tests: third-party certifications (FSC / PAFC / …).

A company declares a certificate on its own organisation (soumis); the
Ministry verifies it (actif), rejects it (rejete, motif required) or suspends
it (suspendu, motif required). An active certificate whose validity lapsed is
shown as expired (derived at read).
"""

from datetime import date

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
        6: {
            "id": 6,
            "email": "other@x",
            "display_name": "Other",
            "role": "company",
            "password_hash": _pw("otherpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": 11,
        },
        5: {
            "id": 5,
            "email": "noorg@x",
            "display_name": "NoOrg",
            "role": "company",
            "password_hash": _pw("noorgpw"),
            "is_active": True,
            "cooperative_id": None,
            "company_id": None,
            "organization_id": None,
        },
    }
    state = {
        "cert_seq": 900,
        "organizations": {10: {"id": 10, "name": "Bois SA"}, 11: {"id": 11, "name": "Autre SARL"}},
        "forest_titles": {
            30: {"id": 30, "reference": "T-1", "holder_org_id": 10},
            60: {"id": 60, "reference": "T-2", "holder_org_id": 11},
        },
        "certifications": {},
    }
    today = date.today().isoformat()

    def _derive(cert: dict) -> str:
        if (
            cert["status"] == "actif"
            and cert.get("valid_to")
            and str(cert["valid_to"])[:10] < today
        ):
            return "expire"
        return cert["status"]

    def _enrich(cert: dict) -> dict:
        title = state["forest_titles"].get(cert.get("title_id"), {})
        org = state["organizations"].get(cert.get("org_id"), {})
        return {
            **cert,
            "status": _derive(cert),
            "org_name": org.get("name"),
            "title_ref": title.get("reference"),
        }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return {k: v for k, v in users[args[0]].items() if k != "password_hash"}
        if "from forest_titles where id" in s:
            return state["forest_titles"].get(args[0])
        if "from certifications c" in s and "where c.id" in s:
            cert = state["certifications"].get(args[0])
            return _enrich(cert) if cert is not None else None
        if "insert into certifications" in s:
            cid = state["cert_seq"]
            state["cert_seq"] += 1
            row = {
                "id": cid,
                "org_id": args[0],
                "title_id": args[1],
                "scheme": args[2],
                "cert_type": args[3],
                "certificate_ref": args[4],
                "surface_ha": args[5],
                "valid_from": args[6],
                "valid_to": args[7],
                "status": "soumis",
                "declared_by": args[8],
                "verified_by": None,
                "verified_at": None,
                "decision_motif": None,
                "created_at": "now",
            }
            state["certifications"][cid] = row
            return dict(row)
        if "update certifications set status" in s:
            cert = state["certifications"].get(args[3])
            if cert is None:
                return None
            cert["status"] = args[0]
            cert["decision_motif"] = args[1]
            cert["verified_by"] = args[2]
            cert["verified_at"] = "now"
            return dict(cert)
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "group by 1" in s:
            counts: dict[str, dict] = {}
            for cert in state["certifications"].values():
                st = _derive(cert)
                slot = counts.setdefault(st, {"status": st, "count": 0, "surface_ha": 0.0})
                slot["count"] += 1
                slot["surface_ha"] += float(cert.get("surface_ha") or 0)
            return list(counts.values())
        if "group by scheme" in s:
            counts: dict[str, int] = {}
            for cert in state["certifications"].values():
                counts[cert["scheme"]] = counts.get(cert["scheme"], 0) + 1
            return [{"scheme": k, "count": v} for k, v in counts.items()]
        if "from certifications c" in s:
            rows = [_enrich(c) for c in state["certifications"].values()]
            idx = 0
            if "c.org_id = $" in s:
                rows = [r for r in rows if r["org_id"] == args[idx]]
                idx += 1
            if "c.scheme = $" in s:
                rows = [r for r in rows if r["scheme"] == args[idx]]
                idx += 1
            if "c.title_id = $" in s:
                rows = [r for r in rows if r["title_id"] == args[idx]]
                idx += 1
            return rows
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


def _declare(client, token, **over):
    payload = {
        "scheme": "FSC",
        "cert_type": "gestion_durable",
        "certificate_ref": "FSC-C-001",
        "surface_ha": 5000,
        "valid_from": "2025-01-01",
        "valid_to": "2030-01-01",
    }
    payload.update(over)
    return client.post("/api/certifications", json=payload, headers=_auth(token))


def test_company_declares_and_admin_verifies(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])

    created = _declare(client, co)
    assert created.status_code == 201
    assert created.json()["status"] == "soumis"
    cert_id = created.json()["id"]
    assert state["certifications"][cert_id]["declared_by"] == 2

    verified = client.patch(
        f"/api/certifications/{cert_id}",
        json={"decision": "actif"},
        headers=_auth(admin),
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "actif"
    assert state["certifications"][cert_id]["verified_by"] == 1

    listed = client.get("/api/certifications", headers=_auth(co))
    assert listed.status_code == 200
    assert [c["id"] for c in listed.json()] == [cert_id]
    assert listed.json()[0]["org_name"] == "Bois SA"


def test_reject_requires_motif(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    cert_id = _declare(client, _token(users[2])).json()["id"]

    no_motif = client.patch(
        f"/api/certifications/{cert_id}",
        json={"decision": "rejete"},
        headers=_auth(admin),
    )
    assert no_motif.status_code == 400

    rejected = client.patch(
        f"/api/certifications/{cert_id}",
        json={"decision": "rejete", "decision_motif": "Certificat non valide"},
        headers=_auth(admin),
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejete"
    assert rejected.json()["decision_motif"] == "Certificat non valide"


def test_suspend_requires_motif(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    cert_id = _declare(client, _token(users[2])).json()["id"]
    client.patch(f"/api/certifications/{cert_id}", json={"decision": "actif"}, headers=_auth(admin))

    no_motif = client.patch(
        f"/api/certifications/{cert_id}",
        json={"decision": "suspendu"},
        headers=_auth(admin),
    )
    assert no_motif.status_code == 400

    suspended = client.patch(
        f"/api/certifications/{cert_id}",
        json={"decision": "suspendu", "decision_motif": "Audit en cours"},
        headers=_auth(admin),
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspendu"


def test_company_list_is_scoped_to_org(client, monkeypatch):
    users, state = _setup(monkeypatch)
    co = _token(users[2])
    other = _token(users[6])
    _declare(client, co)
    cert_id = next(iter(state["certifications"]))

    # A certification belonging to organisation 11 is invisible to org 10.
    state["certifications"][999] = {
        "id": 999,
        "org_id": 11,
        "title_id": None,
        "scheme": "PAFC",
        "cert_type": "legalite_plus",
        "certificate_ref": None,
        "surface_ha": None,
        "valid_from": None,
        "valid_to": None,
        "status": "actif",
        "declared_by": 6,
        "verified_by": None,
        "verified_at": None,
        "decision_motif": None,
        "created_at": "now",
    }

    mine = client.get("/api/certifications", headers=_auth(co)).json()
    assert [c["id"] for c in mine] == [cert_id]

    theirs = client.get("/api/certifications", headers=_auth(other)).json()
    assert [c["id"] for c in theirs] == [999]

    everyone = client.get("/api/certifications", headers=_auth(_token(users[1]))).json()
    assert sorted(c["id"] for c in everyone) == sorted([cert_id, 999])


def test_list_filters_by_scheme_and_status(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    co = _token(users[2])
    _declare(client, co, scheme="FSC")
    pafc = _declare(client, co, scheme="PAFC").json()["id"]
    client.patch(f"/api/certifications/{pafc}", json={"decision": "actif"}, headers=_auth(admin))

    only_pafc = client.get("/api/certifications?scheme=PAFC", headers=_auth(admin)).json()
    assert [c["id"] for c in only_pafc] == [pafc]

    only_active = client.get("/api/certifications?status=actif", headers=_auth(admin)).json()
    assert [c["id"] for c in only_active] == [pafc]

    only_pending = client.get("/api/certifications?status=soumis", headers=_auth(admin)).json()
    assert len(only_pending) == 1


def test_company_cannot_declare_on_foreign_title(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    forbidden = _declare(client, co, title_id=60)  # held by org 11
    assert forbidden.status_code == 403

    unknown = _declare(client, co, title_id=1234)
    assert unknown.status_code == 404


def test_company_without_org_is_conflict(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    noorg = _token(users[5])
    assert _declare(client, noorg).status_code == 409


def test_summary(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    admin = _token(users[1])
    co = _token(users[2])
    a = _declare(client, co, scheme="FSC", surface_ha=1000).json()["id"]
    _declare(client, co, scheme="PAFC", surface_ha=2000)
    client.patch(f"/api/certifications/{a}", json={"decision": "actif"}, headers=_auth(admin))

    summary = client.get("/api/certifications/summary", headers=_auth(admin))
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_count"] == 2
    by_scheme = {s["scheme"]: s["count"] for s in body["by_scheme"]}
    assert by_scheme == {"FSC": 1, "PAFC": 1}


def test_pdf_is_scoped(client, monkeypatch):
    users, _ = _setup(monkeypatch)
    co = _token(users[2])
    other = _token(users[6])
    cert_id = _declare(client, co).json()["id"]

    pdf = client.get(f"/api/certifications/{cert_id}/pdf", headers=_auth(co))
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    forbidden = client.get(f"/api/certifications/{cert_id}/pdf", headers=_auth(other))
    assert forbidden.status_code == 403
