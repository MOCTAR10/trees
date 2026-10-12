import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import (
    admin,
    auth,
    community,
    company,
    compliance,
    cooperative,
    diagnostics,
    documents,
    eudr,
    felling,
    group,
    knowledge,
    organizations,
    projects,
    species,
    taxes,
    titles,
    traceability,
    transport,
    trees,
    v1,
    v2,
)
from app.core import bootstrap
from app.services import db, http

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await bootstrap.ensure_admin()
    except Exception as exc:  # DB may not be reachable at boot; do not block startup
        logger.warning("Admin bootstrap skipped: %s", exc)
    yield
    await http.close_client()
    await db.close_pool()


app = FastAPI(
    title="Digital Forestry & Circular Economy API",
    version="0.1.0",
    lifespan=lifespan,
)

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
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
app.include_router(species.router, prefix="/api/species", tags=["species"])
app.include_router(trees.router, prefix="/api", tags=["trees"])
app.include_router(group.router, prefix="/api/group", tags=["group"])
app.include_router(diagnostics.router, prefix="/api/diagnostics", tags=["diagnostics"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])


@app.get("/health")
async def health():
    return {"status": "ok"}
