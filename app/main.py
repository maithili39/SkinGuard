import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.analysis import analyze_text
from app.auth import create_token, get_current_user, require_user
from app.database import SessionLocal, get_db
from app.explain import explain_ingredient, explain_ingredient_llm
from app.matching import Matcher
from app.models import Ingredient, User
from app.ocr import OCRUnavailable
from app.ocr import extract_text as run_ocr
from app.rules import Profile
from app.schemas import AnalyzeIn, ChatIn, ChatOut, LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserIn, RoutineAnalyzeIn
from app import users as users_svc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("skinguard")

# Max upload size for label images (default 8 MB) — protects OCR from huge files.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024))

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[])


def hybrid_rate_limit_key(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        from app.auth import decode_token
        email = decode_token(token)
        if email:
            return f"user:{email.strip().lower()}"
    return get_remote_address(request)


# ── Singletons ────────────────────────────────────────────────────────────────
_matcher: Optional[Matcher] = None
_embedding_matcher = None  # EmbeddingMatcher | None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the Matcher (and optionally EmbeddingMatcher) index at startup."""
    global _matcher, _embedding_matcher

    if os.environ.get("SKIP_LIFESPAN") != "1":
        logger.info("Building matcher index from DB aliases…")
        db = SessionLocal()
        try:
            _matcher = Matcher(db)
            logger.info(
                "Matcher ready: %d aliases, %d ingredients indexed.",
                len(_matcher._choices),
                len(_matcher._id_to_inci),
            )
            # Try to build the embedding matcher (requires sentence-transformers).
            try:
                from app.embedding_matcher import EmbeddingMatcher
                logger.info("Building sentence-embedding index (first run is slow)…")
                _embedding_matcher = EmbeddingMatcher.build(db, _matcher)
            except ImportError:
                logger.info(
                    "sentence-transformers not installed — using RapidFuzz matcher only. "
                    "Install with: pip install sentence-transformers"
                )
            except Exception as exc:
                logger.warning("EmbeddingMatcher build failed: %s — using RapidFuzz.", exc)
        finally:
            db.close()

    yield

    _matcher = None
    _embedding_matcher = None
    logger.info("Matcher index cleared.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SkinGuard API",
    description=(
        "AI-powered skincare ingredient analyzer. "
        "Educational use only — not medical advice."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_origins = os.environ.get(
    "SKINGUARD_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Dependency: active Matcher (embedding if available, else fuzzy) ───────────

def get_matcher() -> Matcher:
    """Return the best available matcher: EmbeddingMatcher → Matcher fallback."""
    if _embedding_matcher is not None:
        return _embedding_matcher  # type: ignore[return-value]
    if _matcher is None:
        raise RuntimeError(
            "Matcher not initialised. "
            "Start the app via uvicorn (lifespan) or override get_matcher in tests."
        )
    return _matcher


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    from app.llm import get_model_name, is_available as llm_ok
    return {
        "status": "ok",
        "matcher_aliases": len(_matcher._choices) if _matcher else 0,
        "embedding_matcher": _embedding_matcher is not None,
        "llm_model": get_model_name() if llm_ok() else "unavailable",
        "version": "0.3.0",
    }


# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    """Register a new account. Returns a JWT token (immediately logged in)."""
    try:
        user = users_svc.register_user(db, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    token = create_token(user.email)
    return TokenOut(access_token=token, email=user.email, profile=users_svc.profile_dict(user))


@app.post("/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    """Authenticate with email + password. Returns a JWT Bearer token."""
    user = users_svc.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_token(user.email)
    return TokenOut(access_token=token, email=user.email, profile=users_svc.profile_dict(user))


@app.get("/auth/me")
def me(user: User = Depends(require_user)):
    """Return the currently authenticated user's profile."""
    return {"email": user.email, "profile": users_svc.profile_dict(user)}


@app.get("/auth/scans")
def auth_scan_history(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Return currently authenticated user's scan history."""
    return {
        "email": current_user.email,
        "scans": [
            {
                "id": s.id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "safety_score": s.safety_score,
                "coverage_percent": s.coverage_percent,
                "summary": s.summary,
                "input_text": s.input_text,
            }
            for s in current_user.scans[:limit]
        ],
    }



# ── User / profile endpoints ──────────────────────────────────────────────────

@app.post("/users", deprecated=True)
def create_or_get_user(payload: UserIn, db: Session = Depends(get_db)):
    """Legacy endpoint: register/fetch a user by email only (no password).

    Deprecated — use POST /auth/register instead.
    """
    raise HTTPException(
        status_code=410,
        detail="This legacy endpoint is gone. Please use POST /auth/register instead."
    )


@app.put("/users/{email}/profile")
def save_profile(
    email: str,
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if current_user.email.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden: You can only update your own profile.")
    user = users_svc.update_profile(db, current_user, payload.model_dump())
    return {"email": user.email, "profile": users_svc.profile_dict(user)}


@app.get("/users/{email}/scans")
def scan_history(
    email: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if current_user.email.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own scans.")
    user = db.query(User).filter_by(email=email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No such user.")
    return {
        "email": user.email,
        "scans": [
            {
                "id": s.id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "safety_score": s.safety_score,
                "coverage_percent": s.coverage_percent,
                "summary": s.summary,
                "input_text": s.input_text,
            }
            for s in user.scans[:limit]
        ],
    }



# ── Ingredient info ───────────────────────────────────────────────────────────

@app.get("/ingredients/count")
def ingredient_count(db: Session = Depends(get_db)):
    return {"ingredients": db.query(Ingredient).count()}


# ── Core analysis endpoints ───────────────────────────────────────────────────

@app.post("/analyze")
@limiter.limit("30/minute", key_func=hybrid_rate_limit_key)
def analyze(
    request: Request,
    payload: AnalyzeIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Analyze an ingredient list. Rate-limited to 30 req/min per IP."""
    profile = Profile(
        pregnant=payload.profile.pregnant,
        sensitive_skin=payload.profile.sensitive_skin,
        acne_prone=payload.profile.acne_prone,
        fungal_acne=payload.profile.fungal_acne,
        rosacea=payload.profile.rosacea,
        avoid_list=payload.profile.avoid_list,
    )
    result = analyze_text(db, payload.text, profile, matcher=matcher)

    save_user = current_user
    if save_user is None and payload.user_email:
        save_user = users_svc.get_or_create_user(db, payload.user_email)

    if save_user:
        users_svc.save_scan(db, save_user, payload.text, result)
        logger.info("Saved scan for %s (score=%s)", save_user.email, result["safety_score"])

    return result


@app.post("/analyze/routine")
def analyze_routine(
    payload: RoutineAnalyzeIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """Analyze a routine (multiple products) for dangerous active ingredient layering conflicts."""
    categories_def = {
        "AHA": {"glycolic acid", "lactic acid", "mandelic acid", "citric acid", "malic acid", "tartaric acid"},
        "BHA": {"salicylic acid", "betaine salicylate"},
        "Retinol": {"retinol", "retinyl palmitate", "retinal", "retinaldehyde", "hydroxypinacolone retinoate", "adapalene", "tretinoin"},
        "Benzoyl Peroxide": {"benzoyl peroxide"},
        "Vitamin C": {"ascorbic acid", "3-o-ethyl ascorbic acid", "ascorbyl glucoside", "tetrahexyldecyl ascorbate", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate", "ascorbyl palmitate"}
    }

    product_actives = {}
    for prod in payload.products:
        matches = matcher.match_list(prod.text)
        # Find which categories are in this product
        actives = {}
        for m in matches:
            if m.status == "matched" and m.matched_inci:
                name_lower = m.matched_inci.lower()
                for cat, INCI_set in categories_def.items():
                    if name_lower in INCI_set:
                        actives[cat] = m.matched_inci
        product_actives[prod.name] = actives

    conflicts = []
    prod_names = list(product_actives.keys())
    for i in range(len(prod_names)):
        for j in range(i + 1, len(prod_names)):
            p1 = prod_names[i]
            p2 = prod_names[j]
            actives1 = product_actives[p1]
            actives2 = product_actives[p2]

            # 1. AHA + Retinol
            if "AHA" in actives1 and "Retinol" in actives2:
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["AHA"],
                    "ingredient_b": actives2["Retinol"],
                    "conflict_type": "AHA + Retinol",
                    "severity": "danger",
                    "message": f"Alpha Hydroxy Acids (AHAs) like {actives1['AHA']} and Retinoids like {actives2['Retinol']} both speed up skin cell turnover. Layering them can disrupt your skin barrier, causing redness, dryness, and severe irritation. Tip: Use AHA in the morning (with SPF) and Retinol at night, or alternate nights."
                })
            if "Retinol" in actives1 and "AHA" in actives2:
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["Retinol"],
                    "ingredient_b": actives2["AHA"],
                    "conflict_type": "AHA + Retinol",
                    "severity": "danger",
                    "message": f"Alpha Hydroxy Acids (AHAs) like {actives2['AHA']} and Retinoids like {actives1['Retinol']} both speed up skin cell turnover. Layering them can disrupt your skin barrier, causing redness, dryness, and severe irritation. Tip: Use AHA in the morning (with SPF) and Retinol at night, or alternate nights."
                })

            # 2. BHA + Retinol
            if "BHA" in actives1 and "Retinol" in actives2:
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["BHA"],
                    "ingredient_b": actives2["Retinol"],
                    "conflict_type": "BHA + Retinol",
                    "severity": "danger",
                    "message": f"Beta Hydroxy Acids (BHAs) like {actives1['BHA']} exfoliate deep inside pores while Retinoids like {actives2['Retinol']} speed up cell turnover. Combining them in the same routine can cause severe dryness, flaking, and over-exfoliation. Tip: Use BHA in the morning or alternate nights with Retinol."
                })
            if "Retinol" in actives1 and "BHA" in actives2:
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["Retinol"],
                    "ingredient_b": actives2["BHA"],
                    "conflict_type": "BHA + Retinol",
                    "severity": "danger",
                    "message": f"Beta Hydroxy Acids (BHAs) like {actives2['BHA']} exfoliate deep inside pores while Retinoids like {actives1['Retinol']} speed up cell turnover. Combining them in the same routine can cause severe dryness, flaking, and over-exfoliation. Tip: Use BHA in the morning or alternate nights with Retinol."
                })

            # 3. Benzoyl Peroxide + Retinol
            if "Benzoyl Peroxide" in actives1 and "Retinol" in actives2:
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["Benzoyl Peroxide"],
                    "ingredient_b": actives2["Retinol"],
                    "conflict_type": "Benzoyl Peroxide + Retinol",
                    "severity": "danger",
                    "message": f"Benzoyl Peroxide oxidizes and deactivates Retinoids like {actives2['Retinol']} when applied together, making the Retinol ineffective and increasing irritation. Tip: Use Benzoyl Peroxide in the morning and Retinol at night."
                })
            if "Retinol" in actives1 and "Benzoyl Peroxide" in actives2:
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["Retinol"],
                    "ingredient_b": actives2["Benzoyl Peroxide"],
                    "conflict_type": "Benzoyl Peroxide + Retinol",
                    "severity": "danger",
                    "message": f"Benzoyl Peroxide oxidizes and deactivates Retinoids like {actives1['Retinol']} when applied together, making the Retinol ineffective and increasing irritation. Tip: Use Benzoyl Peroxide in the morning and Retinol at night."
                })

            # 4. Vitamin C + AHA/BHA
            if "Vitamin C" in actives1 and ("AHA" in actives2 or "BHA" in actives2):
                other_active = actives2.get("AHA") or actives2.get("BHA") or ""
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": actives1["Vitamin C"],
                    "ingredient_b": other_active,
                    "conflict_type": "Vitamin C + AHA/BHA",
                    "severity": "warning",
                    "message": f"Vitamin C like {actives1['Vitamin C']} is highly acidic, and combining it with acids like {other_active} can destabilize the Vitamin C, lower its efficacy, and trigger redness or irritation. Tip: Use Vitamin C in the morning and exfoliating acids in the evening."
                })
            if ("AHA" in actives1 or "BHA" in actives1) and "Vitamin C" in actives2:
                other_active = actives1.get("AHA") or actives1.get("BHA") or ""
                conflicts.append({
                    "product_a": p1,
                    "product_b": p2,
                    "ingredient_a": other_active,
                    "ingredient_b": actives2["Vitamin C"],
                    "conflict_type": "Vitamin C + AHA/BHA",
                    "severity": "warning",
                    "message": f"Vitamin C like {actives2['Vitamin C']} is highly acidic, and combining it with acids like {other_active} can destabilize the Vitamin C, lower its efficacy, and trigger redness or irritation. Tip: Use Vitamin C in the morning and exfoliating acids in the evening."
                })

    # Summary recommendation
    if not conflicts:
        summary = "No active ingredient conflicts detected. Your routine layers safely!"
        compatible = True
    else:
        num_danger = sum(1 for c in conflicts if c["severity"] == "danger")
        num_warning = sum(1 for c in conflicts if c["severity"] == "warning")
        summary = f"Routine analysis found {num_danger} high-risk (danger) and {num_warning} moderate-risk (warning) layering conflicts."
        compatible = False

    return {
        "compatible": compatible,
        "summary": summary,
        "product_actives": product_actives,
        "conflicts": conflicts
    }


@app.get("/explain/{name}")
def explain(
    name: str,
    llm: bool = False,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """Plain-language explanation for a single ingredient.

    Add ?llm=true to get a Gemini 2.5 Pro grounded explanation instead of the template.
    """
    match = matcher.match_token(name)
    if match.status != "matched":
        raise HTTPException(status_code=404, detail=f"No ingredient found for '{name}'.")
    ing = db.get(Ingredient, match.ingredient_id)
    explanation = explain_ingredient_llm(ing) if llm else explain_ingredient(ing)
    return {
        "ingredient": ing.inci_name,
        "confidence": match.confidence,
        "match_method": match.match_method,
        "explanation": explanation,
        "llm_used": llm,
    }


# ── Barcode lookup endpoint ───────────────────────────────────────────────────

@app.get("/barcode/{code}")
@limiter.limit("20/minute")
def barcode_lookup(code: str, request: Request):
    """Look up product details and ingredients by barcode using Open Beauty Facts."""
    from app.barcode import cached_lookup_barcode, ProductNotFound
    try:
        return cached_lookup_barcode(code)
    except ProductNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── RAG Chat endpoint ─────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatOut)
@limiter.limit("10/minute")
def chat(
    request: Request,
    payload: ChatIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """RAG-grounded Q&A about a product's ingredients.

    The answer is generated by Gemini 2.5 Pro and grounded ONLY on the
    structured ingredient data from our database — the model cannot invent
    safety claims we haven't curated.

    Rate-limited to 10 req/min (LLM calls are expensive).
    """
    from app.llm import ask, build_ingredient_context, get_model_name, is_available

    # 1. Retrieve grounding context — use ingredient_names if provided,
    #    else fall back to all found_ingredients from the analysis context.
    found = payload.analysis_context.get("found_ingredients", [])
    if payload.ingredient_names:
        grounding = [
            f for f in found
            if f.get("matched_name", "").lower() in {n.lower() for n in payload.ingredient_names}
        ]
    else:
        grounding = found[:15]  # cap at 15 to stay well within context

    grounded_on = [f.get("matched_name", "") for f in grounding]

    if not grounding:
        return ChatOut(
            answer=(
                "I don't have ingredient data for this product yet. "
                "Please run an analysis first so I have structured data to ground my answer on."
            ),
            grounded_on=[],
            source="template",
        )

    # 2. Augment context with DB records (fresher than the analysis snapshot)
    enriched_grounding = []
    for item in grounding:
        name = item.get("matched_name", "")
        match = matcher.match_token(name)
        if match.status == "matched":
            ing = db.get(Ingredient, match.ingredient_id)
            if ing:
                enriched_grounding.append({
                    "matched_name": ing.inci_name,
                    "explanation": item.get("explanation"),
                    "ingredient": {
                        "function": ing.function,
                        "comedogenic": bool(ing.comedogenic),
                        "irritant": ing.irritant,
                    },
                })
                continue
        enriched_grounding.append(item)

    # 3. Build the grounding context block and ask Gemini
    context = build_ingredient_context(enriched_grounding)

    # Also include the product summary as context
    summary = payload.analysis_context.get("summary", "")
    if summary:
        context = f"Product summary: {summary}\n\n{context}"

    answer, source = ask(payload.question, context)

    return ChatOut(answer=answer, grounded_on=grounded_on, source=source)


# ── OCR endpoint ──────────────────────────────────────────────────────────────

@app.post("/extract-text")
@limiter.limit("10/minute")
async def extract_text(request: Request, file: UploadFile = File(...)):
    """Extract ingredient text from an uploaded label image.

    Rate-limited to 10 req/min — Tesseract is CPU-heavy.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Image too large ({len(contents) // 1024} KB). "
                f"Max is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
            ),
        )
    try:
        text = run_ocr(contents)
    except OCRUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}")
    return {"text": text}
