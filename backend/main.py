from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from database.db import init_db
from models.classifier import classifier
from models.segmentor import segmentor
from routers import classify, segment, diagnose, history


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load models and DB. Shutdown: cleanup."""
    print("━━━ PlantSight API starting ━━━")
    await init_db()
    print("[DB] SQLite initialised")

    classifier.load()
    segmentor.load()

    mock_label = ""
    if classifier.mock_mode or segmentor.mock_mode:
        mock_label = " (MOCK MODE — no real model weights found)"
    print(f"━━━ API ready at http://localhost:8000{mock_label} ━━━")
    yield
    print("Shutting down.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="Plant disease detection API — Edge / Hybrid / Cloud inference",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(diagnose.router, prefix="/api", tags=["diagnose"])
app.include_router(classify.router, prefix="/api", tags=["classify"])
app.include_router(segment.router,  prefix="/api", tags=["segment"])
app.include_router(history.router,  prefix="/api", tags=["history"])


@app.get("/api/health", tags=["system"])
async def health():
    return {
        "status": "ok",
        "classifier_loaded": classifier.model is not None,
        "classifier_mock": classifier.mock_mode,
        "segmentor_loaded": segmentor.predictor is not None,
        "segmentor_mock": segmentor.mock_mode,
        "version": settings.VERSION,
    }


@app.get("/api/classes", tags=["system"])
async def get_classes():
    """Return the list of supported disease class names."""
    return {"classes": classifier.classes}


# ── Entry point ──────────────────────────────────────────────────
# Run with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
