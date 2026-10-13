"""QR plate as a ruler (Slice 16): distance from the plate, DBH, auto tree link."""

import io

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import v1
from app.core.geometry import focal_px_from_35mm, silhouette_px_for_trunk
from app.services import qr_plate
from tests.test_golden_regression import install_v1_fakes
from tests.test_scan_ai import _COMPANY, _auth

W, H, F35 = 3264, 2448, 26  # 8 MP photo, as a phone sends it
FOCAL = focal_px_from_35mm(F35, W, H)


def _scene(diameter_cm=55.0, distance_m=2.0, plate_cm=8.0, code="GA-OWN", seed=3):
    """Textured forest, circular trunk, QR plate nailed at breast height."""
    rng = np.random.default_rng(seed)
    blocks = rng.integers(0, 255, (H // 20, W // 20, 3)).astype(np.uint8)
    img = 70.0 + cv2.resize(blocks, (W, H), interpolation=cv2.INTER_CUBIC) * 0.5
    px = silhouette_px_for_trunk(diameter_cm, distance_m, FOCAL)
    x0, x1 = int(W / 2 - px / 2), int(W / 2 + px / 2)
    img[:, x0:x1] = (60.0, 50.0, 40.0)
    img = np.clip(img + rng.integers(-6, 7, img.shape), 0, 255).astype(np.uint8)
    if code:
        symbol_px = FOCAL * plate_cm / 100.0 / distance_m
        qr = cv2.QRCodeEncoder.create().encode(code)  # 21 modules + 2-module quiet zone
        modules = qr.shape[0]
        total = round(symbol_px * modules / (modules - 4))
        tag = cv2.cvtColor(
            cv2.resize(qr, (total, total), interpolation=cv2.INTER_NEAREST), cv2.COLOR_GRAY2BGR
        )
        y, x = H // 2 - total // 2, W // 2 - total // 2
        img[y : y + total, x : x + total] = tag
    return img


def _jpeg(img):
    buf = io.BytesIO()
    exif = Image.Exif()
    exif.get_ifd(0x8769)[0xA405] = F35
    Image.fromarray(img[:, :, ::-1]).save(buf, "JPEG", quality=95, exif=exif)
    return buf.getvalue()


def test_plate_gives_the_distance():
    reading = qr_plate.detect(_scene(distance_m=2.0))
    assert reading is not None and reading.code == "GA-OWN"
    assert qr_plate.distance_m(reading, FOCAL, 8.0) == pytest.approx(2.0, rel=0.03)


@pytest.mark.parametrize("distance", [1.5, 3.0])
def test_plate_distance_scales(distance):
    reading = qr_plate.detect(_scene(distance_m=distance))
    assert qr_plate.distance_m(reading, FOCAL, 8.0) == pytest.approx(distance, rel=0.04)


def test_unreliable_plate_readings_are_refused():
    tiny = qr_plate.PlateReading(code="X", side_px=20.0, center=(0, 0), spread=0.0)
    oblique = qr_plate.PlateReading(code="X", side_px=120.0, center=(0, 0), spread=0.4)
    assert qr_plate.distance_m(tiny, FOCAL, 8.0) is None
    assert qr_plate.distance_m(oblique, FOCAL, 8.0) is None
    assert qr_plate.distance_m(None, FOCAL, 8.0) is None


def test_no_plate_no_reading():
    assert qr_plate.detect(_scene(code=None)) is None


def _post(client, image_bytes, headers=None, **extra):
    data = {"latitude": "0.4162", "longitude": "9.4541", "organs": "dbh", **extra}
    return client.post(
        "/api/v1/process-scan",
        data=data,
        files={"images": ("dbh.jpg", io.BytesIO(image_bytes), "image/jpeg")},
        headers=headers or {},
    )


def test_scan_measures_with_the_plate_and_links_the_tree(monkeypatch):
    from app.main import app

    install_v1_fakes(monkeypatch)
    from app.services import vision

    monkeypatch.setattr(v1, "measure_dbh", vision.measure_dbh)  # real geometry
    headers = _auth(monkeypatch, _COMPANY)
    body = _post(TestClient(app), _jpeg(_scene()), headers=headers).json()
    assert body["distance_source"] == "qr"
    assert body["distance_m"] == pytest.approx(2.0, rel=0.03)
    assert body["measurement_notes"][0] == "depth_qr_plate"
    assert body["tree_code"] == "GA-OWN"
    assert body["measured_dbh_cm"] == pytest.approx(55.0, rel=0.05)


def test_plate_of_unknown_tree_still_measures(monkeypatch):
    from app.main import app

    install_v1_fakes(monkeypatch)
    from app.services import vision

    monkeypatch.setattr(v1, "measure_dbh", vision.measure_dbh)
    headers = _auth(monkeypatch, _COMPANY)
    body = _post(TestClient(app), _jpeg(_scene(code="GA-NOPE")), headers=headers).json()
    assert body["distance_source"] == "qr"
    assert body["tree_code"] is None
    assert "qr_tree_unknown" in body["measurement_notes"]
