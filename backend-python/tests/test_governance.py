"""Governance slice tests: organizations wizard, documents, taxes, compliance gate."""

from datetime import date, timedelta

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
    profiles = {
        "exploitant_forestier": {
            "code": "exploitant_forestier",
            "label": "Exploitant forestier",
            "org_type": "entreprise",
            "activities": ["exploitation"],
            "allowed_title_types": ["CFAD", "PFA", "PGG"],
            "doc_required": [
                "agrement_exploitation",
                "quittance_taxe_superficie",
                "quittance_redevance_surveillance",
            ],
            "enabled_modules": ["documents", "titles", "aac", "felling"],
            "obligations": {"ccc": True},
            "description": "Exploitation seule",
        }
    }
    doc_types = {
        "agrement_exploitation": {
            "code": "agrement_exploitation",
            "label": "Agrément exploitation",
        },
        "quittance_taxe_superficie": {
            "code": "quittance_taxe_superficie",
            "label": "Quittance taxe de superficie",
        },
        "quittance_redevance_surveillance": {
            "code": "quittance_redevance_surveillance",
            "label": "Quittance redevance de surveillance",
        },
    }
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
    }
    state = {
        "org_seq": 20,
        "doc_seq": 100,
        "tax_seq": 300,
        "title_seq": 30,
        "organizations": {
            10: {
                "id": 10,
                "org_type": "entreprise",
                "name": "Bois SA",
                "legal_form": None,
                "registration_no": None,
                "tax_id": None,
                "email": None,
                "phone": None,
                "address": None,
                "profile_code": "exploitant_forestier",
                "is_active": True,
                "created_by": 1,
                "created_at": "now",
            }
        },
        "legal_documents": {},
        "tax_receipts": {},
        "forest_titles": {
            30: {
                "id": 30,
                "title_type": "CFAD",
                "reference": "T-1",
                "holder_org_id": 10,
                "zone": "permanent",
                "surface_ha": 5000.0,
                "status": "actif",
                "created_by": 2,
            }
        },
        "annual_cut_blocks": {40: {"id": 40, "status": "ouvert"}},
        "management_units": {
            60: {
                "id": 60,
                "title_id": 30,
                "label": "UFA-1",
                "surface_ha": 100.0,
                "plan_amenagement_ref": None,
                "pa_approved_at": None,
                "pa_expiry": None,
                "plan_gestion_ref": None,
                "rotation_years": None,
                "created_at": "now",
            }
        },
        "declarations": {
            50: {"id": 50, "company_id": 2, "title_id": 30, "aac_id": 40, "status": "soumise"},
            51: {"id": 51, "company_id": 2, "title_id": 30, "aac_id": None, "status": "soumise"},
        },
        "lines": {
            50: [{"tree_code": "GA-CITES", "violations": '["cites_listed"]'}],
            51: [{"tree_code": "GA-DME", "violations": '["below_dme"]'}],
        },
    }

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return {k: v for k, v in users[args[0]].items() if k != "password_hash"}
        if "select * from org_profiles where code" in s:
            return dict(profiles[args[0]]) if args[0] in profiles else None
        if "doc_required from org_profiles where code" in s:
            return {"doc_required": profiles.get(args[0], {}).get("doc_required", [])}
        if "from organizations o left join org_profiles" in s:
            org = state["organizations"].get(args[0])
            if org is None:
                return None
            profile = profiles.get(org.get("profile_code"), {})
            return {**org, "profile_label": profile.get("label")}
        if "from organizations o join org_profiles" in s and "left" not in s:
            org = state["organizations"].get(args[0])
            if org is None:
                return None
            profile = profiles.get(org.get("profile_code"), {})
            return {"code": profile.get("code"), "doc_required": profile.get("doc_required", [])}
        if "insert into organizations" in s:
            oid = state["org_seq"]
            state["org_seq"] += 1
            state["organizations"][oid] = {
                "id": oid,
                "org_type": args[0],
                "name": args[1],
                "legal_form": args[2],
                "registration_no": args[3],
                "tax_id": args[4],
                "email": args[5],
                "phone": args[6],
                "address": args[7],
                "profile_code": args[8],
                "is_active": True,
                "created_by": args[9],
                "created_at": "now",
            }
            return {"id": oid, "org_type": args[0], "profile_code": args[8]}
        if "update users set organization_id" in s:
            user = users.get(args[1])
            if user is None or user["role"] != "company":
                return None
            user["organization_id"] = args[0]
            return {"id": user["id"], "email": user["email"], "display_name": user["display_name"]}
        if "select id from legal_documents where scope_type" in s:
            return next(
                (
                    {"id": d["id"]}
                    for d in state["legal_documents"].values()
                    if d["scope_type"] == args[0]
                    and d["scope_id"] == args[1]
                    and d["doc_type"] == args[2]
                ),
                None,
            )
        if "insert into legal_documents" in s:
            did = state["doc_seq"]
            state["doc_seq"] += 1
            if len(args) == 2:
                row = {
                    "id": did,
                    "scope_type": "company",
                    "scope_id": args[0],
                    "doc_type": args[1],
                    "reference": None,
                    "authority": None,
                    "issued_at": None,
                    "expires_at": None,
                    "file_url": None,
                    "status": "manquant",
                    "submitted_by": None,
                }
                state["legal_documents"][did] = row
                return {"id": did}
            row = {
                "id": did,
                "scope_type": args[0],
                "scope_id": args[1],
                "doc_type": args[2],
                "reference": args[3],
                "authority": args[4],
                "issued_at": args[5],
                "expires_at": args[6],
                "file_url": args[7],
                "status": "soumis",
                "submitted_by": args[8],
            }
            state["legal_documents"][did] = row
            return {
                "id": did,
                "scope_type": row["scope_type"],
                "scope_id": row["scope_id"],
                "doc_type": row["doc_type"],
                "status": row["status"],
            }
        if "select code from document_types where code" in s:
            if args[0] in doc_types:
                return {"code": args[0]}
            return None
        if "from forest_titles where id" in s:
            return (
                dict(state["forest_titles"][args[0]]) if args[0] in state["forest_titles"] else None
            )
        if "from annual_cut_blocks where id" in s:
            return (
                dict(state["annual_cut_blocks"][args[0]])
                if args[0] in state["annual_cut_blocks"]
                else None
            )
        if "insert into forest_titles" in s:
            tid = state["title_seq"]
            state["title_seq"] += 1
            state["forest_titles"][tid] = {
                "id": tid,
                "title_type": args[0],
                "reference": args[1],
                "holder_org_id": args[2],
                "zone": args[3],
                "surface_ha": args[4],
                "status": "demande",
                "created_by": args[5],
            }
            return {
                "id": tid,
                "title_type": args[0],
                "reference": args[1],
                "status": "demande",
                "created_at": "now",
            }
        if "update forest_titles set status" in s:
            row = state["forest_titles"].get(args[-1])
            if row is None:
                return None
            row["status"] = args[0]
            row["decided_by"] = args[1]
            row["decision_motif"] = args[2]
            if row["status"] == "exploration":
                row["exploration_start"] = args[3]
                row["exploration_end"] = args[4]
            return {
                "id": row["id"],
                "title_type": row["title_type"],
                "reference": row["reference"],
                "status": row["status"],
            }
        if "insert into tax_receipts" in s:
            tid = state["tax_seq"]
            state["tax_seq"] += 1
            state["tax_receipts"][tid] = {
                "id": tid,
                "org_id": args[0],
                "title_id": args[1],
                "tax_type": args[2],
                "period_year": args[3],
                "amount_fcfa": args[4],
                "receipt_ref": args[5],
                "paid_at": args[6],
                "status": args[7],
                "document_id": args[8],
            }
            return {
                "id": tid,
                "org_id": args[0],
                "tax_type": args[2],
                "period_year": args[3],
                "amount_fcfa": args[4],
                "status": args[7],
            }
        if "update legal_documents set status" in s:
            row = state["legal_documents"].get(args[3])
            if row is None:
                return None
            row["status"] = args[0]
            row["notes"] = args[1]
            row["verified_by"] = args[2]
            return {
                "id": row["id"],
                "scope_type": row["scope_type"],
                "scope_id": row["scope_id"],
                "doc_type": row["doc_type"],
                "status": row["status"],
                "verified_by": row["verified_by"],
            }
        if "select * from felling_declarations where id" in s:
            return (
                dict(state["declarations"][args[0]]) if args[0] in state["declarations"] else None
            )
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from org_profiles order by code" in s:
            return [dict(p) for p in profiles.values()]
        if "from document_types" in s:
            if not args:
                return [dict(d) for d in doc_types.values()]
            codes = args[0]
            return [doc_types[c] for c in codes if c in doc_types]
        if "from management_units where title_id" in s:
            return [dict(u) for u in state["management_units"].values() if u["title_id"] == args[0]]
        if "from legal_documents" in s and "where scope_type" in s:
            if isinstance(args[0], str):
                return [
                    dict(d)
                    for d in state["legal_documents"].values()
                    if d["scope_type"] == args[0] and d["scope_id"] == args[1]
                ]
            return [
                dict(d)
                for d in state["legal_documents"].values()
                if d["scope_type"] == "company" and d["scope_id"] == args[0]
            ]
        if "from tax_receipts where org_id" in s and "status in" in s:
            return [
                dict(r)
                for r in state["tax_receipts"].values()
                if r["org_id"] == args[0] and r["status"] in ("du", "en_retard")
            ]
        if "from tax_receipts where org_id" in s:
            return [dict(r) for r in state["tax_receipts"].values() if r["org_id"] == args[0]]
        if "from tax_dues where org_id" in s and "receipt_id is null" in s:
            today = date.today()
            return [
                dict(r)
                for r in state.get("tax_dues", {}).values()
                if r["org_id"] == args[0]
                and r["receipt_id"] is None
                and r["due_at"] is not None
                and r["due_at"] < today
            ]
        if "from forest_titles where holder_org_id" in s:
            return [
                dict(t) for t in state["forest_titles"].values() if t["holder_org_id"] == args[0]
            ]
        if "from declaration_lines where declaration_id" in s:
            return [dict(ln) for ln in state["lines"].get(args[0], [])]
        return []

    async def execute(sql, *args):
        s = " ".join(sql.split()).lower()
        if "insert into legal_documents" in s:
            did = state["doc_seq"]
            state["doc_seq"] += 1
            state["legal_documents"][did] = {
                "id": did,
                "scope_type": "company",
                "scope_id": args[0],
                "doc_type": args[1],
                "reference": None,
                "authority": None,
                "issued_at": None,
                "expires_at": None,
                "file_url": None,
                "status": "manquant",
                "submitted_by": None,
                "created_at": "now",
            }
            return "INSERT 1"
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)
    return users, state, doc_types


