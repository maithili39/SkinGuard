import logging
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("skinguard.config")


class Settings(BaseSettings):
    # SQLite by default so the project runs with zero infra today.
    # Switch to Postgres later by setting DATABASE_URL in .env — no code changes.
    database_url: str = "sqlite:///./skinguard.db"

    # Environment: "development" or "production". Controls safety checks.
    env: str = "development"

    # Fuzzy-match score (0-100). Below this an ingredient is reported as unmatched
    # rather than guessed — we never silently pretend a label is understood.
    match_threshold: int = 82

    # OCR Engine: "tesseract" or "google_cloud"
    ocr_provider: str = "tesseract"

    # Redis URL for response caching. When blank or unreachable, caching is
    # silently skipped — the app stays fully functional without Redis.
    redis_url: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

# ── Production safety checks ─────────────────────────────────────────────────
if settings.database_url.startswith("sqlite"):
    if settings.env == "production":
        logger.error(
            "DATABASE_URL is SQLite but ENV=production. "
            "SQLite does not support concurrent writes and is NOT suitable for production. "
            "Set DATABASE_URL to a PostgreSQL connection string."
        )
    else:
        logger.info("Using SQLite database (development mode).")
