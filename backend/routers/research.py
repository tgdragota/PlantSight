"""
GET /api/research — returns thesis research metrics.
"""
from fastapi import APIRouter
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from database.db import async_engine, ScanRecord

router = APIRouter()


@router.get("/research")
async def get_research():
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
        # ── Classifier metrics (field names match ResearchScreen) ──
        "classifier": {
            "model":             "EfficientNet-B0",
            "val_top1_acc":      97.8,
            "test_top1_acc":     98.3,
            "val_top5_acc":      99.6,
            "f1_macro":          0.9781,
            "precision_macro":   0.9793,
            "recall_macro":      0.9778,
            "training_epochs":   30,
            "optimizer":         "Adam",
            "learning_rate":     0.001,
            "batch_size":        32,
        },

        # ── Dataset info ───────────────────────────────────────────
        "dataset": {
            "total_images": 54305,
            "num_classes":  38,
            "crops":        "14 crops",
        },

        # ── TFLite model info ──────────────────────────────────────
        "tflite": {
            "size_mb": 16.2,
            "format":  "FP32, 0 Flex ops",
        },

        # ── Per-class accuracy — field "acc" as screen expects ─────
        "per_class": [
            {"class": "Tomato Late blight",    "acc": 99.1, "samples": 1909},
            {"class": "Tomato Early blight",   "acc": 98.7, "samples": 1000},
            {"class": "Potato Late blight",    "acc": 98.9, "samples": 1000},
            {"class": "Apple Black rot",       "acc": 99.2, "samples": 621 },
            {"class": "Grape Black rot",       "acc": 97.8, "samples": 1180},
            {"class": "Corn Common rust",      "acc": 98.5, "samples": 1192},
            {"class": "Tomato Bacterial spot", "acc": 97.2, "samples": 2127},
            {"class": "Squash Powdery mildew", "acc": 99.4, "samples": 1835},
            {"class": "Strawberry Leaf scorch","acc": 98.1, "samples": 1109},
            {"class": "Pepper Bacterial spot", "acc": 96.8, "samples": 997 },
        ],

        # ── Latency targets per inference mode ─────────────────────
        "latency_targets": {
            "edge": {
                "label":   "Edge AI (TFLite)",
                "device":  "iPhone 16 (A18)",
                "p50_ms":  180,
                "p95_ms":  320,
                "note":    "On-device, fully offline",
            },
            "hybrid": {
                "label":   "Hybrid (Edge + Cloud SAM)",
                "device":  "iPhone 16 + EC2 t3.medium",
                "p50_ms":  520,
                "p95_ms":  900,
                "note":    "Edge classify + cloud segment",
            },
            "cloud": {
                "label":   "Cloud AI (Full server)",
                "device":  "EC2 t3.medium",
                "p50_ms":  780,
                "p95_ms":  1400,
                "note":    "Full EfficientNet + SAM pipeline",
            },
        },

        # ── Live latency from real scans ───────────────────────────
        "live_latency": live_latency,
    }
