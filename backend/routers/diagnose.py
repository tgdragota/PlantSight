"""
POST /api/diagnose
Main endpoint — classify + segment + treatment in a single call.
Used by Cloud and Hybrid modes.
"""
import json
import time

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from config import settings
from models.classifier import classifier
from models.segmentor import segmentor
from database.db import save_scan

router = APIRouter()

# Load treatments lookup once at import time
with open(settings.TREATMENTS_JSON) as f:
    _TREATMENTS: dict = json.load(f)


def _get_treatment(disease_class: str) -> dict:
    """Exact match → partial match → default fallback."""
    if disease_class in _TREATMENTS:
        return _TREATMENTS[disease_class]
    for key in _TREATMENTS:
        if key.lower() in disease_class.lower():
            return _TREATMENTS[key]
    return _TREATMENTS.get(
        "__default__",
        {
            "disease_name": "Unknown",
            "cause": "Unknown",
            "symptoms": "Consult an agronomist.",
            "organic": [],
            "chemical": [],
            "prevention": [],
            "urgency": "medium",
        },
    )


@router.post("/diagnose")
async def diagnose(
    image: UploadFile = File(..., description="Plant leaf image (JPEG/PNG/WebP)"),
    mode: str = Form("cloud", description="cloud | hybrid | edge_verify"),
    device_id: str = Form("anonymous", description="Client UUID for history"),
):
    # ── Validate upload ──────────────────────────────────────────
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if image.content_type not in allowed_types:
        raise HTTPException(400, f"Only {allowed_types} images accepted")

    img_bytes = await image.read()
    max_bytes = settings.MAX_IMAGE_MB * 1024 * 1024
    if len(img_bytes) > max_bytes:
        raise HTTPException(400, f"Image exceeds {settings.MAX_IMAGE_MB} MB limit")

    t_total = time.time()

    # ── 1. Classify ──────────────────────────────────────────────
    cls = classifier.predict(img_bytes)
    classify_ms = cls.pop("latency_ms", 0)

    # ── 2. Segment (skip for healthy plants) ────────────────────
    seg = None
    segment_ms = 0
    if cls["severity"] != "healthy":
        try:
            seg = segmentor.segment(img_bytes)
            segment_ms = seg.pop("latency_ms", 0)
        except Exception as e:
            print(f"[WARN] Segmentation failed: {e}")

    # ── 3. Treatment lookup ──────────────────────────────────────
    treatment = _get_treatment(cls["disease_class"])

    total_ms = round((time.time() - t_total) * 1000, 1)

    response = {
        "classification": cls,
        "segmentation": seg,
        "treatment": treatment,
        "inference_meta": {
            "latency_ms": total_ms,
            "mode": mode,
            "classify_ms": classify_ms,
            "segment_ms": segment_ms,
        },
    }

    # ── 4. Persist scan (fire-and-forget, non-blocking) ──────────
    try:
        await save_scan(
            device_id=device_id,
            classification=cls,
            treatment=treatment,
            mode=mode,
            latency_ms=total_ms,
        )
    except Exception as e:
        print(f"[WARN] Could not persist scan: {e}")

    return response
