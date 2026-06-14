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
- Groq (Llama 3.3 70B) or Gemini 2.5 Pro for grounded plain-language explanations and Q&A (optional)
- Tesseract OCR + Pillow preprocessing / Google Cloud Vision

**Frontend** — Next.js 14, React, Tailwind CSS, `html5-qrcode`  
**Auth** — bcrypt passwords + JWT stored in HttpOnly cookies  
**Infra** — Docker Compose (4 services), Alembic migrations, GitHub Actions CI

---

## Data

| Folder | What it holds | Committed? |
|---|---|---|
| `data/reference/` | EU CosIng CSV (~24,000 INCI ingredients, identity + EU restrictions) | No — download separately (gitignored) |
| `data/curated/` | 348 curated risk flags (comedogenic, fungal acne, pregnancy, irritant) with source citations | **Yes** |
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

## How it works (end-to-end flow)

A single analysis travels through this pipeline. Each stage names the tech doing
the work and where it lives in the code.

```
            ┌─────────────── INPUT (one of three) ───────────────┐
  Paste text │     Upload label photo      │     Scan barcode      │
            └──────┬──────────────┬──────────────────┬────────────┘
                   │              │                   │
                   │        POST /extract-text   GET /barcode/{code}
                   │        OCR (Tesseract /      Open Beauty Facts
                   │        Google Cloud Vision)  HTTP lookup (cached)
                   │        app/ocr.py            app/barcode.py
                   │              │                   │
                   └──────────────┴───────────────────┘
                                  ▼  ingredient text
                         POST /analyze   (app/routers/analyze.py)
                                  ▼
   ① CLEAN + SPLIT      app/matching.py — normalise punctuation, split the INCI list
                                  ▼
   ② MATCH each token   RapidFuzz fuzzy match → if weak, MiniLM sentence-embedding
       to a canonical   semantic match (app/embedding_matcher.py, pgvector/numpy).
       INCI ingredient  Below MATCH_THRESHOLD → surfaced as "unmatched", never guessed.
                                  ▼
   ③ SCORE              app/rules.py — a data-driven rules engine evaluates each
       vs your profile  matched Ingredient against your skin profile. Penalties are
                        weighted by label position (concentration proxy); a single
                        "danger" caps the score. Every finding carries a `source`
                        and `kind` (regulatory = EU fact vs advice = curated).
                                  ▼
   ④ ASSEMBLE RESULT    app/analysis.py — safety score (0–100, "indicative"),
                        coverage %, assessment-depth %, findings + citations,
                        safer-alternative suggestions, unmatched tokens.
                                  ▼
   ⑤ EXPLAIN (on demand) GET /explain/{name}?llm=true — Groq (Llama 3.3) or Gemini
                        grounded explanation, or POST /chat for Q&A. Falls back to
                        template text when no LLM key is set (app/explain.py). The UI
                        shows whether AI-enhanced mode is active.
```

**Supporting layers (cross-cutting):**

| Concern | Tech | Where |
|---|---|---|
| Web API | FastAPI + Pydantic, SlowAPI rate limiting | `app/main.py`, `app/routers/` |
| Auth | bcrypt password hash + HS256 JWT in HttpOnly cookie | `app/auth.py` |
| Persistence | SQLAlchemy 2.0 → SQLite (dev) / PostgreSQL + pgvector (prod) | `app/models.py`, `app/database.py` |
| Schema migrations | Alembic (`alembic upgrade head` on container start) | `migrations/` |
| Caching | Redis (analysis, OCR, barcode results) — degrades gracefully if absent | `app/cache.py` |
| Data seed | EU CosIng CSV (identity/legal) + 348 curated risk flags (advice) | `app/ingestion.py` |
| Frontend | Next.js 14 + React + Tailwind; `/api/*` proxied to backend | `frontend/` |
| Routine check | Declarative active-ingredient conflict table | `app/routers/analyze.py` |

