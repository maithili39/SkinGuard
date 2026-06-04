# SkinGuard

AI-powered skincare ingredient analyzer. Upload a photo of a product label, scan
a barcode, or paste an ingredient list — SkinGuard extracts the ingredients and
gives you an honest, sourced safety assessment tailored to your skin profile.

> ⚠️ Educational use only — **not medical advice.**

---

## What it does

1. **Image → Text** — OCR extracts ingredients from a label photo (Tesseract
   locally, Google Cloud Vision in production).
2. **Text → Ingredients** — Fuzzy + semantic (MiniLM embedding) matching resolves
   messy OCR output and variant names to canonical INCI ingredients. Unrecognised
   tokens are surfaced explicitly — never silently dropped.
3. **Ingredients → Assessment** — A data-driven rules engine evaluates each
   ingredient against your profile (acne-prone, fungal acne, sensitive skin,
   pregnancy, rosacea, custom avoid list). Position on the label (concentration
   proxy) and severity both affect the score.
4. **Results** — Safety score (0–100, labelled *indicative*), per-ingredient
   findings with source citations, assessment depth (how many ingredients we
   actually have risk data for), and plain-language explanations.

---

## Tech stack

**Backend** — Python 3.12, FastAPI, SQLAlchemy, Alembic, Gunicorn + Uvicorn  
**Database** — PostgreSQL with pgvector (production) / SQLite (local dev)  
**Caching** — Redis (optional — degrades gracefully when absent)  
**AI / ML**
- Sentence-transformers (`all-MiniLM-L6-v2`) for semantic ingredient matching
- Gemini 2.5 Pro for grounded plain-language explanations and Q&A (optional)
- Tesseract OCR + Pillow preprocessing / Google Cloud Vision

**Frontend** — Next.js 14, React, Tailwind CSS, `html5-qrcode`  
**Auth** — bcrypt passwords + JWT stored in HttpOnly cookies  
**Infra** — Docker Compose (4 services), Alembic migrations, GitHub Actions CI

---

## Data

| Folder | What it holds | Committed? |
|---|---|---|
| `data/reference/` | EU CosIng CSV (~24,000 INCI ingredients, identity + EU restrictions) | No — download separately (gitignored) |
| `data/curated/` | 275 curated risk flags (comedogenic, fungal acne, pregnancy, irritant) with source citations | **Yes** |
| `data/test/` | Real product labels from Open Beauty Facts — for evaluation only | No — regenerable (gitignored) |

The trust boundary is deliberate: EU legal facts (CosIng) and curated skincare
opinions are kept separate and every finding is tagged `kind: regulatory` or
`kind: advice`.

---

## API endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/auth/register` | Create account (bcrypt + JWT cookie) |
| POST | `/auth/login` | Authenticate, set JWT cookie |
| POST | `/auth/logout` | Clear JWT cookie |
| GET | `/auth/me` | Current user profile |
| GET | `/auth/scans` | Authenticated user's scan history |
| POST | `/analyze` | Analyze an ingredient list text |
| POST | `/analyze/routine` | Check layering conflicts across multiple products |
| GET | `/explain/{name}` | Plain-language explanation for one ingredient |
| GET | `/barcode/{code}` | Look up a product by barcode (Open Beauty Facts) |
| POST | `/chat` | RAG Q&A grounded on ingredient DB |
| POST | `/extract-text` | OCR an uploaded label image |
| GET | `/ingredients/count` | How many ingredients are in the DB |

Interactive API docs: `http://localhost:8000/docs`

---

## Run locally (no Docker)

```bash
# 1. Python environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # Windows
# source .venv/bin/activate          # macOS / Linux
pip install -r requirements.txt

# 2. Environment
cp .env.example .env                 # then fill in SECRET_KEY at minimum

# 3. Seed the database
python -m app.ingestion              # full rebuild (drops + recreates)
# or: python -m app.bootstrap        # idempotent (skips if already seeded)

# 4. Start the backend
uvicorn app.main:app --reload

# 5. Start the frontend (separate terminal)
cd frontend && npm install && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

**Tesseract** — The OCR engine must be installed separately on Windows:
[UB-Mannheim Tesseract installer](https://github.com/UB-Mannheim/tesseract/wiki).
The app auto-detects the standard install path — no PATH edits needed.

**CosIng data** — Download the CSV from the
[European Data Portal](https://data.europa.eu/data/datasets/cosmetic-ingredient-database-ingredients-and-fragrance-inventory)
and save it as `data/reference/cosing_ingredients.csv`, then run
`python -m app.ingestion`. Without it the app runs on 275 curated ingredients only.

---

## Run with Docker

```bash
# 1. Create .env from the example and set required secrets
cp .env.example .env
# Edit .env: set SECRET_KEY and POSTGRES_PASSWORD

