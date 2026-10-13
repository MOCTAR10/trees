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


calls: list = []


@pytest.fixture
def client(monkeypatch):
    calls.clear()
    map_api._cache.clear()

    async def fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return USER
        if "from gfw_features where id" in s:
            return {
                "id": args[0],
                "layer": args[1],
                "name": "Lopé",
                "attrs": '{"iucn_cat": "II"}',
                "area_ha": 491291.44,
                "lat": -0.5,
                "lon": 11.5,
            }
        return None

    async def fetch_all(sql, *args):
        s = " ".join(sql.split()).lower()
        if "union all" in s:
            return [
                {
                    "kind": "gfw",
                    "layer": "protected_areas",
                    "id": 5,
                    "name": "Parc national de la Lopé",
                }
            ]
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
        if "count(*) as n from gfw_features" in s:
            return [{"layer": "protected_areas", "n": 61}]
        if "from gfw_features where layer = $1" in s:
            calls.append(args)
            if args[0] != "protected_areas":
                return []
            return [{"id": 5, "name": "Lopé", "subtitle": "Parc national", "geojson": SQUARE}]
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
    assert park["properties"] == {
        "id": 5,
        "name": "Lopé",
        "subtitle": "Parc national",
        "layer": "protected_areas",
    }
    assert body["counts"] == {"protected_areas": 61}
    assert body["labels"]["protected_areas"].startswith("Aires protégées")


def test_layers_follow_viewport_and_zoom(client):
    body = client.get(
        "/api/map/layers?zoom=12&bbox=11.4,-0.3,11.6,-0.1&layers=protected_areas", headers=_auth()
    ).json()
    assert list(body["layers"]) == ["protected_areas"]
    assert body["tolerance"] == map_api.tolerance_for(12)
    assert calls[-1] == ("protected_areas", 11.4, -0.3, 11.6, -0.1)


def test_zoom_bands_and_bbox_validation(client):
    assert map_api.tolerance_for(5) > map_api.tolerance_for(9) > map_api.tolerance_for(14)
    assert client.get("/api/map/layers?bbox=1,2,3", headers=_auth()).status_code == 422
    assert client.get("/api/map/layers?bbox=12,0,11,1", headers=_auth()).status_code == 422


def test_feature_detail_and_search(client):
    detail = client.get("/api/map/feature/protected_areas/5", headers=_auth()).json()
    assert detail["attrs"] == {"iucn_cat": "II"} and detail["area_ha"] == 491291.4
    assert client.get("/api/map/feature/nope/5", headers=_auth()).status_code == 404
    found = client.get("/api/map/search?q=lop", headers=_auth()).json()
    assert found[0]["name"] == "Parc national de la Lopé"
    assert client.get("/api/map/search?q=l", headers=_auth()).status_code == 422


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