The **trust boundary is deliberate**: EU legal facts (CosIng) and curated skincare
opinions are stored and tagged separately, and the score is reported *alongside*
coverage so the app never implies certainty it doesn't have.

---

## Dependency & environment files

The project intentionally splits these — they are **not** duplicates:

| File | Committed? | Purpose |
|---|---|---|
| `requirements.txt` | Yes | Core runtime deps needed to run the app anywhere |
| `requirements-optional.txt` | Yes | `requirements.txt` + heavy optional integrations (Google Cloud Vision OCR, Sentry). Lazily imported; the Docker image installs this file |
| `requirements-dev.txt` | Yes | `requirements.txt` + test/dev tools (pytest, coverage). Used by CI and local dev |
| `.env.example` | Yes | Documented template of every environment variable — copy to `.env` |
| `.env` | **No** (gitignored) | Your real local secrets (`SECRET_KEY`, keys). Never committed |

```bash
pip install -r requirements.txt            # minimal run
pip install -r requirements-dev.txt        # run + tests (recommended for dev)
pip install -r requirements-optional.txt   # + Cloud Vision / Sentry (prod parity)
```

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
# or: python -m app.ingestion --bootstrap   # idempotent (skips if already seeded)

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
`python -m app.ingestion`. Without it the app runs on 348 curated ingredients only.

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
| `GROQ_API_KEY` | — | No | Groq API key for LLM explanations and chat (preferred provider); falls back to template if absent |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | No | Groq model name |
| `GEMINI_API_KEY` | — | No | Gemini API key (alternative LLM provider); falls back to template if absent |
| `GEMINI_MODEL` | `gemini-2.5-pro` | No | Gemini model name |
| `LLM_PROVIDER` | auto | No | Force `groq` or `gemini` when both keys are set (default: Groq if present, else Gemini) |
| `MATCH_THRESHOLD` | `82` | No | Fuzzy match score (0–100) below which a token is reported unmatched |
| `SKINGUARD_CORS_ORIGINS` | `http://localhost:3000` | No | Comma-separated allowed origins for CORS |
| `GUNICORN_WORKERS` | `4` | No | Worker count in Docker (ignored in local uvicorn dev mode) |

---

## Tests

```bash
python -m pytest              # 111 tests
python -m pytest -v           # verbose
python -m pytest tests/test_api.py        # API + auth + routine conflict engine
python -m pytest tests/test_matching.py   # matcher + analysis
python -m pytest tests/test_rules.py      # scoring + rules engine
python -m pytest tests/test_ocr.py        # OCR preprocessing
```

