"""POST /api/classify — classification only (no segmentation)."""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from config import settings
from models.classifier import classifier

router = APIRouter()


@router.post("/classify")
async def classify_image(
    image: UploadFile = File(...),
    mode: str = Form("cloud"),
):
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Only JPEG/PNG/WebP accepted")

    img_bytes = await image.read()
    if len(img_bytes) > settings.MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(400, "Image too large")

    result = classifier.predict(img_bytes)
    return {"classification": result, "mode": mode}
