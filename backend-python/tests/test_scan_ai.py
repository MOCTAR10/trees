"""Scanner AI (Slice 15): SAM 2.1 mask + Depth Anything distance wiring, QR link."""

import io
import json
import types

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import v1
from app.config import get_settings
from app.services import ai_models
from tests.test_golden_regression import _png, install_v1_fakes
from tests.test_scan_measurement import _view


@pytest.fixture
def client():
    return TestClient(app_instance())


def app_instance():
    from app.main import app

    return app


def _enable_fake_ai(monkeypatch, distance=2.4, mask_value=1):
    calls = {"segment": 0, "depth": 0}

    def segment(bgr):
        calls["segment"] += 1
        mask = np.zeros(bgr.shape[:2], dtype=np.uint8)
        mask[:, bgr.shape[1] // 3 : 2 * bgr.shape[1] // 3] = mask_value
        return mask

    def depth(bgr):
        calls["depth"] += 1
        return np.full(bgr.shape[:2], distance, dtype=np.float32)

    monkeypatch.setattr(ai_models, "enabled", lambda: True)
    monkeypatch.setattr(ai_models, "segment_trunk", segment)
    monkeypatch.setattr(ai_models, "depth_map", depth)
    return calls


# ── distance from the depth map ─────────────────────────────────────────


def test_trunk_distance_uses_near_surface_of_the_trunk():
    depth = np.full((100, 100), 9.0, dtype=np.float32)
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[:, 40:60] = 1
    depth[:, 40:60] = np.linspace(2.0, 2.5, 20)[None, :]
    assert ai_models.trunk_distance_m(depth, mask) == pytest.approx(2.1, abs=0.05)


def test_trunk_distance_rejects_implausible_values():
    assert ai_models.trunk_distance_m(np.full((50, 50), 60.0, np.float32), None) is None
    assert ai_models.trunk_distance_m(np.full((50, 50), 0.1, np.float32), None) is None
    assert ai_models.trunk_distance_m(None, None) is None


def test_pick_trunk_mask_skips_whole_frame_candidate():
    whole = np.ones((50, 50), dtype=np.uint8)
    trunk = np.zeros((50, 50), dtype=np.uint8)
    trunk[:, 20:30] = 1
    best = ai_models._pick_trunk_mask(np.stack([whole, trunk]), np.array([0.99, 0.8]))
    assert np.array_equal(best, trunk)


@pytest.mark.parametrize(("available", "expected"), [(1800.0, False), (8000.0, True), (None, True)])
def test_memory_guard_keeps_api_alive(monkeypatch, available, expected):
    monkeypatch.setenv("AI_MODELS_ENABLED", "true")
    get_settings.cache_clear()
    monkeypatch.setattr(ai_models, "_memory_ok", None)
    monkeypatch.setattr(ai_models, "_available_memory_mb", lambda: available)
    assert ai_models.enabled() is expected
    caps = ai_models.capabilities()
    assert caps["ai_configured"] is True
    assert caps["ai_off_reason"] == (None if expected else "memory")


def test_models_disabled_return_none(monkeypatch):
    frame = np.zeros((32, 32, 3), dtype=np.uint8)
    assert ai_models.segment_trunk(frame) is None
    assert ai_models.depth_map(frame) is None
    assert ai_models.capabilities() == {
        "ai_segmentation": False,
        "ai_distance": False,
        "ai_configured": False,
        "ai_off_reason": "disabled",
    }


# ── orchestration ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prepare_ai_masks_views_and_estimates_distance(monkeypatch):
    calls = _enable_fake_ai(monkeypatch, distance=2.4)
    views = [_view("dbh"), _view("leaf")]
    distance = await v1._prepare_ai(views, None)
    assert distance == pytest.approx(2.4)
    assert views[0]["ai_mask"] is not None
    assert "ai_mask" not in views[1]
    assert calls == {"segment": 1, "depth": 1}


@pytest.mark.asyncio
async def test_prepare_ai_keeps_typed_distance(monkeypatch):
    calls = _enable_fake_ai(monkeypatch)
    assert await v1._prepare_ai([_view("dbh")], 3.0) is None
    assert calls["depth"] == 0


def test_mask_is_forwarded_to_measurement(monkeypatch):
    seen = {}

    def fake(img, depth_m, focal_px, mask=None):
        seen["mask"] = mask
        return types.SimpleNamespace(
            dbh_cm=55.0, method="sam2_opencv", confidence=0.9, touches_frame=False
        )

    monkeypatch.setattr(v1, "measure_dbh", fake)
    view = _view("dbh")
    view["ai_mask"] = np.ones((480, 640), dtype=np.uint8)
    res = v1._resolve_dbh([view], 2.0, 1600.0, None, None, None)
    assert res.method == "sam2_opencv"
    assert seen["mask"] is view["ai_mask"]


# ── endpoint ────────────────────────────────────────────────────────────


def _post(client, headers=None, **extra):
    data = {"latitude": "0.4162", "longitude": "9.4541", "organs": "dbh", **extra}
    return client.post(
        "/api/v1/process-scan",
        data=data,
        files={"images": ("dbh.png", io.BytesIO(_png()), "image/png")},
        headers=headers or {},
    )


def test_endpoint_auto_distance(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    _enable_fake_ai(monkeypatch, distance=2.4)
    body = _post(client, focal_px="2200").json()
    assert body["distance_m"] == pytest.approx(2.4)
    assert body["distance_source"] == "ai"
    assert body["measurement_notes"][0] == "depth_ai_estimated"
    assert "ai_segmentation" in body["measurement_notes"]
    assert body["measured_dbh_cm"] == 62.5


def test_low_confidence_species_is_not_asserted(client, monkeypatch):
    install_v1_fakes(monkeypatch)

    async def weak_identify(**kwargs):
        return types.SimpleNamespace(scientific_name="Albizia ferruginea", score=0.009)

    monkeypatch.setattr(
        v1,
        "plantnet",
        types.SimpleNamespace(identify=weak_identify, identify_regional=weak_identify),
    )
    body = _post(client, circumference_cm="196").json()
    assert body["species_scientific_name"] is None
    assert body["species_confidence"] == 0.009
    assert "species_low_confidence" in body["measurement_notes"]
    assert body["co2e_kg"] > 0  # carbon still computed with the default wood density


def test_capabilities_reflect_settings(client, monkeypatch):
    assert client.get("/api/v1/capabilities").json()["ai_distance"] is False
    monkeypatch.setenv("AI_MODELS_ENABLED", "true")
    get_settings.cache_clear()
    caps = client.get("/api/v1/capabilities").json()
    assert caps["ai_segmentation"] is True and caps["ai_distance"] is True


def _auth(monkeypatch, user: dict):
    from app.config import get_settings
    from app.core import security

    async def fake_fetch_one(sql, *args):
        s = " ".join(sql.split()).lower()
        if "from users where id" in s:
            return user
        if "from tree_registry" in s:
            if args[0] == "GA-OWN":
                return {"tree_code": "GA-OWN", "company_id": 7}
            return None
        return None

    monkeypatch.setattr(v1.db, "fetch_one", fake_fetch_one)
    monkeypatch.setattr("app.core.deps.db.fetch_one", fake_fetch_one)
    token = security.create_access_token(
        user["email"], user["role"], user["id"], get_settings().jwt_secret, 3600
    )
    return {"Authorization": f"Bearer {token}"}


_COMPANY = {
    "id": 7,
    "email": "co@x",
    "display_name": "Co",
    "role": "company",
    "is_active": True,
    "cooperative_id": None,
    "company_id": None,
    "organization_id": 10,
}


def test_scan_links_own_registry_tree(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    persisted = {}

    async def fake_execute(sql, *args):
        persisted["args"] = args
        return "INSERT 0 1"

    monkeypatch.setattr(v1.db, "execute", fake_execute)
    headers = _auth(monkeypatch, _COMPANY)
    resp = _post(client, headers=headers, circumference_cm="196", tree_code=" GA-OWN ")
    assert resp.status_code == 200, resp.text
    assert resp.json()["tree_code"] == "GA-OWN"
    assert "GA-OWN" in persisted["args"]


def test_unknown_code_scanned_by_a_company_is_inventoried(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    calls = []

    async def fake_execute(sql, *args):
        calls.append((" ".join(sql.split()).lower(), args))
        return "INSERT 0 1"

    monkeypatch.setattr(v1.db, "execute", fake_execute)
    headers = _auth(monkeypatch, _COMPANY)
    resp = _post(client, headers=headers, circumference_cm="196", tree_code="GA-NEW-001")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tree_code"] == "GA-NEW-001"
    assert "tree_inventoried" in body["measurement_notes"]
    registry = [a for s, a in calls if s.startswith("insert into tree_registry")]
    assert registry and registry[0][0] == "GA-NEW-001"
    assert "'inventorie'" in next(s for s, _ in calls if s.startswith("insert into tree_registry"))
    assert registry[0][5] == 7 and registry[0][9] == 10
    scan = [a for s, a in calls if s.startswith("insert into tree_scans")]
    assert "GA-NEW-001" in scan[0]


def test_scan_link_rules(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    assert _post(client, tree_code="GA-OWN").status_code == 401
    coop = {**_COMPANY, "id": 9, "email": "coop@x", "role": "cooperative"}
    headers = _auth(monkeypatch, coop)
    assert _post(client, headers=headers, tree_code="GA-NOPE").status_code == 404
    headers = _auth(monkeypatch, _COMPANY)
    assert _post(client, headers=headers, tree_code="x").status_code == 404
    other = {**_COMPANY, "id": 8, "email": "other@x"}
    headers = _auth(monkeypatch, other)
    assert _post(client, headers=headers, tree_code="GA-OWN").status_code == 403


# ── labelled media (training data flywheel) ─────────────────────────────


def test_reference_scan_keeps_labelled_media(tmp_path, monkeypatch):
    monkeypatch.setenv("SCAN_MEDIA_DIR", str(tmp_path))
    view = _view("dbh", data=b"jpeg-bytes")
    view["ai_mask"] = np.ones((480, 640), dtype=np.uint8)
    dbh = v1.DbhResolution(62.4, "tape_circumference", 0.98, vision_dbh_cm=60.0)
    key = v1._save_labelled_media([view], dbh)
    folder = tmp_path / key
    assert (folder / "dbh.jpg").read_bytes() == b"jpeg-bytes"
    assert (folder / "mask.png").exists()
    label = json.loads((folder / "label.json").read_text(encoding="utf-8"))
    assert label["dbh_cm"] == 62.4 and label["method"] == "tape_circumference"


def test_vision_only_scan_keeps_no_media(tmp_path, monkeypatch):
    monkeypatch.setenv("SCAN_MEDIA_DIR", str(tmp_path))
    dbh = v1.DbhResolution(55.0, "opencv_edge_profile", 0.8, vision_dbh_cm=55.0)
    assert v1._save_labelled_media([_view("dbh")], dbh) is None
    assert list(tmp_path.iterdir()) == []


def test_sensor_distance_wins_over_typed_and_is_noted(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    body = _post(client, focal_px="2200", ar_depth_m="2.05", depth_source="lidar").json()
    assert body["distance_source"] == "lidar"
    assert body["distance_m"] == pytest.approx(2.05)
    assert body["measurement_notes"][0] == "depth_sensor"
    typed = _post(client, focal_px="2200", ar_depth_m="2.05", depth_source="bogus").json()
    assert typed["distance_source"] == "typed"


def test_operator_edges_measure_the_dbh_offline_style(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    monkeypatch.setattr(
        v1, "measure_dbh", lambda *a, **k: pytest.fail("edges given: no segmentation")
    )
    # 8x8 test image, f = 8 px: edges at 0.30 / 0.70 of the width, bark at 2 m.
    import math

    width, f, z = 8, 8.0, 2.0
    expected = None
    a_l, a_r = math.atan((0.3 * width - 4) / f), math.atan((0.7 * width - 4) / f)
    s_ = math.sin((a_r - a_l) / 2)
    expected = 2 * z * 100 * s_ / (1 - s_)
    body = _post(
        client, focal_px=str(f), ar_depth_m=str(z), edge_left="0.30", edge_right="0.70"
    ).json()
    assert body["dbh_method"] == "operator_edges"
    assert body["measured_dbh_cm"] == pytest.approx(expected, abs=0.01)
    assert "edges_operator" in body["measurement_notes"]


def test_operator_edges_at_the_frame_border_are_refused(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    body = _post(client, focal_px="8", ar_depth_m="2", edge_left="0.0", edge_right="0.6").json()
    assert body["measured_dbh_cm"] is None
    assert "trunk_exceeds_frame" in body["measurement_notes"]
