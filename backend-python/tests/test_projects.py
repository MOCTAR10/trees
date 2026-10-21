"""Projects API (DB mocked)."""

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.core import security
from app.main import app
from app.services import db


def _token(user_row: dict) -> str:
    return security.create_access_token(
        user_row["email"], user_row["role"], user_row["id"], get_settings().jwt_secret, 3600
    )


def _auth(user_row: dict) -> dict:
    return {"Authorization": f"Bearer {_token(user_row)}"}


USERS = {
    1: {
        "id": 1,
        "email": "admin@x",
        "display_name": "Admin",
        "role": "admin",
        "is_active": True,
        "cooperative_id": None,
        "company_id": None,
    },
    2: {
        "id": 2,
        "email": "company@x",
        "display_name": "Bois & Cie",
        "role": "company",
        "is_active": True,
        "cooperative_id": None,
        "company_id": None,
    },
    4: {
        "id": 4,
        "email": "field@x",
        "display_name": "Field",
        "role": "operator",
        "is_active": True,
        "cooperative_id": None,
        "company_id": 2,
    },
}


def _install(monkeypatch):
    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            u = USERS.get(args[0])
            return {k: v for k, v in u.items() if k != "password_hash"} if u else None
        if "insert into projects" in s:
            return {
                "id": 1,
                "title": args[0],
                "description": args[1],
                "target_type": args[2],
                "target_value": args[3],
                "objective": args[4],
                "latitude": args[5],
                "longitude": args[6],
                "radius_km": args[7],
                "status": "open",
                "created_by": args[8],
                "created_at": "2026-01-01T00:00:00Z",
            }
        return None

    async def fetch_all(sql, *args):
        return []

    async def execute(sql, *args):
        return "OK"

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    monkeypatch.setattr(db, "execute", execute)


@pytest.fixture
def client():
    return TestClient(app)


def test_projects_require_auth(client):
    assert client.get("/api/projects").status_code == 401


def test_operator_cannot_create_project(client, monkeypatch):
    _install(monkeypatch)
    resp = client.post("/api/projects", json={"title": "X"}, headers=_auth(USERS[4]))
    assert resp.status_code == 403


def test_admin_can_create_project(client, monkeypatch):
    _install(monkeypatch)
    resp = client.post(
        "/api/projects",
        json={
            "title": "Cartographier l'Okoumé",
            "target_type": "species",
            "target_value": "Aucoumea klaineana",
        },
        headers=_auth(USERS[1]),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Cartographier l'Okoumé"


def test_old_scans_cannot_be_attached_to_a_project(client, monkeypatch):
    _install(monkeypatch)
    resp = client.post("/api/projects/1/attribute", json={"scan_id": 10}, headers=_auth(USERS[4]))
    assert resp.status_code == 404