# 2. Build and start all four services
docker compose up --build
```

This starts:
- **db** — PostgreSQL with pgvector
- **redis** — Redis 7 with persistence
- **backend** — FastAPI + Tesseract; waits for DB, runs Alembic migrations,
  seeds ingredients on first boot (idempotent across restarts)
- **frontend** — Next.js (standalone build)

```bash
docker compose down          # stop
docker compose down -v       # stop and wipe volumes (forces re-seed next boot)
```

---

## Environment variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `SECRET_KEY` | — | **Yes (prod)** | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | `sqlite:///./skinguard.db` | No | Postgres connection string for production |
| `POSTGRES_PASSWORD` | — | **Yes (Docker)** | Postgres password (compose uses `${POSTGRES_PASSWORD:?}`) |
| `ENV` | `development` | No | `development` or `production` (guards SQLite in prod) |
| `REDIS_URL` | `redis://localhost:6379/0` | No | Redis for caching; app degrades gracefully without it |
| `OCR_PROVIDER` | `tesseract` | No | `tesseract` or `google_cloud` |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | No | Path to GCP service account JSON (for Cloud Vision) |
| `GEMINI_API_KEY` | — | No | Gemini API key for LLM explanations and chat; falls back to template if absent |
| `GEMINI_MODEL` | `gemini-2.5-pro` | No | Gemini model name; override to use a different model |
| `MATCH_THRESHOLD` | `82` | No | Fuzzy match score (0–100) below which a token is reported unmatched |
| `SKINGUARD_CORS_ORIGINS` | `http://localhost:3000` | No | Comma-separated allowed origins for CORS |
| `GUNICORN_WORKERS` | `4` | No | Worker count in Docker (ignored in local uvicorn dev mode) |

---

## Tests

```bash
python -m pytest              # 56 tests
python -m pytest -v           # verbose
python -m pytest tests/test_api.py        # API + auth tests
python -m pytest tests/test_matching.py   # matcher + analysis
python -m pytest tests/test_rules.py      # scoring + rules engine
python -m pytest tests/test_ocr.py        # OCR preprocessing
```

---

## Evaluation scripts

```bash
# Real-world matcher coverage (108 Open Beauty Facts products)
python -m scripts.coverage_report

# Re-fetch test product labels from Open Beauty Facts
python -m scripts.fetch_test_labels

# OCR accuracy — Levenshtein + word Jaccard on real images
python -m scripts.evaluate_ocr

# Matcher resolution rate on raw ingredient lists
python -m scripts.evaluate_matcher

# RAG groundedness checks
python -m scripts.evaluate_rag
```

---

## Project structure

```
SkinGuard/
├── app/
│   ├── main.py              # FastAPI app, routes, startup (matcher index build)
│   ├── analysis.py          # Core pipeline: text → findings → score
│   ├── matching.py          # RapidFuzz fuzzy matcher + label pre-cleaning
│   ├── embedding_matcher.py # MiniLM semantic matcher (pgvector / numpy fallback)
│   ├── rules.py             # Data-driven rules engine, position-weighted scoring
│   ├── explain.py           # Plain-language explanations (template + Gemini)
│   ├── llm.py               # Gemini client with graceful fallback
│   ├── ocr.py               # Image preprocessing + Tesseract / Cloud Vision
│   ├── barcode.py           # Open Beauty Facts barcode lookup
│   ├── cache.py             # Redis caching layer
│   ├── auth.py              # bcrypt + JWT (HttpOnly cookie)
│   ├── users.py             # User CRUD + scan history
│   ├── ingestion.py         # CosIng + curated CSV → DB loader
│   ├── bootstrap.py         # Idempotent seed (container restarts safe)
│   ├── models.py            # SQLAlchemy: Ingredient, Alias, User, Scan
│   ├── schemas.py           # Pydantic request / response models
│   ├── config.py            # Settings (pydantic-settings, .env)
│   └── database.py          # Engine, session factory
├── alembic/                 # DB migrations (3 versions)
├── frontend/
│   ├── app/page.tsx         # Main page — imports all components
│   └── components/          # 13 components (Auth, Upload, Results, Chat, Compare…)
├── data/
│   ├── curated/             # ingredient_flags.csv (275 rows) + SOURCES.md
│   ├── reference/           # CosIng CSV (gitignored, download separately)
│   └── test/                # OBF product labels (gitignored, regenerable)
├── scripts/                 # Evaluation + data scripts
├── tests/                   # 56 tests across 4 files
├── docker/entrypoint.sh     # Wait for DB → Alembic → seed → gunicorn
├── Dockerfile               # Backend + Tesseract
├── frontend/Dockerfile      # Next.js standalone
└── docker-compose.yml       # db + redis + backend + frontend
```

---

## Known gaps before production

- **Docker end-to-end** — verify `docker compose up --build` succeeds after the pgvector + Redis service additions
- **OCR on real photos** — tested on synthetic images; needs validation on actual phone photos of glossy labels
- **Password reset** — no forgot-password flow; requires an email provider (SendGrid, Resend, etc.)
