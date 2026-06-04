#!/usr/bin/env bash
set -e

# Wait for the database to accept connections (Postgres in compose).
echo "Waiting for database..."
python - <<'PY'
import os, time, sys
from sqlalchemy import create_engine, text

url = os.environ.get("DATABASE_URL", "sqlite:///./skinguard.db")
if url.startswith("sqlite"):
    sys.exit(0)  # nothing to wait for

for attempt in range(30):
    try:
        create_engine(url).connect().execute(text("SELECT 1"))
        print("Database is up.")
        sys.exit(0)
    except Exception as exc:
        print(f"  db not ready ({attempt+1}/30): {exc}")
        time.sleep(2)
print("Database did not become ready in time.", file=sys.stderr)
sys.exit(1)
PY

# Seed ingredient data on first run (idempotent — preserves users/scans).
python -m app.ingestion --bootstrap

# Start the API.
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
