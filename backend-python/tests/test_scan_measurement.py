"""Tree measurement (Slice 14): DBH reference vs vision, focal resolution, carbon."""

import io
import math
import types

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import v1
from app.core.geometry import focal_px_from_35mm
from app.main import app
from tests.test_golden_regression import _png, install_v1_fakes


@pytest.fixture
def client():
    return TestClient(app)


def _view(organ: str = "dbh", width: int = 640, height: int = 480, data: bytes = b"") -> dict:
    return {
        "bytes": data,
        "organ": organ,
        "azimuth": None,
        "bgr": np.zeros((height, width, 3), dtype=np.uint8),
        "sharpness": 100.0,
    }


def _jpeg_with_focal(focal_35mm: int) -> bytes:
    img = Image.new("RGB", (64, 48), (90, 60, 30))
    exif = Image.Exif()
    exif.get_ifd(0x8769)[0xA405] = focal_35mm
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def _fake_measure(dbh: float, touches: bool = False, method: str = "opencv_fallback"):
    return types.SimpleNamespace(dbh_cm=dbh, method=method, confidence=0.8, touches_frame=touches)


# ── focal resolution ────────────────────────────────────────────────────


def test_focal_prefers_client_pixels():
    assert v1._resolve_focal(_view(), 2200.0, 26.0) == (2200.0, "focal_client")


def test_focal_from_client_35mm():
    focal, source = v1._resolve_focal(_view(), None, 26.0)
    assert source == "focal_client"
    assert math.isclose(focal, focal_px_from_35mm(26.0, 640, 480))


def test_focal_read_from_exif():
    view = _view(data=_jpeg_with_focal(28))
    focal, source = v1._resolve_focal(view, None, None)
    assert source == "focal_exif"
    assert math.isclose(focal, focal_px_from_35mm(28.0, 640, 480))


def test_focal_default_is_flagged_estimated():
    focal, source = v1._resolve_focal(_view(data=_png()), None, None)
    assert source == "focal_estimated"
    assert focal > 0


# ── DBH resolution ──────────────────────────────────────────────────────


def test_tape_reference_wins_and_vision_is_cross_check(monkeypatch):
    monkeypatch.setattr(v1, "measure_dbh", lambda img, depth_m, focal_px: _fake_measure(66.0))
    res = v1._resolve_dbh([_view()], 2.0, 1600.0, None, circumference_cm=200.0, caliper_dbh_cm=None)
    assert res.method == "tape_circumference"
    assert res.dbh_cm == round(200.0 / math.pi, 2)
    assert res.vision_dbh_cm == 66.0
    assert res.discrepancy_pct == round((66.0 - 200.0 / math.pi) / (200.0 / math.pi) * 100, 1)
    assert "reference_tape" in res.notes


def test_caliper_reference_without_depth(monkeypatch):
    monkeypatch.setattr(v1, "measure_dbh", lambda img, depth_m, focal_px: _fake_measure(50.0))
    res = v1._resolve_dbh([_view()], None, None, None, circumference_cm=None, caliper_dbh_cm=48.0)
    assert (res.dbh_cm, res.method, res.vision_dbh_cm) == (48.0, "caliper", None)
    assert "depth_missing" in res.notes
    assert res.discrepancy_pct is None


def test_implausible_vision_is_rejected(monkeypatch):
    # The live DB held a 0.89 cm "DBH" from a segmentation artefact.
    monkeypatch.setattr(v1, "measure_dbh", lambda img, depth_m, focal_px: _fake_measure(0.89))
    res = v1._resolve_dbh([_view()], 1.3, 2200.0, None, None, None)
    assert res.dbh_cm is None
    assert res.method == "unavailable"
    assert "vision_implausible" in res.notes


def test_trunk_wider_than_frame_is_rejected(monkeypatch):
    monkeypatch.setattr(
        v1, "measure_dbh", lambda img, depth_m, focal_px: _fake_measure(140.0, touches=True)
    )
    res = v1._resolve_dbh([_view()], 1.0, 2200.0, None, None, None)
    assert res.dbh_cm is None
    assert "trunk_exceeds_frame" in res.notes


def test_multi_view_median_and_spread(monkeypatch):
    readings = iter([60.0, 64.0, 90.0])
    monkeypatch.setattr(
        v1, "measure_dbh", lambda img, depth_m, focal_px: _fake_measure(next(readings))
    )
    res = v1._resolve_dbh([_view(), _view(), _view()], 2.0, 1600.0, None, None, None)
    assert res.method == "multi_view_median"
    assert res.dbh_cm == 64.0  # median resists the 90 cm outlier
    assert res.uncertainty_cm == 15.0


def test_dbh_shot_preferred_over_bark_closeup(monkeypatch):
    seen = []

    def fake(img, depth_m, focal_px):
        seen.append(img.shape[1])
        return _fake_measure(55.0)

    monkeypatch.setattr(v1, "measure_dbh", fake)
    views = [_view("bark", width=100), _view("dbh", width=640), _view("leaf", width=200)]
    v1._resolve_dbh(views, 2.0, 1600.0, None, None, None)
    assert seen == [640]


def test_leaf_only_scan_never_measures(monkeypatch):
    monkeypatch.setattr(
        v1, "measure_dbh", lambda img, depth_m, focal_px: pytest.fail("leaf measured")
    )
    res = v1._resolve_dbh([_view("leaf")], 2.0, 1600.0, None, None, None)
    assert res.dbh_cm is None
    assert "vision_failed" in res.notes


# ── carbon ──────────────────────────────────────────────────────────────


def test_carbon_stock_uses_ipcc_fractions():
    agb, carbon, co2e = v1._carbon_stock(62.5, "Aucoumea klaineana", None)
    assert agb > 0
    assert carbon > agb * v1.CARBON_FRACTION  # includes below-ground biomass
    assert math.isclose(co2e, carbon * 44.0 / 12.0, rel_tol=1e-3)
    assert v1._carbon_stock(None, "Aucoumea klaineana", None) == (None, None, None)


# ── endpoint ────────────────────────────────────────────────────────────


def _post(client, **extra):
    data = {"latitude": "0.4162", "longitude": "9.4541", **extra}
    return client.post(
        "/api/v1/process-scan",
        data=data,
        files={"trunk_image": ("trunk.png", io.BytesIO(_png()), "image/png")},
    )


def test_endpoint_tape_and_clinometer(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    resp = _post(
        client,
        ar_depth_m="2.0",
        focal_px="2200",
        circumference_cm="196.35",
        measured_height_m="31.5",
        height_source="clinometer",
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["dbh_method"] == "tape_circumference"
    assert body["measured_dbh_cm"] == pytest.approx(62.5, abs=0.01)
    assert body["dbh_vision_cm"] == 62.5
    assert body["dbh_discrepancy_pct"] == pytest.approx(0.0, abs=0.1)
    assert body["estimated_height_m"] == 31.5
    assert body["height_method"] == "clinometer"
    assert body["co2e_kg"] > 0
    assert "reference_tape" in body["measurement_notes"]


def test_endpoint_without_any_dbh_source(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    resp = _post(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["measured_dbh_cm"] is None
    assert body["dbh_method"] == "unavailable"
    assert body["co2e_kg"] is None
    assert "depth_missing" in body["measurement_notes"]


def test_endpoint_rejects_absurd_height(client, monkeypatch):
    install_v1_fakes(monkeypatch)
    resp = _post(client, ar_depth_m="2.0", focal_px="2200", measured_height_m="0.5")
    assert resp.status_code == 200, resp.text
    assert resp.json()["height_method"] == "hd_curve"
