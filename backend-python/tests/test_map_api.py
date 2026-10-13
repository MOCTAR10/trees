"""Map 2.0 API (Slice 16): context, tiles, layers, point check; GFW layer import."""

import json

import pytest
from fastapi.testclient import TestClient

from app.api import map as map_api
from app.config import get_settings
from app.core import security
from app.main import app
from app.services import db, forest_watch
from tools import import_gfw_layers

USER = {
    "id": 1,
    "email": "admin@x",
    "display_name": "Admin",
    "role": "admin",
    "is_active": True,
    "cooperative_id": None,
    "company_id": None,
    "organization_id": None,
}

SQUARE = json.dumps({"type": "Polygon", "coordinates": [[[11, -1], [12, -1], [12, 0], [11, -1]]]})


@pytest.fixture
def client(monkeypatch):
    async def fetch_one(sql, *args):
        return USER if "from users where id" in " ".join(sql.split()).lower() else None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from annual_cut_blocks a" in s:
            return [
                {
                    "id": 21,
                    "label": "DEMO-AAC-2026-01",
                    "status": "ouvert",
                    "campaign_year": 2026,
                    "title_ref": "DEMO-CFAD-01",
                    "holder": "Société Forestière Démo",
                    "geojson": SQUARE,
                }
            ]
        if "from gfw_features where st_covers" in s:
            return [{"layer": "protected_areas", "name": "Lopé"}]
        if "from gfw_features" in s:
            return [
                {
                    "layer": "protected_areas",
                    "name": "Lopé",
                    "attrs": '{"iucn_cat": "II"}',
                    "geojson": SQUARE,
                }
            ]
        return []

    monkeypatch.setattr(db, "fetch_one", fetch_one)
    monkeypatch.setattr(db, "fetch_all", fetch_all)
    return TestClient(app)


def _auth():
    token = security.create_access_token(
        USER["email"], USER["role"], USER["id"], get_settings().jwt_secret, 3600
    )
    return {"Authorization": f"Bearer {token}"}


def test_map_requires_login(client):
    assert client.get("/api/map/tiles").status_code == 401


def test_national_context_is_served(client):
    body = client.get("/api/map/context", headers=_auth()).json()
    keys = {h["key"] for h in body["highlights"]}
    assert {"primary_forest_2001", "natural_forest_2020", "agb_stock_2000"} <= keys
    assert len(body["provinces"]) == 9
    assert body["emissions_by_driver"][0]["label"]


def test_public_gfw_tiles(client):
    tiles = client.get("/api/map/tiles", headers=_auth()).json()
    assert {t["key"] for t in tiles} == {"tree_cover_loss", "radd_alerts"}
    assert all("{z}/{x}/{y}" in t["url"] for t in tiles)


def test_layers_return_geojson(client):
    body = client.get("/api/map/layers", headers=_auth()).json()
    aac = body["layers"]["aac"]["features"][0]
    assert aac["geometry"]["type"] == "Polygon"
    assert aac["properties"]["holder"] == "Société Forestière Démo"
    park = body["layers"]["protected_areas"]["features"][0]
    assert park["properties"]["attrs"] == {"iucn_cat": "II"}
    assert body["labels"]["protected_areas"].startswith("Aires protégées")


def test_point_check_without_key_is_503(client):
    assert client.get("/api/map/point-check?lat=-0.2&lon=11.5", headers=_auth()).status_code == 503


def test_point_check_merges_local_layers(client, monkeypatch):
    async def fake_check(lat, lon):
        return {"verdict": "a_verifier", "flags": ["aire_protegee"]}

    monkeypatch.setattr(forest_watch, "check_point", fake_check)
    body = client.get("/api/map/point-check?lat=-0.2&lon=11.5", headers=_auth()).json()
    assert body["verdict"] == "a_verifier"
    assert body["local_layers"] == [{"layer": "protected_areas", "name": "Lopé"}]


def test_gfw_layer_rows_keep_geometry_and_name():
    rows = import_gfw_layers.to_rows(
        "logging_concessions",
        [
            {"gfw_fid": 7, "company": "Rougier Gabon", "country": "GAB", "gfw_geojson": SQUARE},
            {"gfw_fid": 8, "company": "No geometry"},
        ],
    )
    assert len(rows) == 1
    layer, source_id, name, attrs, geojson = rows[0]
    assert (layer, source_id, name) == ("logging_concessions", "7", "Rougier Gabon")
    assert json.loads(attrs) == {"gfw_fid": 7, "company": "Rougier Gabon", "country": "GAB"}
    assert json.loads(geojson)["type"] == "Polygon"


def test_tiles_list_is_stable():
    assert map_api.GFW_TILES[0]["source"].startswith("UMD")
