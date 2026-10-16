import io
import types

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import v1
from app.core.deps import get_optional_user
from app.main import app


def _jpg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (40, 120, 40)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client():
    app.dependency_overrides[get_optional_user] = lambda: {"id": 7, "role": "operator"}
    yield TestClient(app)
    app.dependency_overrides.pop(get_optional_user, None)


def test_requires_sign_in():
    app.dependency_overrides.pop(get_optional_user, None)
    resp = TestClient(app).post(
        "/api/v1/identify-plant", files=[("images", ("a.jpg", _jpg(), "image/jpeg"))]
    )
    assert resp.status_code == 401


def test_returns_ranked_candidates_without_storing(client, monkeypatch):
    seen = {}

    async def fake_identify(views, lat, lon):
        seen["organs"] = [v["organ"] for v in views]
        seen["coords"] = (lat, lon)
        return (
            "Aucoumea klaineana",
            0.81,
            [{"scientific_name": "Aucoumea klaineana", "score": 0.81, "combined": 0.9}],
            "k-world-flora",
        )

    monkeypatch.setattr(v1, "_identify_species", fake_identify)
    resp = client.post(
        "/api/v1/identify-plant",
        files=[
            ("images", ("a.jpg", _jpg(), "image/jpeg")),
            ("images", ("b.jpg", _jpg(), "image/jpeg")),
        ],
        data={"organs": ["feuille", "fleur"], "latitude": "0.39", "longitude": "9.45"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scientific_name"] == "Aucoumea klaineana"
    assert body["candidates"][0]["combined"] == 0.9
    assert seen == {"organs": ["leaf", "flower"], "coords": (0.39, 9.45)}


def test_rejects_too_many_photos(client):
    files = [("images", (f"{i}.jpg", _jpg(), "image/jpeg")) for i in range(6)]
    assert client.post("/api/v1/identify-plant", files=files).status_code == 422


def test_unavailable_without_plantnet_key(client, monkeypatch):
    async def nothing(views, lat, lon):
        return None, None, [], None

    monkeypatch.setattr(v1, "_identify_species", nothing)
    monkeypatch.setattr(v1.get_settings(), "plantnet_api_key", "")
    resp = client.post(
        "/api/v1/identify-plant", files=[("images", ("a.jpg", _jpg(), "image/jpeg"))]
    )
    assert resp.status_code == 503


def test_client_log_is_accepted_and_logged(client, caplog):
    with caplog.at_level("WARNING"):
        resp = client.post(
            "/api/v1/client-log",
            json={"kind": "slow_boot", "message": "démarrage lent", "timings_ms": {"fonts": 120}},
        )
    assert resp.status_code == 204
    assert "slow_boot" in caplog.text and '"user_id": 7' in caplog.text


def test_goes_through_view_selection_and_reranking(client, monkeypatch):
    calls = {}

    async def fake_regional(images, organs, lang="fr"):
        calls["organs"] = organs
        return types.SimpleNamespace(
            scientific_name="Mangifera indica",
            score=0.62,
            candidates=[{"scientific_name": "Mangifera indica", "score": 0.62}],
            project="k-west-central-tropical-africa",
        )

    async def fake_rerank(candidates, lat, lon):
        return [{**c, "combined": c["score"]} for c in candidates]

    monkeypatch.setattr(v1.plantnet, "identify_regional", fake_regional)
    monkeypatch.setattr(v1.species_rank, "rerank", fake_rerank)
    resp = client.post(
        "/api/v1/identify-plant",
        files=[("images", ("a.jpg", _jpg(), "image/jpeg"))],
        data={"organs": ["leaf"]},
    )
    assert resp.status_code == 200
    assert resp.json()["scientific_name"] == "Mangifera indica"
    assert calls["organs"] == ["leaf"]