@pytest.fixture
def client():
    return TestClient(app)


def test_admin_creates_organization_generates_checklist(client, monkeypatch):
    users, state, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.post(
        "/api/organizations",
        json={"name": "Nouvelle Bois SA", "profile_code": "exploitant_forestier"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert len(body["checklist"]) == 3
    assert all(item["status"] == "manquant" for item in body["checklist"])
    created = next(o for o in state["organizations"].values() if o["name"] == "Nouvelle Bois SA")
    assert created["profile_code"] == "exploitant_forestier"
    docs_for_org = [d for d in state["legal_documents"].values() if d["scope_id"] == created["id"]]
    assert len(docs_for_org) == 3


def test_profiles_include_preset_with_doc_labels(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.get("/api/organizations/profiles", headers={"Authorization": f"Bearer {admin}"})
    assert resp.status_code == 200
    profile = resp.json()[0]
    assert profile["code"] == "exploitant_forestier"
    labels = {item["code"] for item in profile["doc_required"]}
    assert "agrement_exploitation" in labels


def test_company_sees_profile_checklist(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get("/api/organizations/me", headers={"Authorization": f"Bearer {co}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["organization"]["name"] == "Bois SA"
    assert all(item["status"] == "manquant" for item in body["checklist"])


def test_link_company_user_via_wizard(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    admin = _token(users[1])
    resp = client.post(
        "/api/organizations",
        json={"name": "Exploitation", "profile_code": "exploitant_forestier", "user_id": 5},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert resp.status_code == 201
    assert resp.json()["linked_user"]["id"] == 5
    assert users[5]["organization_id"] == resp.json()["organization"]["id"]
    bad = client.post(
        "/api/organizations",
        json={"name": "Mauvais lien", "profile_code": "exploitant_forestier", "user_id": 1},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert bad.status_code == 400


def test_company_uploads_document_and_admin_verifies(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])
    upload = client.post(
        "/api/documents/upload",
        json={
            "scope_type": "company",
            "scope_id": 10,
            "doc_type": "agrement_exploitation",
            "reference": "AGR-2026/01",
            "file_url": "stored://docs/agr-01.pdf",
        },
        headers={"Authorization": f"Bearer {co}"},
    )
    assert upload.status_code == 200
    doc_id = upload.json()["id"]
    assert upload.json()["status"] == "soumis"

    checklist = client.get(
        "/api/documents/checklist",
        headers={"Authorization": f"Bearer {co}"},
    )
    assert checklist.status_code == 200
    assert [d["status"] for d in checklist.json()] == ["soumis"]

    unexplained = client.patch(
        f"/api/documents/{doc_id}",
        json={"status": "rejete"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert unexplained.status_code == 400
    verified = client.patch(
        f"/api/documents/{doc_id}",
        json={"status": "valide", "notes": "Pièce conforme"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "valide"

    assert (
        client.patch(
            f"/api/documents/{doc_id}",
            json={"status": "valide"},
            headers={"Authorization": f"Bearer {co}"},
        ).status_code
        == 403
    )


def test_company_cannot_upload_for_other_org(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.post(
        "/api/documents/upload",
        json={"scope_type": "company", "scope_id": 999, "doc_type": "agrement_exploitation"},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 403


def test_compliance_warns_cites_and_flags_hard_blockers(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    warn_resp = client.get("/api/compliance/felling/50", headers={"Authorization": f"Bearer {co}"})
    assert warn_resp.status_code == 200
    warnings = warn_resp.json()["warnings"]
    codes = {w["code"] if "code" in w else w["kind"] for w in warnings}
    assert "cites_listed" in codes
    assert "document" in codes
    assert warn_resp.json()["compliant"] is True

    hard = client.get("/api/compliance/felling/51", headers={"Authorization": f"Bearer {co}"})
    assert hard.status_code == 200
    assert any(b["code"] == "below_dme" for b in hard.json()["blockers"])
    assert hard.json()["compliant"] is False


def test_compliance_respects_verified_documents(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])
    upload = client.post(
        "/api/documents/upload",
        json={"scope_type": "company", "scope_id": 10, "doc_type": "agrement_exploitation"},
        headers={"Authorization": f"Bearer {co}"},
    ).json()
    client.patch(
        f"/api/documents/{upload['id']}",
        json={"status": "valide"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    body = client.get(
        "/api/compliance/felling/50", headers={"Authorization": f"Bearer {co}"}
    ).json()
    doc_warnings = [w for w in body["warnings"] if w.get("kind") == "document"]
    assert [w["doc_type"] for w in doc_warnings] == [
        "quittance_taxe_superficie",
        "quittance_redevance_surveillance",
    ]


def test_unpaid_tax_adds_compliance_warning(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.post(
        "/api/taxes",
        json={
            "tax_type": "superficie",
            "period_year": 2026,
            "amount_fcfa": 5_000_000,
        },
        headers={"Authorization": f"Bearer {co}"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "du"

    body = client.get(
        "/api/compliance/felling/50", headers={"Authorization": f"Bearer {co}"}
    ).json()
    assert any(w.get("kind") == "tax" for w in body["warnings"])


def test_overdue_tax_due_adds_compliance_warning(client, monkeypatch):
    users, state, _ = _setup(monkeypatch)
    today = date.today()
    state["tax_dues"] = {
        1: {
            "id": 1,
            "org_id": 10,
            "tax_type": "abattage",
            "period_year": today.year,
            "due_at": today - timedelta(days=5),
            "amount_fcfa": 3_500_000.0,
            "receipt_id": None,
        },
        2: {
            "id": 2,
            "org_id": 10,
            "tax_type": "surveillance",
            "period_year": today.year,
            "due_at": today + timedelta(days=30),
            "amount_fcfa": 800_000.0,
            "receipt_id": None,
        },
        3: {
            "id": 3,
            "org_id": 10,
            "tax_type": "superficie",
            "period_year": today.year,
            "due_at": today - timedelta(days=60),
            "amount_fcfa": 12_000_000.0,
            "receipt_id": 99,
        },
    }
    co = _token(users[2])
    body = client.get(
        "/api/compliance/felling/50", headers={"Authorization": f"Bearer {co}"}
    ).json()
    tax_warnings = [w for w in body["warnings"] if w.get("kind") == "tax"]
    assert [(w["tax_type"], w["status"], w["due_id"]) for w in tax_warnings] == [
        ("abattage", "en_retard", 1)
    ]
    assert body["compliant"] is True


def test_company_requests_title_and_admin_advances(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    admin = _token(users[1])
    created = client.post(
        "/api/titles",
        json={"title_type": "CFAD", "zone": "permanent", "surface_ha": 1000},
        headers={"Authorization": f"Bearer {co}"},
    )
    assert created.status_code == 201
    assert created.json()["status"] == "demande"
    title_id = created.json()["id"]

    advanced = client.patch(
        f"/api/titles/{title_id}",
        json={"decision": "exploration"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert advanced.status_code == 200
    assert advanced.json()["status"] == "exploration"

    invalid = client.patch(
        f"/api/titles/{title_id}",
        json={"decision": "actif"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert invalid.status_code == 409

    no_reason = client.patch(
        f"/api/titles/{title_id}",
        json={"decision": "rejete", "motif": "  "},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert no_reason.status_code == 400
    rejected = client.patch(
        f"/api/titles/{title_id}",
        json={"decision": "rejete", "motif": "Inventaire incomplet"},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert rejected.status_code == 200


def test_unknown_user_org_returns_conflict(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co2 = _token(users[5])
    resp = client.get("/api/organizations/me", headers={"Authorization": f"Bearer {co2}"})
    assert resp.status_code == 409


def test_document_types_dictionary_is_available(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get("/api/documents/types", headers={"Authorization": f"Bearer {co}"})
    assert resp.status_code == 200
    assert "agrement_exploitation" in {d["code"] for d in resp.json()}


def test_company_lists_units_of_own_title(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co = _token(users[2])
    resp = client.get("/api/titles/30/units", headers={"Authorization": f"Bearer {co}"})
    assert resp.status_code == 200
    assert [u["label"] for u in resp.json()] == ["UFA-1"]


def test_units_require_organization_and_existing_title(client, monkeypatch):
    users, _, _ = _setup(monkeypatch)
    co2 = _token(users[5])  # company without an organization
    assert (
        client.get("/api/titles/30/units", headers={"Authorization": f"Bearer {co2}"}).status_code
        == 409
    )
    co = _token(users[2])
    assert (
        client.get("/api/titles/999/units", headers={"Authorization": f"Bearer {co}"}).status_code
        == 404
    )
