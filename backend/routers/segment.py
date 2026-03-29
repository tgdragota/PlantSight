"""POST /api/segment — segmentation mask only."""
from fastapi import APIRouter, UploadFile, File, HTTPException
from config import settings
from models.segmentor import segmentor

router = APIRouter()


@router.post("/segment")
async def segment_image(image: UploadFile = File(...)):
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Only JPEG/PNG/WebP accepted")

    img_bytes = await image.read()
    if len(img_bytes) > settings.MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(400, "Image too large")

    result = segmentor.segment(img_bytes)
    return {"segmentation": result}
