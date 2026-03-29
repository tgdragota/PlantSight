from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "PlantSight API"
    VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Paths
    BASE_DIR: Path = Path(__file__).parent
    MODEL_DIR: Path = BASE_DIR / "assets" / "models"
    CLASSIFIER_WEIGHTS: Path = MODEL_DIR / "efficientnet_b0_plantvillage.pth"
    TFLITE_MODEL: Path = MODEL_DIR / "model_int8.tflite"
    SAM_CHECKPOINT: Path = MODEL_DIR / "sam_vit_b_01ec64.pth"
    CLASS_NAMES_JSON: Path = BASE_DIR / "data" / "class_names.json"
    TREATMENTS_JSON: Path = BASE_DIR / "data" / "treatments.json"

    # Inference
    IMG_SIZE: int = 224
    CONF_THRESHOLD: float = 0.5
    MAX_IMAGE_MB: int = 5

    # Database
    DB_URL: str = "sqlite+aiosqlite:///./plantsight.db"

    # CORS — update with your LAN IP when testing on phone
    ALLOWED_ORIGINS: list = [
        "http://localhost:5173",   # Vite web dev
        "http://localhost:3000",   # CRA fallback
        "*",                       # Remove in production!
    ]


settings = Settings()
