"""
POST /api/confirm  — user confirms or corrects a diagnosis.
Saves image + label as training data.
"""
import os
import uuid
from fastapi import APIRouter, Form, UploadFile, File, HTTPException

from database.db import save_training, get_training_stats

router = APIRouter()

TRAINING_DIR = "/app/data/training_images"
os.makedirs(TRAINING_DIR, exist_ok=True)


@router.post("/confirm")
async def confirm_diagnosis(
    image: UploadFile = File(...),
    confirmed_label: str = Form(...),
    original_label: str = Form(...),
    device_id: str = Form(...),
    confidence: float = Form(default=0.0),
    mode: str = Form(default="cloud"),
):
    """
    Save a confirmed/corrected diagnosis as training data.
    The image is stored on disk; metadata goes into SQLite.
    """
    # ── Save image ────────────────────────────────────────────────
    ext = os.path.splitext(image.filename or "image.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    # Subfolder per label to make future training easier
    label_dir = os.path.join(TRAINING_DIR, confirmed_label.replace(" ", "_"))
    os.makedirs(label_dir, exist_ok=True)
    filepath = os.path.join(label_dir, filename)

    contents = await image.read()
    with open(filepath, "wb") as f:
        f.write(contents)

    # ── Save to DB ────────────────────────────────────────────────
    was_correct = confirmed_label.strip().lower() == original_label.strip().lower()
    relative_path = os.path.relpath(filepath, "/app/data")

    record = await save_training(
        device_id=device_id,
        confirmed_label=confirmed_label,
        original_label=original_label,
        was_correct=was_correct,
        image_path=relative_path,
        confidence=confidence,
        mode=mode,
    )

    return {
        "id": record.id,
        "confirmed_label": record.confirmed_label,
        "was_correct": record.was_correct,
        "message": "Training sample saved. Thank you!",
    }


@router.get("/confirm/stats")
async def training_stats():
    """Return aggregated stats about collected training data."""
    return await get_training_stats()
