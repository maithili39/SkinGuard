# SkinGuard

AI-powered skincare ingredient analyzer. Paste an ingredient list, scan a barcode, or upload a label photo — SkinGuard gives you an honest safety assessment tailored to your skin profile.

> ⚠️ Educational use only — **not medical advice.**

---

## Features

- **OCR** — extract ingredients from a label photo (Tesseract / Google Cloud Vision)
- **Smart matching** — fuzzy + semantic (MiniLM) matching resolves messy OCR and variant names to canonical INCI ingredients
- **Rules engine** — evaluates ingredients against your profile (acne-prone, fungal acne, sensitive, pregnancy, rosacea, custom avoid list)
- **Safety score** — 0–100, position-weighted, labelled *indicative*
- **Routine checker** — detects dangerous active ingredient layering conflicts (AHA + Retinol, etc.)
- **AI explanations** — Groq (Llama 3.3) or Gemini grounded explanations + Q&A chat (optional)
- **Barcode scan** — look up products via Open Beauty Facts

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic, Gunicorn |
| Database | PostgreSQL + pgvector (prod) / SQLite (dev) |
| AI / ML | sentence-transformers (`all-MiniLM-L6-v2`), Groq, Gemini, Tesseract |
| Frontend | Next.js 14, React, Tailwind CSS |
| Auth | bcrypt + HS256 JWT (HttpOnly cookie) |
| Infra | Docker Compose, Redis, GitHub Actions CI |

---

## Quick Start

### Local (no Docker)

```bash
# 1. Install dependencies
python -m venv .venv
.\.venv\Scripts\Activate.ps1       # Windows
pip install -r requirements-dev.txt

# 2. Configure environment
cp .env.example .env               # set SECRET_KEY at minimum

# 3. Seed the database
python -m app.ingestion

# 4. Run backend
uvicorn app.main:app --reload

# 5. Run frontend (new terminal)
cd frontend && npm install && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

### Docker

```bash
cp .env.example .env               # set SECRET_KEY + POSTGRES_PASSWORD
docker compose up --build
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | **Yes (prod)** | JWT signing key — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | No | Postgres URL (defaults to SQLite for dev) |
| `POSTGRES_PASSWORD` | Yes (Docker) | Postgres password |
| `ENV` | No | `development` or `production` |
| `GROQ_API_KEY` | No | Groq API key for LLM explanations (preferred) |
| `GEMINI_API_KEY` | No | Gemini API key (alternative LLM) |
| `RESEND_API_KEY` | No | Resend key for password reset emails |
| `REDIS_URL` | No | Redis URL — app works without it |
| `OCR_PROVIDER` | No | `tesseract` (default) or `google_cloud` |

See [`.env.example`](.env.example) for all options.

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login (sets JWT cookie) |
| POST | `/auth/logout` | Clear session |
| GET | `/auth/me` | Current user profile |
| POST | `/analyze` | Analyze ingredient list |
| POST | `/analyze/routine` | Multi-product conflict check |
| GET | `/explain/{name}` | AI explanation for one ingredient |
| GET | `/barcode/{code}` | Barcode product lookup |
| POST | `/chat` | RAG Q&A on analysis results |
| POST | `/extract-text` | OCR a label image |

---

## Tests

```bash
pytest                     # 111 tests, 80% coverage gate
pytest tests/test_api.py   # API + auth
pytest tests/test_rules.py # scoring engine
```

CI runs on every push: full test suite, Alembic migration round-trip, and matcher accuracy gate (F1 ≥ 0.95).

---

## Data

| Path | Description | Committed |
|---|---|---|
| `data/curated/ingredient_flags.csv` | 348 ingredients with risk flags + sources | ✅ Yes |
| `data/reference/cosing_ingredients.csv` | EU CosIng ~24k INCI ingredients | ❌ Download separately |

To load CosIng, download from the [European Data Portal](https://data.europa.eu/data/datasets/cosmetic-ingredient-database-ingredients-and-fragrance-inventory), save to `data/reference/cosing_ingredients.csv`, then run `python -m app.ingestion`.
