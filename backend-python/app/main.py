from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import knowledge, v1, v2
from app.services import db, http


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await http.close_client()
    await db.close_pool()


app = FastAPI(
    title="Digital Forestry & Circular Economy API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(v1.router, prefix="/api/v1", tags=["v1-measurement"])
app.include_router(v2.router, prefix="/api/v2", tags=["v2-valorization"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])


@app.get("/health")
async def health():
    return {"status": "ok"}
