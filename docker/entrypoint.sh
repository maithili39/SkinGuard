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

# Run Alembic migrations to apply any pending schema changes.
alembic upgrade head

# Seed ingredient data on first run (idempotent — preserves users/scans).
# Run in the background (&) so it doesn't block the API server startup and cause health check failures.
python -m app.ingestion --bootstrap &

# Start the API with gunicorn for production-grade multi-worker serving.
# Falls back to uvicorn if gunicorn is not installed (e.g. local dev).
PORT="${PORT:-8000}"
WORKERS="${GUNICORN_WORKERS:-2}"
if command -v gunicorn &> /dev/null; then
    exec gunicorn app.main:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers "$WORKERS" \
        --timeout 120 \
        --bind "0.0.0.0:$PORT" \
        --access-logfile - \
        --error-logfile -
else
    exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
fi
