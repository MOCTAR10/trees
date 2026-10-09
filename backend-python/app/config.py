from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql+asyncpg://forestry:forestry_secret@localhost:5433/forestry"

    plantnet_api_key: str = ""
    plantnet_base_url: str = "https://my-api.plantnet.org/v2/identify"

    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    groq_base_url: str = "https://api.groq.com/openai/v1"

    gee_enabled: bool = False
    gee_service_account_json: str = ""

    yolo_weights_path: str = "weights/trunk-seg.pt"
    yolo_enabled: bool = True

    embedding_model: str = "intfloat/multilingual-e5-small"

    # IUCN Red List status enrichment (optional, tools only)
    iucn_api_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
