"""
SAM (Segment Anything Model) wrapper for leaf disease segmentation.
Falls back to mock mode if SAM checkpoint is not found.

Download checkpoint:
  wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth \
       -P backend/assets/models/
"""
import io
import time
import base64
import random

import numpy as np
from PIL import Image, ImageDraw

from config import settings


class PlantSegmentor:
    def __init__(self):
        self.predictor = None
        self.mock_mode = False

    def load(self):
        """Load SAM ViT-B. Falls back to mock mode if missing."""
        try:
            from segment_anything import sam_model_registry, SamPredictor

            sam = sam_model_registry["vit_b"](checkpoint=str(settings.SAM_CHECKPOINT))
            self.predictor = SamPredictor(sam)
            print("[Segmentor] SAM ViT-B loaded")

        except (FileNotFoundError, ImportError, Exception) as e:
            print(f"[Segmentor] Could not load SAM: {e}")
            print("[Segmentor] *** RUNNING IN MOCK MODE — generating synthetic masks ***")
            self.mock_mode = True
            self.predictor = "mock"

    def segment(self, image_bytes: bytes) -> dict:
        """Segment the leaf region. Uses real SAM or generates a mock mask."""
        if self.predictor is None:
            raise RuntimeError("Segmentor not loaded. Call segmentor.load() first.")

        t0 = time.time()

        if self.mock_mode:
            return self._mock_segment(image_bytes, t0)
        return self._real_segment(image_bytes, t0)

    def _mock_segment(self, image_bytes: bytes, t0: float) -> dict:
        """Generate a realistic-looking synthetic segmentation mask."""
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        size = settings.IMG_SIZE

        # Create a semi-transparent RGBA overlay with random blobs
        overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Draw 3-6 random ellipses (simulating disease spots)
        num_spots = random.randint(3, 7)
        total_spot_pixels = 0

        for _ in range(num_spots):
            cx = random.randint(size // 4, 3 * size // 4)
            cy = random.randint(size // 4, 3 * size // 4)
            rx = random.randint(10, size // 5)
            ry = random.randint(10, size // 5)
            alpha = random.randint(100, 160)

            draw.ellipse(
                [cx - rx, cy - ry, cx + rx, cy + ry],
                fill=(220, 50, 50, alpha),
            )
            total_spot_pixels += 3.14159 * rx * ry

        infected_pct = round(min(total_spot_pixels / (size * size) * 100, 65.0), 1)

        # Encode overlay as base64 PNG
        buf = io.BytesIO()
        overlay.save(buf, format="PNG")
        mask_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        time.sleep(random.uniform(0.05, 0.12))

        return {
            "mask_base64": mask_b64,
            "mask_width": size,
            "mask_height": size,
            "infected_area_pct": infected_pct,
            "model_used": "mock_segmentor",
            "latency_ms": round((time.time() - t0) * 1000, 1),
        }

    def _real_segment(self, image_bytes: bytes, t0: float) -> dict:
        """Real SAM inference."""
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_resized = img.resize((settings.IMG_SIZE, settings.IMG_SIZE))
        img_np = np.array(img_resized)

        self.predictor.set_image(img_np)

        h, w = img_np.shape[:2]
        masks, scores, _ = self.predictor.predict(
            point_coords=np.array([[w // 2, h // 2]]),
            point_labels=np.array([1]),
            multimask_output=True,
        )
        best_mask = masks[np.argmax(scores)]

        overlay = np.zeros((*best_mask.shape, 4), dtype=np.uint8)
        overlay[best_mask] = [220, 50, 50, 140]

        mask_img = Image.fromarray(overlay, mode="RGBA")
        buf = io.BytesIO()
        mask_img.save(buf, format="PNG")
        mask_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        infected_pct = round(float(best_mask.sum()) / best_mask.size * 100, 1)

        return {
            "mask_base64": mask_b64,
            "mask_width": settings.IMG_SIZE,
            "mask_height": settings.IMG_SIZE,
            "infected_area_pct": infected_pct,
            "model_used": "sam_vit_b",
            "latency_ms": round((time.time() - t0) * 1000, 1),
        }


# Singleton
segmentor = PlantSegmentor()
