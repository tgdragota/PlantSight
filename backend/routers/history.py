"""GET /api/history — return scan history for a device."""
import json
from fastapi import APIRouter, Query
from database.db import get_history, delete_history

router = APIRouter()


@router.delete("/history")
async def clear_history(device_id: str = Query(..., description="Client UUID")):
    deleted = await delete_history(device_id)
    return {"device_id": device_id, "deleted": deleted}


@router.get("/history")
async def read_history(
    device_id: str = Query(..., description="Client UUID"),
    limit: int = Query(20, ge=1, le=100),
):
    records = await get_history(device_id, limit)
    return {
        "device_id": device_id,
        "count": len(records),
        "scans": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat(),
                "plant": r.plant,
                "disease_label": r.disease_label,
                "confidence": r.confidence,
                "severity": r.severity,
                "mode": r.mode,
                "latency_ms": r.latency_ms,
                "treatment": json.loads(r.treatment_json),
                "top3": json.loads(r.top3_json) if r.top3_json else [],
                "infected_area": r.infected_area,
                "image_b64": r.image_b64,
            }
            for r in records
        ],
    }
