"""Self-hosted OTA updates (Expo Updates protocol v1): manifest, signature, assets."""

import base64
import json
import re

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def ota(tmp_path, monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key_file = tmp_path / "private-key.pem"
    key_file.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    for build, code in (("3", b"old bundle"), ("12", b"new bundle")):
        root = tmp_path / "updates" / "0.1.0" / build
        (root / "_expo/static/js/android").mkdir(parents=True)
        (root / "assets").mkdir()
        (root / "_expo/static/js/android/entry-1.hbc").write_bytes(code)
        (root / "assets/abc123").write_bytes(b"\x89PNG fake")
        (root / "metadata.json").write_text(
            json.dumps(
                {
                    "version": 0,
                    "bundler": "metro",
                    "fileMetadata": {
                        "android": {
                            "bundle": "_expo/static/js/android/entry-1.hbc",
                            "assets": [{"path": "assets/abc123", "ext": "png"}],
                        }
                    },
                    "build": build,
                }
            )
        )
        (root / "expoConfig.json").write_text(json.dumps({"name": "Foresterie Numérique"}))
    monkeypatch.setenv("UPDATES_DIR", str(tmp_path / "updates"))
    monkeypatch.setenv("UPDATES_PRIVATE_KEY", str(key_file))
    return key.public_key()


def _parts(resp) -> dict[str, tuple[dict, str]]:
    boundary = re.search(r"boundary=(\S+)", resp.headers["content-type"]).group(1)
    out = {}
    for chunk in resp.text.split(f"--{boundary}")[1:-1]:
        head, body = chunk.strip("\r\n").split("\r\n\r\n", 1)
        headers = dict(line.split(": ", 1) for line in head.split("\r\n"))
        name = re.search(r'name="(\w+)"', headers["Content-Disposition"]).group(1)
        out[name] = (headers, body)
    return out


HEADERS = {
    "expo-platform": "android",
    "expo-runtime-version": "0.1.0",
    "expo-protocol-version": "1",
    "expo-expect-signature": 'sig, keyid="main", alg="rsa-v1_5-sha256"',
}


def test_manifest_is_the_newest_build_and_signed(ota):
    resp = TestClient(app).get("/updates/manifest", headers=HEADERS)
    assert resp.status_code == 200
    assert resp.headers["expo-protocol-version"] == "1"
    headers, body = _parts(resp)["manifest"]
    manifest = json.loads(body)
    assert manifest["runtimeVersion"] == "0.1.0"
    assert manifest["metadata"] == {"build": "12"}
    assert manifest["extra"]["expoClient"]["name"] == "Foresterie Numérique"
    assert manifest["launchAsset"]["url"].endswith(
        "asset=0.1.0/12/_expo/static/js/android/entry-1.hbc"
    )
    assert manifest["assets"][0]["fileExtension"] == ".png"
    sig = re.search(r'sig="([^"]+)"', headers["expo-signature"]).group(1)
    ota.verify(base64.b64decode(sig), body.encode(), padding.PKCS1v15(), hashes.SHA256())


def test_assets_are_served_with_the_hash_the_manifest_announces(ota):
    client = TestClient(app)
    manifest = json.loads(_parts(client.get("/updates/manifest", headers=HEADERS))["manifest"][1])
    url = manifest["launchAsset"]["url"].split("/updates/", 1)[1]
    data = client.get(f"/updates/{url}").content
    assert data == b"new bundle"
    digest = (
        base64.urlsafe_b64encode(__import__("hashlib").sha256(data).digest()).decode().rstrip("=")
    )
    assert digest == manifest["launchAsset"]["hash"]


def test_no_update_when_the_phone_already_runs_it(ota):
    client = TestClient(app)
    manifest = json.loads(_parts(client.get("/updates/manifest", headers=HEADERS))["manifest"][1])
    resp = client.get(
        "/updates/manifest", headers={**HEADERS, "expo-current-update-id": manifest["id"]}
    )
    headers, body = _parts(resp)["directive"]
    assert json.loads(body) == {"type": "noUpdateAvailable"}
    assert "expo-signature" in headers


def test_other_runtime_gets_no_update(ota):
    resp = TestClient(app).get(
        "/updates/manifest", headers={**HEADERS, "expo-runtime-version": "9.9.9"}
    )
    assert json.loads(_parts(resp)["directive"][1]) == {"type": "noUpdateAvailable"}


def test_bad_requests_are_refused(ota):
    client = TestClient(app)
    assert client.get("/updates/manifest").status_code == 400
    assert client.get("/updates/assets?asset=../private-key.pem").status_code == 404
    traversal = client.get("/updates/manifest", headers={**HEADERS, "expo-runtime-version": "../x"})
    assert json.loads(_parts(traversal)["directive"][1]) == {"type": "noUpdateAvailable"}


def test_not_configured_is_404(monkeypatch):
    monkeypatch.setenv("UPDATES_DIR", "")
    assert TestClient(app).get("/updates/manifest", headers=HEADERS).status_code == 404
