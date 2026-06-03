from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default so the project runs with zero infra today.
    # Switch to Postgres later by setting DATABASE_URL in .env — no code changes.
    database_url: str = "sqlite:///./skinguard.db"

    # Fuzzy-match score (0-100). Below this an ingredient is reported as unmatched
    # rather than guessed — we never silently pretend a label is understood.
    match_threshold: int = 82

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
