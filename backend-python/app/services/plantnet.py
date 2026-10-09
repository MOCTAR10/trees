"""Pl@ntNet API v2 client (multi-organ identification).

POST /v2/identify/{project}?api-key=...
Accepts up to 5 images with organ labels: bark, leaf, flower, fruit, auto.
"""

from app.config import get_settings
from app.services import http


class PlantNetResult:
    def __init__(self, payload: dict):
        self.raw = payload
        results = payload.get("results") or []
        best = results[0] if results else None
        species = (best or {}).get("species", {})
        self.score: float | None = (best or {}).get("score")
        self.scientific_name: str | None = species.get("scientificNameWithoutAuthor")
        self.scientific_name_full: str | None = species.get("scientificName")
        self.family: str | None = (species.get("family") or {}).get("scientificNameWithoutAuthor")
        self.gbif_id: str | None = (best or {}).get("gbif", {}).get("id")
        self.common_names: list[str] = species.get("commonNames") or []
        self.predicted_organs: list[dict] = payload.get("predictedOrgans") or []


async def identify(
    images: list[bytes],
    organs: list[str],
    lang: str = "fr",
    project: str = "all",
) -> PlantNetResult:
    """Identify a plant from up to 5 images with explicit organ labels."""
    if not (1 <= len(images) <= 5):
        raise ValueError("Pl@ntNet accepts 1..5 images")
    if len(images) != len(organs):
        raise ValueError("organs list must match images list")

    settings = get_settings()
    limit = settings.max_image_bytes
    for image in images:
        if len(image) > limit:
            raise ValueError(f"image exceeds {limit} bytes")

    if not settings.plantnet_api_key:
        raise RuntimeError("PLANTNET_API_KEY is not configured")

    url = f"{settings.plantnet_base_url}/{project}"
    params = {"api-key": settings.plantnet_api_key, "lang": lang}
    # Everything goes in the multipart `files` list: httpx 0.28 turns list-form
    # `data` into a sync stream (RuntimeError on AsyncClient), and a data dict
    # would collapse the repeated "organs" keys. None-filename entries become
    # plain form fields.
    parts: list[tuple] = []
    for i, (img, organ) in enumerate(zip(images, organs, strict=True)):
        parts.append(("images", (f"view_{i}.jpg", img, "image/jpeg")))
        parts.append(("organs", (None, organ)))
    resp = await http.request("POST", url, params=params, files=parts, timeout=30.0)
    resp.raise_for_status()
    return PlantNetResult(resp.json())
