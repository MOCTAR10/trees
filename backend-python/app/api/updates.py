"""Self-hosted over-the-air updates of the mobile app (Expo Updates protocol v1).

Jenkins exports each update (``expo export --platform android``) into
``UPDATES_DIR/<runtimeVersion>/<build>/`` (``metadata.json``, ``expoConfig.json``,
the Hermes bundle and the assets). The phone asks ``GET /updates/manifest`` with its
runtime version; it gets the newest build of that runtime as a **signed** manifest
(RSA-SHA256 with the server's key — the app only accepts manifests signed by the
certificate it embeds), or a « no update » directive when it already runs it.
Assets are served by ``GET /updates/assets``. These routes sit outside ``/api``:
nginx sends ``/updates/`` straight to the API (no gateway key, the bundle is public).
"""

import base64
import hashlib
import json
import mimetypes
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response

from app.config import get_settings

router = APIRouter()

BOUNDARY = "foresterie-update-boundary"
_CONTENT_TYPES = {".hbc": "application/javascript", ".bundle": "application/javascript"}


def _root() -> Path:
    directory = get_settings().updates_dir
    if not directory:
        raise HTTPException(status_code=404, detail="Mises à jour non configurées")
    return Path(directory)


def latest_update_dir(runtime: str) -> Path | None:
    """Newest numbered build of a runtime version (``<runtime>/<build>``)."""
    base = _root() / runtime
    if not base.is_dir() or "/" in runtime or "\\" in runtime or runtime.startswith("."):
        return None
    builds = [p for p in base.iterdir() if p.is_dir() and p.name.isdigit()]
    return max(builds, key=lambda p: int(p.name)) if builds else None


def _b64url_sha256(data: bytes) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("=")


def _asset(update: Path, rel: str, ext: str | None, base_url: str, launch: bool) -> dict:
    data = (update / rel).read_bytes()
    suffix = f".{ext}" if ext else Path(rel).suffix
    content_type = (
        "application/javascript"
        if launch
        else _CONTENT_TYPES.get(suffix)
        or mimetypes.guess_type(f"x{suffix}")[0]
        or "application/octet-stream"
    )
    item = {
        "hash": _b64url_sha256(data),
        "key": hashlib.md5(data).hexdigest(),
        "contentType": content_type,
        "url": f"{base_url}/updates/assets?asset={update.parent.name}/{update.name}/{rel}",
    }
    if not launch:
        item["fileExtension"] = suffix
    return item


def build_manifest(update: Path, platform: str, base_url: str) -> dict:
    metadata = json.loads((update / "metadata.json").read_text(encoding="utf-8"))
    files = metadata["fileMetadata"][platform]
    config_file = update / "expoConfig.json"
    expo_config = (
        json.loads(config_file.read_text(encoding="utf-8")) if config_file.exists() else {}
    )
    digest = hashlib.sha256((update / "metadata.json").read_bytes()).hexdigest()
    created = datetime.fromtimestamp((update / "metadata.json").stat().st_mtime, UTC)
    return {
        "id": str(uuid.UUID(digest[:32])),
        "createdAt": created.isoformat().replace("+00:00", "Z"),
        "runtimeVersion": update.parent.name,
        "launchAsset": _asset(update, files["bundle"], None, base_url, launch=True),
        "assets": [
            _asset(update, a["path"], a.get("ext"), base_url, False) for a in files["assets"]
        ],
        "metadata": {"build": update.name},
        "extra": {"expoClient": expo_config},
    }


def sign(body: str) -> str | None:
    """``sig="…", keyid="main"`` (RSA PKCS#1 v1.5 + SHA-256), or None without a key."""
    key_path = get_settings().updates_private_key
    if not key_path or not Path(key_path).exists():
        return None
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    key = serialization.load_pem_private_key(Path(key_path).read_bytes(), password=None)
    signature = key.sign(body.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f'sig="{base64.b64encode(signature).decode()}", keyid="main"'


def _multipart(name: str, body: str, signature: str | None) -> bytes:
    headers = [
        f'Content-Disposition: form-data; name="{name}"',
        "Content-Type: application/json; charset=utf-8",
    ]
    if signature:
        headers.append(f"expo-signature: {signature}")
    part = "\r\n".join(headers) + "\r\n\r\n" + body + "\r\n"
    return f"--{BOUNDARY}\r\n{part}--{BOUNDARY}--\r\n".encode()


def _base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = (
        request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    )
    return f"{proto}://{host}"


@router.get("/manifest")
async def manifest(
    request: Request,
    expo_platform: str | None = Header(None),
    expo_runtime_version: str | None = Header(None),
    expo_current_update_id: str | None = Header(None),
    expo_expect_signature: str | None = Header(None),
):
    platform = expo_platform or request.query_params.get("platform")
    runtime = expo_runtime_version or request.query_params.get("runtime-version")
    if platform not in ("android", "ios") or not runtime:
        raise HTTPException(status_code=400, detail="Plate-forme et version d'exécution requises")
    update = latest_update_dir(runtime)
    headers = {
        "expo-protocol-version": "1",
        "expo-sfv-version": "0",
        "cache-control": "private, max-age=0",
        "content-type": f"multipart/mixed; boundary={BOUNDARY}",
    }
    if update is None:
        body = json.dumps({"type": "noUpdateAvailable"})
        return Response(_multipart("directive", body, sign(body)), headers=headers)
    data = build_manifest(update, platform, _base_url(request))
    if expo_current_update_id and expo_current_update_id.lower() == data["id"]:
        body = json.dumps({"type": "noUpdateAvailable"})
        return Response(_multipart("directive", body, sign(body)), headers=headers)
    body = json.dumps(data)
    signature = sign(body)
    if expo_expect_signature and signature is None:
        raise HTTPException(status_code=500, detail="Clé de signature des mises à jour absente")
    return Response(_multipart("manifest", body, signature), headers=headers)


@router.get("/assets")
async def asset(asset: str = Query(..., min_length=3)):
    root = _root().resolve()
    target = (root / asset).resolve()
    if root not in target.parents or not target.is_file():
        raise HTTPException(status_code=404, detail="Fichier inconnu")
    media = _CONTENT_TYPES.get(target.suffix) or mimetypes.guess_type(target.name)[0]
    return FileResponse(target, media_type=media or "application/octet-stream")
