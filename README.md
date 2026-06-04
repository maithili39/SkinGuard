# SkinGuard

AI-powered skincare **ingredient analyzer** and **routine compatibility checker**. Upload a product label photo, scan a barcode, or paste an ingredient list to get an honest, sourced safety assessment tailored to *your* skin profile: acne, fungal acne, sensitivity, pregnancy, rosacea, and custom avoid lists.

> ⚠️ Educational use only — **not medical advice.**

---

## Why this is built data-first

The value lives in the data, matching algorithms, rules, and AI evaluations.
- `data/reference/` — **authoritative** EU CosIng reference data (~24,181 ingredients, 24,633 aliases). Identity + legal restrictions.
- `data/curated/`   — **our** skincare-advice flags (comedogenic / fungal acne / pregnancy / irritant / rosacea). Expanded to 275+ ingredients with clear primary scientific citations.
- `data/test/`      — messy real-world labels and images (Open Beauty Facts) used strictly for evaluation, testing, and metric generation.

---

## Advanced AI/ML & Engineering Upgrades

### 1. Hybrid Sentence-Embedding Matcher (`EmbeddingMatcher`)
Replaced basic string match with a hybrid semantic engine using `all-MiniLM-L6-v2` embeddings in-memory.
- **Fast Batch Matching**: Custom batch token vectorization to compute cosine similarity against 24.6k aliases in a single forward pass, eliminating PyTorch overhead.
- **Ambiguity Band & Fallback**: Semantic hits within the uncertainty boundary ($\pm$5% of threshold) are tiebroken using RapidFuzz WRatio. Cosine misses degrade gracefully to fuzzy matching.
- **Precision Metric**: Measures token resolution rate on messy real-world labels, yielding **97.88% match rate** (vs 91.50% baseline).

### 2. RAG Groundedness & Chat Q&A
Grounds skincare Q&A queries against local structured database ingredient facts via Gemini 2.5 Pro.
- **System Guardrails**: System instructions strictly forbid the LLM from inventing claims or importing external knowledge.
- **Graceful Fallbacks**: Degrades to clean simulated template summaries when `GEMINI_API_KEY` is not present, allowing secure operation in CI/CD.

### 3. Routine Layering & Interaction Analysis
New endpoint (`POST /analyze/routine`) and Next.js UI component (`RoutineAnalyzer.tsx`) that checks layering compatibility between multiple products:
- **AHA + Retinol**: Flags risk of skin barrier disruption and severe irritation.
- **BHA + Retinol**: Flags risk of over-exfoliation and dryness.
- **Benzoyl Peroxide + Retinol**: Flags deactivation of Retinoids through oxidation.
- **Vitamin C + AHA/BHA**: Flags acidity-driven irritation and Vitamin C degradation.

### 4. Side-by-Side Product Comparison
The `ComparePanel.tsx` component lets users select any two products (including current analysis and scan history) to display:
- Side-by-side comparative safety scores.
- Flagged warning overlaps (Both, Only A, Only B).
- Exact Jaccard overlap percentage of ingredients.

---

## Evaluation Scripts (Academics & Metrics)

The codebase includes scripts to evaluate OCR, matching, and RAG pipelines:

### 1. OCR Accuracy Evaluation
```bash
python -m scripts.evaluate_ocr
```
Downloads product labels, runs local Tesseract adaptive pre-processing, and calculates **Levenshtein Distance** and **Word Jaccard Similarity** against ground-truth ingredients.

### 2. Matcher Resolution Rate
```bash
python -m scripts.evaluate_matcher_real
```
Measures token mapping resolution on 50+ raw uncleaned ingredients lists, printing a markdown table of hybrid embedding match rate improvements.

### 3. RAG Groundedness & Faithfulness
```bash
python -m scripts.evaluate_rag
```
Sends test questions against a mock database, asserting that the response mentions correct warnings (correctness) and contains zero hallucinated ingredients not in the context (faithfulness).

---

## Current Status ✅ Complete

- [x] **Database & Scaffold**: SQLAlchemy SQLite / Postgres support with Alembic migrations.
- [x] **Expanded Dataset**: 275+ fully assessed curated ingredients, 24,181 reference ingredients, 24,633 aliases.
- [x] **Hybrid Matcher**: EmbeddingMatcher + RapidFuzz with fast batching.
- [x] **Rate Limiting**: IP and JWT-based hybrid rate limiting (30 req/min for analysis, 10 req/min for OCR/chat).
- [x] **RAG Chat**: Context-grounded Q&A with Gemini 2.5 Pro.
- [x] **Barcode Lookup**: Live scan lookup against Open Beauty Facts API.
- [x] **Routine Layering UI**: Active layering checks.
- [x] **Product Comparison**: Side-by-side metrics and overlap.
- [x] **Alembic migrations**: Fully configured database versioning.
- [x] **Git Cleanliness**: `node_modules` untracked.
- [x] **CI Pipeline & Tests**: 56 unit/integration tests passing.

---

## Run it (Local Dev)

```bash
# Set up venv and dependencies
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Ingest/Seed database
python -m app.ingestion
alembic upgrade head

# Start Backend (FastAPI)
uvicorn app.main:app --reload

# Start Frontend (Next.js)
cd frontend
npm install
npm run dev
```

API: http://localhost:8000  
Frontend: http://localhost:3000  
Interactive docs: http://localhost:8000/docs

---

## Running Tests

```bash
python -m pytest
```

---

## Architecture Diagram

```
Frontend (Next.js :3000) ←──→ Backend (FastAPI :8000) ──→ SQLite / Postgres
                              ├── OCR (Tesseract / Pillow)
                              ├── EmbeddingMatcher (MiniLM-L6-v2 in-memory)
                              ├── RAG Chat Engine (Gemini 2.5 Pro)
                              ├── Routine Rules Analyzer
                              └── Auth (JWT / bcrypt)
```
