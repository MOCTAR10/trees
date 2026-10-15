from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql+asyncpg://forestry:forestry_secret@localhost:5433/forestry"

    plantnet_api_key: str = ""
    plantnet_base_url: str = "https://my-api.plantnet.org/v2/identify"
    # Regional flora covering Gabon (TDWG West-Central Tropical Africa); the
    # global flora is asked only when the regional score stays below the bar.
    plantnet_project: str = "k-west-central-tropical-africa"
    plantnet_fallback_below: float = 0.2

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    gee_enabled: bool = False
    gee_project: str = ""
    gee_service_account_json: str = ""
    gee_service_account_file: str = ""

    # Max size per uploaded image (bytes); guards memory before Pl@ntNet upload.
    max_image_bytes: int = 10 * 1024 * 1024

    # Scanner AI (server-side, CPU). Off by default so tests/CI never download
    # weights; enable in .env. SAM 2.1 (Apache-2.0) cuts the trunk out, Depth
    # Anything V2 metric (outdoor) estimates the bark distance when not typed.
    ai_models_enabled: bool = False
    sam_model_id: str = "facebook/sam2.1-hiera-tiny"
    depth_model_id: str = "depth-anything/Depth-Anything-V2-Metric-Outdoor-Small-hf"
    # Below this much RAM for the API (cgroup limit) the models stay off: the
    # models + torch + the RAG embedder would otherwise get the API OOM-killed.
    ai_min_memory_mb: int = 3000

    # Printed side (cm) of the QR symbol on official tree plates (black square,
    # quiet zone excluded): the plate becomes a ruler in the DBH photo.
    # À valider par le métier.
    qr_tag_size_cm: float = 8.0

    # Reference-labelled DBH photos (tape/caliper) kept as training data.
    scan_media_dir: str = ""

    # Over-the-air updates of the mobile app (Expo Updates protocol, self-hosted).
    # updates_dir holds <runtimeVersion>/<build>/ exports; the private key signs manifests.
    updates_dir: str = ""
    updates_private_key: str = ""

    embedding_model: str = "intfloat/multilingual-e5-small"

    # IUCN Red List status enrichment (optional, tools only)
    iucn_api_token: str = ""

    # Global Forest Watch Data API (tree-cover loss, RADD alerts, parks,
    # concessions at the scan point). Create with ``python -m tools.gfw_api_key``.
    gfw_api_key: str = ""

    # Auth / RBAC (Track F)
    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_expire_minutes: int = 720
    admin_email: str = ""
    admin_password: str = ""
    admin_display_name: str = "Administrateur"


@lru_cache
def get_settings() -> Settings:
    return Settings()
