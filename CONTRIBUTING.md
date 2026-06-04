# Contributing to SkinGuard

Thanks for your interest in contributing!

## Getting started

### Prerequisites
- Python 3.12+
- Node.js 20+
- Docker + Docker Compose (for full-stack testing)
- PostgreSQL with pgvector (or use Docker)

### Local setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt

# Frontend
cd frontend && npm install

# Start backend (SQLite, no Docker needed)
SKIP_LIFESPAN=1 uvicorn app.main:app --reload

# Start frontend
cd frontend && npm run dev
```

### Running tests

```bash
# All backend tests
pytest

# With coverage
pytest --cov=app --cov-report=term-missing

# Frontend lint
cd frontend && npm run lint
```

## Pull request checklist

- [ ] `pytest` passes (60+ tests)
- [ ] `npm run lint` — 0 errors, 0 warnings
- [ ] No secrets, API keys, or `.env` files committed
- [ ] New endpoints have rate limiting (`@limiter.limit(...)`)
- [ ] All user-facing text avoids medical claims — educational only

## Ingredient data

The EU CosIng CSV (`data/reference/cosing_ingredients.csv`) and test data are **gitignored** — they must be sourced independently. See `data/curated/SOURCES.md` for provenance.

Do not scrape or redistribute INCIDecoder data.

## Code style

- Python: Black formatting, type hints on all public functions
- TypeScript: ESLint flat config (`eslint.config.mjs`), no `any` types
- Commits: conventional format (`feat:`, `fix:`, `chore:`, `docs:`)
