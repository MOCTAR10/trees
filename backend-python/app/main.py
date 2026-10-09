import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import admin, auth, company, cooperative, knowledge, v1, v2
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
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])


@app.get("/health")
async def health():
    return {"status": "ok"}
