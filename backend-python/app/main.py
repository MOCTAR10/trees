import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.api import (
    admin,
    anomalies,
    auth,
    certifications,
    community,
    company,
    compliance,
    controls,
    cooperative,
    dashboard,
    diagnostics,
    documents,
    eudr,
    felling,
    group,
    home,
    knowledge,
    mill,
    organizations,
    projects,
    species,
    taxes,
    titles,
    traceability,
    transport,
    trees,
    updates,
    v1,
    v2,
)
from app.api import map as map_api
from app.core import bootstrap
from app.services import ai_models, db, http

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await bootstrap.ensure_admin()
    except Exception as exc:  # DB may not be reachable at boot; do not block startup
        logger.warning("Admin bootstrap skipped: %s", exc)
    warmup = None
    if ai_models.enabled():
        # Load the scanner models off the event loop so the first scan is fast.
        warmup = asyncio.create_task(asyncio.to_thread(ai_models.warmup))
    yield
    if warmup is not None and not warmup.done():
        warmup.cancel()
    await http.close_client()
    await db.close_pool()


API_DESCRIPTION = """
API de **Foresterie Numérique** (Loi 016/01, RDUE) : mesure des arbres, traçabilité des grumes,
titres et autorisations, fiscalité, certifications, contrôles, anomalies, registres d'usine.

**S'authentifier pour essayer un appel** (bouton *Authorize*) :

1. **ApiKey** — la clé de la passerelle (`X-API-Key`), fournie par l'administrateur du serveur ;
2. `POST /api/auth/login` avec l'email et le mot de passe d'un compte → `access_token` ;
3. **Bearer** — coller ce jeton.

Chaque point d'accès indique les rôles autorisés (`operator`, `company`, `cooperative`, `admin`) ;
un appel hors rôle répond **403**.
"""

app = FastAPI(
    title="Foresterie Numérique — API",
    version="0.26.0",
    description=API_DESCRIPTION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


def _openapi() -> dict:
    """OpenAPI with the gateway key and the bearer token as security schemes."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title, version=app.version, description=app.description, routes=app.routes
    )
    schema.setdefault("components", {})["securitySchemes"] = {
        "ApiKey": {"type": "apiKey", "in": "header", "name": "X-API-Key"},
        "Bearer": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
    }
    schema["security"] = [{"ApiKey": [], "Bearer": []}]
    for path in schema.get("paths", {}).values():
        for operation in path.values():
            if isinstance(operation, dict) and "parameters" in operation:
                operation["parameters"] = [
                    p
                    for p in operation["parameters"]
                    if not (
                        p.get("in") == "header" and p.get("name", "").lower() == "authorization"
                    )
                ]
    app.openapi_schema = schema
    return schema


app.openapi = _openapi

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(v1.router, prefix="/api/v1", tags=["v1-measurement"])
app.include_router(v2.router, prefix="/api/v2", tags=["v2-valorization"])
app.include_router(company.router, prefix="/api/company", tags=["company"])
app.include_router(cooperative.router, prefix="/api/cooperative", tags=["cooperative"])
app.include_router(felling.router, prefix="/api/felling", tags=["felling"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(organizations.router, prefix="/api/organizations", tags=["organizations"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(titles.router, prefix="/api/titles", tags=["titles"])
app.include_router(taxes.router, prefix="/api/taxes", tags=["taxes"])
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"])
app.include_router(transport.router, prefix="/api/transport", tags=["transport"])
app.include_router(traceability.router, prefix="/api/traceability", tags=["traceability"])
app.include_router(community.router, prefix="/api/community", tags=["community"])
app.include_router(eudr.router, prefix="/api/eudr", tags=["eudr"])
app.include_router(certifications.router, prefix="/api/certifications", tags=["certifications"])
app.include_router(anomalies.router, prefix="/api/anomalies", tags=["anomalies"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(map_api.router, prefix="/api/map", tags=["map"])
app.include_router(species.router, prefix="/api/species", tags=["species"])
app.include_router(trees.router, prefix="/api", tags=["trees"])
app.include_router(group.router, prefix="/api/group", tags=["group"])
app.include_router(diagnostics.router, prefix="/api/diagnostics", tags=["diagnostics"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(home.router, prefix="/api/home", tags=["home"])
app.include_router(controls.router, prefix="/api/controls", tags=["controls"])
app.include_router(mill.router, prefix="/api/mill", tags=["mill"])
app.include_router(updates.router, prefix="/updates", tags=["mobile-updates"])


@app.get("/health")
async def health():
    return {"status": "ok"}