> CI (`.github/workflows/ci.yml`) runs the full test suite, verifies Alembic
> migrations apply/round-trip, checks models match migrations (`alembic check`),
> and gates ingredient-matching **accuracy** (RapidFuzz F1 ≥ 0.95 on the curated
> gold set) so quality regressions fail the build.

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
│   ├── main.py              # FastAPI app, lifespan, middleware, router registration
│   ├── deps.py              # Shared singletons: matcher, limiter, rate-limit helpers
│   ├── routers/
│   │   ├── auth.py          # /auth/* — register, login, logout, me, password reset
│   │   ├── users.py         # /users/* — profile update, scan history
│   │   ├── analyze.py       # /analyze, /analyze/routine
│   │   └── misc.py          # /health, /ingredients/count, /explain, /barcode, /chat, /extract-text
│   ├── analysis.py          # Core pipeline: text → findings → score
│   ├── matching.py          # RapidFuzz fuzzy matcher + label pre-cleaning
│   ├── embedding_matcher.py # MiniLM semantic matcher (pgvector / numpy fallback)
│   ├── rules.py             # Data-driven rules engine, position-weighted scoring
│   ├── explain.py           # Plain-language explanations + Gemini client (graceful fallback)
│   ├── ocr.py               # Image preprocessing + Tesseract / Cloud Vision
│   ├── barcode.py           # Open Beauty Facts barcode lookup
│   ├── cache.py             # Redis caching layer
│   ├── auth.py              # bcrypt + JWT (HttpOnly cookie)
│   ├── users.py             # User CRUD + scan history
│   ├── ingestion.py         # CosIng + curated CSV → DB loader (`--bootstrap` = idempotent seed)
│   ├── models.py            # SQLAlchemy: Ingredient, Alias, User, Scan
│   ├── schemas.py           # Pydantic request / response models
│   ├── config.py            # Settings (pydantic-settings, .env)
│   └── database.py          # Engine, session factory
├── migrations/              # Alembic DB migrations (env.py + versions/)
├── frontend/
│   ├── app/page.tsx         # Main page + landing — imports all components
│   ├── app/reset-password/  # Password reset page (token from email link)
│   └── components/          # 5 components (BarcodeScanner, ProfilePanel,
│                            #   ResultsDashboard, RoutineAnalyzer, ComparePanel)
├── data/
│   ├── curated/             # ingredient_flags.csv (348 rows) + SOURCES.md
│   ├── reference/           # CosIng CSV (gitignored, download separately)
│   └── test/                # OBF product labels (gitignored, regenerable)
├── scripts/                 # Evaluation + data scripts
├── tests/                   # 111 tests across 9 files
├── docker/entrypoint.sh     # Wait for DB → Alembic → seed → gunicorn
├── Dockerfile               # Backend + Tesseract
├── frontend/Dockerfile      # Next.js standalone
└── docker-compose.yml       # db + redis + backend + frontend
```

---

## Password reset

The forgot-password flow is fully wired end-to-end:

1. Click **Forgot your password?** on the sign-in modal → enter email → `POST /auth/forgot-password`
2. Backend creates a signed 1-hour JWT and either sends it via [Resend](https://resend.com) (when `RESEND_API_KEY` is set) or logs the link to stdout for local development.
3. The reset link points to `/reset-password?token=…` — a dedicated page that calls `POST /auth/reset-password` and redirects back to the app on success.

To enable email delivery, set `RESEND_API_KEY` in your `.env`. Without it the link is logged at `WARNING` level — fine for development, not for production.

---

## Coverage model & trustworthiness

The score is only as complete as the **risk data** behind the ingredients on a
label. SkinGuard is deliberate about this rather than papering over it:

- **Recognised ≠ assessed.** Matching a token to a canonical INCI name (via the
  RapidFuzz/embedding matcher) means we *recognise* it. It is only *assessed* if
  it carries a risk signal: a curated flag (comedogenic / irritant / fungal-acne /
  pregnancy), an EU `regulatory_status` of banned/restricted, or a fragrance /
  essential-oil function. See `has_risk_data()` in `app/rules.py`.
- The API returns `assessed_count`, `matched_count`, and `assessment_depth_percent`,
  and the UI shows *"risk data for X of Y recognised ingredients"*. When nothing is
  assessed, the score is **withheld** (`null`) instead of shown as a misleading 100.

**To maximise coverage in production:**

1. **Load EU CosIng** (`data/reference/cosing_ingredients.csv`, ~24k ingredients)
   then run `python -m app.ingestion`. This widens both recognition and the
   regulatory-status assessment far beyond the 348 curated rows.
2. **Curated regulatory facts** are already baked into the committed CSV by
   `scripts/patch_regulatory.py` (EU Reg 1223/2009 Annex II/III/VI), so banned and
   restricted ingredients are flagged even without the full CosIng download.
3. **Grow the curated set** (`scripts/expand_dataset.py`) — the single biggest lever
   on assessment depth. CI gates matcher F1 so additions don't regress matching.

---

## Known gaps before production

- **OCR on real photos** — tested on synthetic images; needs validation on actual phone photos of glossy labels
- **Curated assessment depth** — 348 curated ingredients; load CosIng and expand the curated set to raise coverage (see *Coverage model* above)
