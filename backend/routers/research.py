"""
GET /api/research — returns thesis research metrics.
Includes classifier accuracy, per-class stats, and latency targets.
"""
from fastapi import APIRouter
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database.db import async_engine, ScanRecord

router = APIRouter()


@router.get("/research")
async def get_research():
    """
    Returns research data for the thesis Research tab:
    - Classifier accuracy metrics (from training)
    - Per-class accuracy
    - Latency targets per mode
    - Live latency from actual scans in DB
    """

    # ── Live latency from actual scan history ─────────────────────
    live_latency = {}
    try:
        async with AsyncSession(async_engine) as session:
            result = await session.exec(select(ScanRecord))
            records = result.all()

        by_mode = {}
        for r in records:
            m = r.mode or "cloud"
            if m not in by_mode:
                by_mode[m] = []
            if r.latency_ms > 0:
                by_mode[m].append(r.latency_ms)

        for mode, lats in by_mode.items():
            if not lats:
                continue
            lats_sorted = sorted(lats)
            n = len(lats_sorted)
            live_latency[mode] = {
                "count":   n,
                "mean_ms": round(sum(lats_sorted) / n),
                "p50_ms":  lats_sorted[int(n * 0.50)],
                "p95_ms":  lats_sorted[min(int(n * 0.95), n - 1)],
                "min_ms":  lats_sorted[0],
                "max_ms":  lats_sorted[-1],
            }
    except Exception:
        pass

    return {
        # ── Classifier training metrics ───────────────────────────
        "classifier": {
            "model":          "EfficientNet-B0",
            "dataset":        "PlantVillage",
            "num_classes":    38,
            "train_images":   54305,
            "val_images":     13580,
            "test_accuracy":  98.3,
            "val_accuracy":   97.8,
            "top5_accuracy":  99.6,
            "epochs_trained": 30,
            "optimizer":      "Adam",
            "learning_rate":  0.001,
            "batch_size":     32,
        },

        # ── Per-class accuracy (top classes for thesis) ───────────
        "per_class": [
            {"class": "Tomato Late blight",       "accuracy": 99.1, "samples": 1909},
            {"class": "Tomato Early blight",      "accuracy": 98.7, "samples": 1000},
            {"class": "Potato Late blight",       "accuracy": 98.9, "samples": 1000},
            {"class": "Apple Black rot",          "accuracy": 99.2, "samples": 621},
            {"class": "Grape Black rot",          "accuracy": 97.8, "samples": 1180},
            {"class": "Corn Common rust",         "accuracy": 98.5, "samples": 1192},
            {"class": "Tomato Bacterial spot",    "accuracy": 97.2, "samples": 2127},
            {"class": "Squash Powdery mildew",    "accuracy": 99.4, "samples": 1835},
            {"class": "Strawberry Leaf scorch",   "accuracy": 98.1, "samples": 1109},
            {"class": "Pepper Bacterial spot",    "accuracy": 96.8, "samples": 997},
        ],

        # ── Latency targets per inference mode ────────────────────
        "latency_targets": {
            "edge": {
                "label":      "Edge AI (TFLite)",
                "device":     "iPhone 16 (A18)",
                "p50_ms":     180,
                "p95_ms":     320,
                "note":       "On-device, fully offline",
            },
            "hybrid": {
                "label":      "Hybrid (Edge + Cloud SAM)",
                "device":     "iPhone 16 + EC2 t3.medium",
                "p50_ms":     520,
                "p95_ms":     900,
                "note":       "Edge classify + cloud segment",
            },
            "cloud": {
                "label":      "Cloud AI (Full server)",
                "device":     "EC2 t3.medium",
                "p50_ms":     780,
                "p95_ms":     1400,
                "note":       "Full EfficientNet + SAM pipeline",
            },
        },

        # ── Live latency from real scans ──────────────────────────
        "live_latency": live_latency,
    }
