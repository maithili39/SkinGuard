# SkinGuard

AI-powered skincare **ingredient analyzer**. Upload a product label photo or paste an ingredient list and get an honest, sourced safety assessment for *your* skin profile: acne, fungal acne, sensitivity, pregnancy, comedogenic risk.

> ⚠️ Educational use only — **not medical advice.**

## Why this is built data-first

The value lives in the data and rules. The build order was: **data → rules → matching → OCR → UI → auth → production.** By the end of Phase 2 you already have a working product (text in, analysis out). OCR, frontend, and auth layer on top.

### Trust boundary (important)
- `data/reference/` — **authoritative** EU CosIng data (~24,125 ingredients, identity + legal restrictions). Downloaded separately, not committed.
- `data/curated/`   — **our** skincare-advice flags (comedogenic / fungal / pregnancy / irritant). 96 rows, each with a `source` column.
- `data/test/`      — messy real-world samples (Open Beauty Facts) used *only* for testing the matcher & OCR — never as a source of truth.

Every finding is tagged `kind`: `regulatory` (EU legal fact) vs `advice` (curated guidance), and carries its `source`.

## Current status ✅ Complete

- [x] Repo + data scaffold
- [x] SQLAlchemy models (SQLite dev / Postgres prod via `DATABASE_URL`)
- [x] ~96 curated ingredients with sources
- [x] Ingestion script (idempotent bootstrap)
- [x] Fuzzy matcher with confidence scores + **singleton pattern** (built once at startup)
- [x] Data-driven, personalized rules engine + honest safety score + coverage signal
- [x] Assessment-depth honesty — score withheld (`null`) when no risk data exists
- [x] FastAPI `/analyze` endpoint with **rate limiting** (30 req/min)
- [x] OCR pipeline — Tesseract with Pillow preprocessing (10 req/min rate limited)
- [x] **Real JWT authentication** — bcrypt password hashing + 7-day tokens
- [x] `/auth/register`, `/auth/login`, `/auth/me` endpoints
- [x] User profiles + scan history persistence
- [x] Frontend — Next.js 14 + Tailwind + dark mode toggle
- [x] Frontend component split (9 components, page.tsx ~250 lines)
- [x] Docker Compose (Postgres + backend + frontend)
- [x] **Alembic** DB migrations (run `alembic upgrade head`)
- [x] CI pipeline (GitHub Actions — pytest + TypeScript check)
- [x] 30+ tests (rules, matcher, OCR, API endpoints)

## Run it (local dev)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Edit .env and set SECRET_KEY to something random

# Build the database (first run — creates tables + seeds 24k ingredients)
python -m app.ingestion

# Apply any pending Alembic migrations
alembic upgrade head

# Start the API
uvicorn app.main:app --reload

# In a separate terminal: start the frontend
cd frontend
npm install
npm run dev
```

API: http://localhost:8000  
Frontend: http://localhost:3000  
Interactive docs: http://localhost:8000/docs

## Run with Docker

```bash
docker compose up --build
```

This starts Postgres, seeds the DB (idempotent), and runs the API + frontend. Set `SECRET_KEY` in `.env` before deploying.

## Database migrations (Alembic)

```bash
# Apply all pending migrations
alembic upgrade head

# After changing a model — generate a new migration
alembic revision --autogenerate -m "describe the change"
alembic upgrade head

# See current migration state
alembic current
```

## Test suite

```bash
pytest -q
```

The tests use in-memory SQLite — no running server or external DB required.

## Adding more curated ingredients

1. Run `python -m scripts.coverage_report` to see top unmatched tokens.
2. Add rows to `data/curated/ingredient_flags.csv` (follow the existing format).
3. Run `python -m app.ingestion` (or `python -m app.bootstrap` to preserve user data).
4. Restart the API — the Matcher singleton rebuilds at startup.

## Architecture

```
Frontend (Next.js :3000)  ←→  Backend (FastAPI :8000)  ←→  SQLite / Postgres
                                  ├── OCR (Tesseract)
                                  ├── Matcher (in-memory, built at startup)
                                  ├── Rules engine (data-driven)
                                  └── Auth (JWT / bcrypt)
```
