"""
SQLite database via SQLModel + async SQLAlchemy.
Tables: ScanRecord — one row per plant scan.
        TrainingRecord — confirmed diagnoses for training data.
"""
import json
import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from config import settings

# ── ORM model ────────────────────────────────────────────────────
class ScanRecord(SQLModel, table=True):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
    )
    device_id: str = Field(index=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Classification
    disease_class: str
    disease_label: str
    plant: str
    confidence: float
    severity: str

    # Treatment (stored as JSON string)
    treatment_json: str

    # Meta
    mode: str          # "cloud" | "hybrid" | "edge"
    latency_ms: float


# ── Training data table ──────────────────────────────────────────
class TrainingRecord(SQLModel, table=True):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
    )
    device_id: str = Field(index=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Labels
    confirmed_label: str          # what the user confirmed (or corrected)
    original_label: str           # what the model predicted
    was_correct: bool             # did user confirm model was right?

    # Image stored on disk
    image_path: str               # relative path under /app/data/training_images/

    # Optional: metadata from the scan
    confidence: float = 0.0
    mode: str = "cloud"


# ── Engine ───────────────────────────────────────────────────────
async_engine = create_async_engine(settings.DB_URL, echo=False)


async def init_db():
    """Create tables on startup."""
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


# ── CRUD helpers ─────────────────────────────────────────────────
async def save_scan(
    device_id: str,
    classification: dict,
    treatment: dict,
    mode: str,
    latency_ms: float,
) -> ScanRecord:
    record = ScanRecord(
        device_id=device_id,
        disease_class=classification["disease_class"],
        disease_label=classification["disease_label"],
        plant=classification["plant"],
        confidence=classification["confidence"],
        severity=classification["severity"],
        treatment_json=json.dumps(treatment),
        mode=mode,
        latency_ms=latency_ms,
    )
    async with AsyncSession(async_engine) as session:
        session.add(record)
        await session.commit()
        await session.refresh(record)
    return record


async def save_training(
    device_id: str,
    confirmed_label: str,
    original_label: str,
    was_correct: bool,
    image_path: str,
    confidence: float = 0.0,
    mode: str = "cloud",
) -> TrainingRecord:
    record = TrainingRecord(
        device_id=device_id,
        confirmed_label=confirmed_label,
        original_label=original_label,
        was_correct=was_correct,
        image_path=image_path,
        confidence=confidence,
        mode=mode,
    )
    async with AsyncSession(async_engine) as session:
        session.add(record)
        await session.commit()
        await session.refresh(record)
    return record


async def get_training_stats() -> dict:
    async with AsyncSession(async_engine) as session:
        result = await session.exec(select(TrainingRecord))
        records = result.all()
    total = len(records)
    correct = sum(1 for r in records if r.was_correct)
    by_label: dict = {}
    for r in records:
        by_label[r.confirmed_label] = by_label.get(r.confirmed_label, 0) + 1
    return {
        "total": total,
        "correct_predictions": correct,
        "incorrect_predictions": total - correct,
        "accuracy_rate": round(correct / total * 100, 1) if total else 0,
        "by_label": by_label,
    }


async def get_history(device_id: str, limit: int = 20) -> list[ScanRecord]:
    async with AsyncSession(async_engine) as session:
        result = await session.exec(
            select(ScanRecord)
            .where(ScanRecord.device_id == device_id)
            .order_by(ScanRecord.timestamp.desc())
            .limit(limit)
        )
        return result.all()
