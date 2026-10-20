"""Slice 33 — cooperative space: members and aggregated volumes (DB mocked)."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.core.log_volume import merchantable_volume_m3
from app.main import app
from app.services import compliance, cooperative, db

BASE = {
    "is_active": True,
    "cooperative_id": None,
    "company_id": None,
    "first_name": None,
    "last_name": None,
    "matricule": None,
}
COOP = {
    **BASE,
    "id": 5,
    "email": "coop@x",
    "display_name": "Coop",
    "role": "cooperative",
    "organization_id": 50,
}
ORPHAN_COOP = {**COOP, "id": 6, "email": "orphan@x", "organization_id": None}
COMPANY = {
    **BASE,
    "id": 7,
    "email": "co@x",
    "display_name": "Co",
    "role": "company",
    "organization_id": 10,
}
ADMIN = {
    **BASE,
    "id": 1,
    "email": "admin@x",
    "display_name": "Admin",
    "role": "admin",
    "organization_id": None,
}
USERS = {u["id"]: u for u in (COOP, ORPHAN_COOP, COMPANY, ADMIN)}

ORGS = {
    50: {
        "id": 50,
        "name": "Coop",
        "org_type": "cooperative",
        "profile_code": "cooperative_forestiere",
        "is_active": True,
    },
    51: {
        "id": 51,
        "name": "Autre coop",
        "org_type": "cooperative",
        "profile_code": None,
        "is_active": True,
    },
    10: {
        "id": 10,
        "name": "Petit exploitant",
        "org_type": "entreprise",
        "profile_code": "exploitant_forestier",
        "is_active": True,
    },
    11: {
        "id": 11,
        "name": "Communauté",
        "org_type": "communaute",
        "profile_code": "foret_communautaire",
        "is_active": True,
    },
    12: {
        "id": 12,
        "name": "Fermée",
        "org_type": "entreprise",
        "profile_code": None,
        "is_active": False,
    },
}


def _auth(user: dict) -> dict:
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 600
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client():
    return TestClient(app)


class FakeDB:
    def __init__(self):
        self.memberships: dict[int, dict] = {}
        self.next_id = 1

    def _row(self, m: dict) -> dict:
        org = ORGS[m["member_org_id"]]
        return {
            **m,
            "member_name": org["name"],
            "member_org_type": org["org_type"],
            "member_profile_code": org["profile_code"],
            "member_profile_label": None,
            "member_provinces": None,
        }

    async def fetch_one(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return USERS.get(args[0])
        if "from organizations o left join org_profiles p" in s and "where o.id = $1" in s:
            org = ORGS.get(args[0])
            return {**org, "profile_label": None, "profile_description": None} if org else None
        if s.startswith("select id, org_type, is_active from organizations"):
            return ORGS.get(args[0])
        if "select id from cooperative_memberships" in s:
            for m in self.memberships.values():
                if (
                    m["cooperative_org_id"] == args[0]
                    and m["member_org_id"] == args[1]
                    and m["status"] != "sortie"
                ):
                    return {"id": m["id"]}
            return None
        if "insert into cooperative_memberships" in s:
            mid = self.next_id
            self.next_id += 1
            self.memberships[mid] = {
                "id": mid,
                "cooperative_org_id": args[0],
                "member_org_id": args[1],
                "joined_on": args[2],
                "notes": args[3],
                "added_via": args[5],
                "status": "active",
                "left_on": None,
                "status_reason": None,
            }
            return {"id": mid}
        if "from cooperative_memberships m" in s and "where m.id = $1" in s:
            m = self.memberships.get(args[0])
            return self._row(m) if m and m["cooperative_org_id"] == args[1] else None
        return None

    async def fetch_all(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if "from cooperative_memberships m" in s and "m.cooperative_org_id = $1" in s:
            return [
                self._row(m)
                for m in self.memberships.values()
                if m["cooperative_org_id"] == args[0] and (args[1] or m["status"] != "sortie")
            ]
        if (
            "from cooperative_memberships m join organizations o on o.id = m.cooperative_org_id"
            in s
        ):
            return [
                {**m, "cooperative_name": ORGS[m["cooperative_org_id"]]["name"]}
                for m in self.memberships.values()
                if m["member_org_id"] == args[0]
            ]
        if "from forest_titles where holder_org_id = any" in s:
            return [{"org_id": 10, "title_type": "PFA", "status": "actif", "n": 1}]
        if "from tree_registry r" in s:
            return [
                {
                    "org_id": 10,
                    "status": "abattu",
                    "species_scientific_name": "Aucoumea klaineana",
                    "measured_dbh_cm": 80,
                },
                {
                    "org_id": 10,
                    "status": "declare",
                    "species_scientific_name": "Aucoumea klaineana",
                    "measured_dbh_cm": 70,
                },
            ]
        if "from org_profiles" in s or "from document_types" in s or "from legal_documents" in s:
            return []
        return []

    async def execute(self, sql, *args):
        s = " ".join(sql.split()).lower()
        if s.startswith("update cooperative_memberships"):
            m = self.memberships[args[3]]
            m.update(status=args[0], left_on=args[1], status_reason=args[2])
        return "OK"


@pytest.fixture
def fake(monkeypatch):
    f = FakeDB()
    monkeypatch.setattr(db, "fetch_one", f.fetch_one)
    monkeypatch.setattr(db, "fetch_all", f.fetch_all)
    monkeypatch.setattr(db, "execute", f.execute)

    async def warnings(_org_id):
        return []

    monkeypatch.setattr(compliance, "assess_org_warnings", warnings)
    return f


def test_aggregates_sum_volumes_logs_documents_and_taxes_per_member():
    out = cooperative.build_aggregates(
        [10, 11],
        titles=[{"org_id": 10, "title_type": "PFA", "status": "actif", "n": 2}],
        aacs=[
            {"org_id": 10, "status": "ouvert", "n": 1},
            {"org_id": 99, "status": "ouvert", "n": 5},
        ],
        lines=[
            {
                "org_id": 10,
                "status": "autorisee",
                "species_scientific_name": None,
                "measured_dbh_cm": 80,
            },
            {
                "org_id": 10,
                "status": "soumise",
                "species_scientific_name": None,
                "measured_dbh_cm": 60,
            },
        ],
        logs=[
            {
                "org_id": 10,
                "status": "transforme",
                "species_scientific_name": None,
                "measured_dbh_cm": 80,
            },
            {
                "org_id": 11,
                "status": "inventorie",
                "species_scientific_name": None,
                "measured_dbh_cm": 50,
            },
        ],
        docs=[
            {"org_id": 11, "status": "expire", "n": 1},
            {"org_id": 11, "status": "valide", "n": 2},
        ],
        taxes=[{"org_id": 10, "status": "en_retard", "n": 1, "amount_fcfa": 1500}],
    )
    v80, v60 = merchantable_volume_m3(80), merchantable_volume_m3(60)
    a = out[10]
    assert a["titles"] == {"total": 2, "by_type": {"PFA": 2}, "by_status": {"actif": 2}}
    assert a["aac"]["total"] == 1
    assert a["volumes"]["declared_m3"] == round(v80 + v60, 3)
    assert a["volumes"]["authorized_m3"] == round(v80, 3)
    assert a["volumes"]["felled_m3"] == round(v80, 3) and a["volumes"]["felled_stems"] == 1
    assert a["logs"]["by_status"]["transforme"] == 1
    assert (
        a["taxes"]["by_status"]["en_retard"] == 1 and a["taxes"]["amount_fcfa"]["en_retard"] == 1500
    )
    b = out[11]
    assert b["volumes"]["felled_m3"] == 0 and b["logs"]["by_status"]["inventorie"] == 1
    assert b["documents"] == {
        "total": 3,
        "by_status": {"valide": 2, "soumis": 0, "manquant": 0, "expire": 1, "rejete": 0},
    }
    total = cooperative.sum_aggregates([a, b])
    assert total["logs"]["total"] == 2 and total["documents"]["by_status"]["expire"] == 1
    assert total["volumes"]["declared_stems"] == 2 and total["titles"]["by_type"] == {"PFA": 2}
    assert cooperative.sum_aggregates([])["volumes"]["felled_m3"] == 0


def test_cooperative_adds_a_member_once_and_sees_it_in_its_space(client, fake):
    resp = client.post("/api/cooperative/members", json={"member_org_id": 10}, headers=_auth(COOP))
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "active" and resp.json()["added_via"] == "cooperative"
    again = client.post("/api/cooperative/members", json={"member_org_id": 10}, headers=_auth(COOP))
    assert again.status_code == 409
    space = client.get("/api/cooperative/space", headers=_auth(COOP)).json()
    assert space["counts"]["active"] == 1
    assert space["members"][0]["aggregate"]["titles"]["total"] == 1
    assert space["totals"]["volumes"]["felled_stems"] == 1
    assert "conserve" in space["members_note"] and "métier" in space["profile_note"]


@pytest.mark.parametrize(
    ("member", "status"),
    [(50, 409), (51, 409), (12, 409), (999, 404)],
)
def test_a_cooperative_member_must_be_an_active_company_or_community(client, fake, member, status):
    resp = client.post(
        "/api/cooperative/members", json={"member_org_id": member}, headers=_auth(COOP)
    )
    assert resp.status_code == status, resp.text


def test_joining_date_cannot_be_in_the_future(client, fake):
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    resp = client.post(
        "/api/cooperative/members",
        json={"member_org_id": 11, "joined_on": tomorrow},
        headers=_auth(COOP),
    )
    assert resp.status_code == 422


def test_suspension_and_leaving_need_a_reason_and_a_former_member_is_kept(client, fake):
    mid = client.post(
        "/api/cooperative/members", json={"member_org_id": 11}, headers=_auth(COOP)
    ).json()["id"]
    url = f"/api/cooperative/members/{mid}"
    assert client.patch(url, json={"status": "suspendue"}, headers=_auth(COOP)).status_code == 422
    suspended = client.patch(
        url, json={"status": "suspendue", "reason": "Cotisation"}, headers=_auth(COOP)
    )
    assert suspended.json()["status"] == "suspendue"
    space = client.get("/api/cooperative/space", headers=_auth(COOP)).json()
    assert space["counts"]["suspendue"] == 1 and space["members"][0]["aggregate"] is None
    assert space["totals"]["titles"]["total"] == 0
    left = client.patch(url, json={"status": "sortie", "reason": "Départ"}, headers=_auth(COOP))
    assert left.json()["status"] == "sortie" and left.json()["left_on"] == date.today().isoformat()
    assert client.patch(url, json={"status": "active"}, headers=_auth(COOP)).status_code == 409
    current = client.get(
        "/api/cooperative/members?include_former=false", headers=_auth(COOP)
    ).json()
    assert current == []
    rejoin = client.post(
        "/api/cooperative/members", json={"member_org_id": 11}, headers=_auth(COOP)
    )
    assert rejoin.status_code == 201


def test_leaving_date_must_follow_joining(client, fake):
    mid = client.post(
        "/api/cooperative/members",
        json={"member_org_id": 10, "joined_on": "2026-01-10"},
        headers=_auth(COOP),
    ).json()["id"]
    resp = client.patch(
        f"/api/cooperative/members/{mid}",
        json={"status": "sortie", "reason": "x", "left_on": "2025-12-31"},
        headers=_auth(COOP),
    )
    assert resp.status_code == 422


def test_member_detail_is_read_only_and_scoped_to_the_cooperative(client, fake):
    mid = client.post(
        "/api/cooperative/members", json={"member_org_id": 10}, headers=_auth(COOP)
    ).json()["id"]
    detail = client.get(f"/api/cooperative/members/{mid}", headers=_auth(COOP)).json()
    assert detail["aggregate"]["logs"]["total"] == 2
    assert detail["felled_by_species"][0]["species"] == "Aucoumea klaineana"
    fake.memberships[mid]["cooperative_org_id"] = 51
    assert client.get(f"/api/cooperative/members/{mid}", headers=_auth(COOP)).status_code == 404


def test_ministry_adds_and_ends_a_membership(client, fake):
    resp = client.post(
        "/api/organizations/50/members", json={"member_org_id": 10}, headers=_auth(ADMIN)
    )
    assert resp.status_code == 201 and resp.json()["added_via"] == "ministere"
    mid = resp.json()["id"]
    end = client.patch(
        f"/api/organizations/50/members/{mid}",
        json={"status": "sortie", "reason": "Radiation"},
        headers=_auth(ADMIN),
    )
    assert end.status_code == 200 and end.json()["status"] == "sortie"
    not_coop = client.post(
        "/api/organizations/10/members", json={"member_org_id": 11}, headers=_auth(ADMIN)
    )
    assert not_coop.status_code == 409
    assert (
        client.patch(
            f"/api/organizations/51/members/{mid}", json={"status": "active"}, headers=_auth(ADMIN)
        ).status_code
        == 404
    )


def test_roles_and_unlinked_accounts(client, fake):
    assert client.get("/api/cooperative/space", headers=_auth(COMPANY)).status_code == 403
    assert client.get("/api/cooperative/space", headers=_auth(ORPHAN_COOP)).status_code == 409
    assert (
        client.post(
            "/api/organizations/50/members", json={"member_org_id": 10}, headers=_auth(COOP)
        ).status_code
        == 403
    )


def test_cooperative_uploads_only_its_own_organisation_documents(client, fake):
    resp = client.post(
        "/api/documents/upload",
        json={"scope_type": "title", "scope_id": 1, "doc_type": "statuts_cooperative"},
        headers=_auth(COOP),
    )
    assert resp.status_code == 403
