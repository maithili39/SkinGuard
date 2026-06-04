import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Read version from the single-source VERSION file at the project root.
_VERSION = Path(__file__).parent.parent.joinpath("VERSION").read_text().strip()

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.analysis import analyze_text
from app.auth import create_token, get_current_user, require_user
from app.cache import cache_info, get_cached, hash_bytes, hash_text, make_key, set_cached
from app.database import SessionLocal, get_db
from app.explain import explain_ingredient, explain_ingredient_llm
from app.matching import Matcher
from app.models import Ingredient, Scan, User
from app.ocr import OCRUnavailable
from app.ocr import extract_text as run_ocr
from app.rules import Profile
from app.schemas import AnalyzeIn, AuthOut, ChatIn, ChatOut, LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserIn, RoutineAnalyzeIn
from app import users as users_svc

# ── Logging setup ─────────────────────────────────────────────────────────────
_ENV = os.environ.get("ENV", "development").lower()

if _ENV == "production":
    try:
        from pythonjsonlogger import jsonlogger
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(jsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level"},
        ))
        logging.root.handlers = [handler]
        logging.root.setLevel(logging.INFO)
    except ImportError:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
else:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

logger = logging.getLogger("skinguard")

# Max upload size for label images (default 8 MB) — protects OCR from huge files.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024))

# ── Rate limiter ──────────────────────────────────────────────────────────────
# SKIP_RATELIMIT=1 disables real limits in tests (same convention as SKIP_LIFESPAN).
_RATELIMIT_DISABLED = os.environ.get("SKIP_RATELIMIT", "0") == "1"

def _limit(real: str) -> str:
    """Return the real limit string, or an effectively-unlimited one in test mode."""
    return "10000/minute" if _RATELIMIT_DISABLED else real

limiter = Limiter(key_func=get_remote_address, default_limits=[])


def hybrid_rate_limit_key(request: Request) -> str:
    """Key rate limits by user email (from cookie) when logged in, else by IP."""
    token = request.cookies.get("access_token")
    if token:
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
        from app.llm import is_available as llm_ok
        if not llm_ok():
            logger.warning(
                "GEMINI_API_KEY is not set or invalid. "
                "LLM-powered features (like grounded explanations and chat Q&A) will be unavailable, "
                "falling back to template-based replies."
            )
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
    version="0.4.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_origins = os.environ.get(
    "SKINGUARD_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
_origin_list = [o.strip() for o in _origins.split(",") if o.strip()]

if _ENV == "production" and any("localhost" in o or "127.0.0.1" in o for o in _origin_list):
    logger.warning(
        "CORS origins contain localhost addresses in production mode. "
        "Set SKINGUARD_CORS_ORIGINS to your production domain(s)."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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
        "llm_available": llm_ok(),
        "cache": cache_info(),
        "version": _VERSION,
    }



# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=201)
@limiter.limit(_limit("5/minute"))
def register(request: Request, payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    """Register a new account. Sets an HttpOnly session cookie — JWT is NOT in the body."""
    try:
        user = users_svc.register_user(db, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    token = create_token(user.email)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=7 * 86400,
        expires=7 * 86400,
        samesite="lax",
        secure=(_ENV == "production"),
        path="/"
    )
    return AuthOut(email=user.email, profile=users_svc.profile_dict(user))


@app.post("/auth/login")
@limiter.limit(_limit("10/minute"))
def login(request: Request, payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    """Authenticate with email + password. Sets an HttpOnly session cookie — JWT is NOT in the body."""
    user = users_svc.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_token(user.email)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=7 * 86400,
        expires=7 * 86400,
        samesite="lax",
        secure=(_ENV == "production"),
        path="/"
    )
    return AuthOut(email=user.email, profile=users_svc.profile_dict(user))


@app.post("/auth/logout")
def logout(response: Response):
    """Clear session cookie to log out."""
    response.delete_cookie(
        key="access_token",
        path="/",
        samesite="lax",
    )
    return {"detail": "Successfully logged out."}


@app.get("/auth/me")
def me(user: User = Depends(require_user)):
    """Return the currently authenticated user's profile."""
    return {"email": user.email, "profile": users_svc.profile_dict(user)}


@app.get("/auth/scans")
def auth_scan_history(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Return currently authenticated user's scan history (paginated)."""
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == current_user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "email": current_user.email,
        "offset": offset,
        "limit": limit,
        "scans": [
            {
                "id": s.id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "safety_score": s.safety_score,
                "coverage_percent": s.coverage_percent,
                "summary": s.summary,
                "input_text": s.input_text,
            }
            for s in scans
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
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if current_user.email.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own scans.")
    user = db.query(User).filter_by(email=email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No such user.")
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "email": user.email,
        "offset": offset,
        "limit": limit,
        "scans": [
            {
                "id": s.id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "safety_score": s.safety_score,
                "coverage_percent": s.coverage_percent,
                "summary": s.summary,
                "input_text": s.input_text,
            }
            for s in scans
        ],
    }



# ── Ingredient info ───────────────────────────────────────────────────────────

@app.get("/ingredients/count")
def ingredient_count(db: Session = Depends(get_db)):
    return {"ingredients": db.query(Ingredient).count()}


# ── Core analysis endpoints ───────────────────────────────────────────────────

@app.post("/analyze")
@limiter.limit(_limit("30/minute"), key_func=hybrid_rate_limit_key)
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

    # ── Cache check (skip for authenticated users so scan history is always saved) ──
    _cache_key: str | None = None
    if current_user is None and not payload.user_email:
        profile_sig = hash_text(
            f"{payload.profile.pregnant}{payload.profile.sensitive_skin}"
            f"{payload.profile.acne_prone}{payload.profile.fungal_acne}"
            f"{payload.profile.rosacea}{''.join(sorted(payload.profile.avoid_list or []))}"
        )
        _cache_key = make_key("analyze", hash_text(payload.text), profile_sig)
        cached = get_cached(_cache_key)
        if cached is not None:
            logger.debug("Cache HIT for analyze key=%s", _cache_key)
            return cached

    result = analyze_text(db, payload.text, profile, matcher=matcher)

    save_user = current_user
    if save_user is None and payload.user_email:
        save_user = users_svc.get_or_create_user(db, payload.user_email)

    if save_user:
        users_svc.save_scan(db, save_user, payload.text, result)
        logger.info("Saved scan for %s (score=%s)", save_user.email, result["safety_score"])
    elif _cache_key:
        set_cached(_cache_key, result, ttl=300)  # 5-minute TTL for anonymous results
        logger.debug("Cache SET analyze key=%s", _cache_key)

    return result


@app.post("/analyze/routine")
@limiter.limit(_limit("10/minute"))
def analyze_routine(
    request: Request,
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
        "Vitamin C": {"ascorbic acid", "3-o-ethyl ascorbic acid", "ascorbyl glucoside", "tetrahexyldecyl ascorbate", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate", "ascorbyl palmitate"},
        # New categories
        "Niacinamide": {"niacinamide", "nicotinamide"},
        "Peptides": {
            "palmitoyl tripeptide-1", "palmitoyl tetrapeptide-7", "palmitoyl pentapeptide-4",
            "acetyl hexapeptide-3", "acetyl hexapeptide-8", "sh-oligopeptide-1",
            "copper tripeptide-1", "dipeptide diaminobutyroyl benzylamide diacetate",
            "tripeptide-1", "tetrapeptide-21",
        },
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

            # Helper to append a symmetric conflict without duplicating code
            def _add(a_name, b_name, a_cat, b_cat, ctype, severity, msg_fn):
                if a_cat in actives1 and b_cat in actives2:
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": actives1[a_cat], "ingredient_b": actives2[b_cat],
                        "conflict_type": ctype, "severity": severity,
                        "message": msg_fn(actives1[a_cat], actives2[b_cat]),
                    })
                if b_cat in actives1 and a_cat in actives2:
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": actives1[b_cat], "ingredient_b": actives2[a_cat],
                        "conflict_type": ctype, "severity": severity,
                        "message": msg_fn(actives2[a_cat], actives1[b_cat]),
                    })

            # 1. AHA + Retinol
            _add("AHA", "Retinol", "AHA", "Retinol", "AHA + Retinol", "danger",
                 lambda a, b: (
                     f"Alpha Hydroxy Acids (AHAs) like {a} and Retinoids like {b} both speed up "
                     f"skin cell turnover. Layering them can disrupt your skin barrier, causing redness, "
                     f"dryness, and severe irritation. Tip: Use AHA in the morning (with SPF) and Retinol at night."
                 ))

            # 2. BHA + Retinol
            _add("BHA", "Retinol", "BHA", "Retinol", "BHA + Retinol", "danger",
                 lambda a, b: (
                     f"Beta Hydroxy Acids (BHAs) like {a} exfoliate deep inside pores while Retinoids like {b} "
                     f"speed up cell turnover. Combining them can cause severe dryness and over-exfoliation. "
                     f"Tip: Use BHA in the morning or alternate nights with Retinol."
                 ))

            # 3. Benzoyl Peroxide + Retinol
            _add("Benzoyl Peroxide", "Retinol", "Benzoyl Peroxide", "Retinol", "Benzoyl Peroxide + Retinol", "danger",
                 lambda a, b: (
                     f"Benzoyl Peroxide oxidizes and deactivates Retinoids like {b} when applied together, "
                     f"making the Retinol ineffective and increasing irritation. "
                     f"Tip: Use Benzoyl Peroxide in the morning and Retinol at night."
                 ))

            # 4. Vitamin C + AHA/BHA
            for acid_cat in ("AHA", "BHA"):
                if "Vitamin C" in actives1 and acid_cat in actives2:
                    acid = actives2[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": actives1["Vitamin C"], "ingredient_b": acid,
                        "conflict_type": f"Vitamin C + {acid_cat}", "severity": "warning",
                        "message": (
                            f"Vitamin C like {actives1['Vitamin C']} is highly acidic. Combining it with "
                            f"{acid} can destabilize the Vitamin C and trigger redness. "
                            f"Tip: Use Vitamin C in the morning and exfoliating acids in the evening."
                        ),
                    })
                if acid_cat in actives1 and "Vitamin C" in actives2:
                    acid = actives1[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": acid, "ingredient_b": actives2["Vitamin C"],
                        "conflict_type": f"{acid_cat} + Vitamin C", "severity": "warning",
                        "message": (
                            f"Vitamin C like {actives2['Vitamin C']} is highly acidic. Combining it with "
                            f"{acid} can destabilize the Vitamin C and trigger redness. "
                            f"Tip: Use Vitamin C in the morning and exfoliating acids in the evening."
                        ),
                    })

            # 5. NEW: Niacinamide + Vitamin C (warning — reduces efficacy of Vit C)
            _add("Niacinamide", "Vitamin C", "Niacinamide", "Vitamin C", "Niacinamide + Vitamin C", "warning",
                 lambda a, b: (
                     f"Mixing {a} with {b} (Vitamin C) at high concentrations can form nicotinic acid, "
                     f"which may cause temporary flushing and reduce the brightening effect of Vitamin C. "
                     f"Tip: Use them in separate routines (Vitamin C AM, Niacinamide PM) or ensure "
                     f"the Vitamin C serum is fully absorbed before applying Niacinamide."
                 ))

            # 6. NEW: Retinol + Vitamin C (warning — pH incompatibility, irritation)
            _add("Retinol", "Vitamin C", "Retinol", "Vitamin C", "Retinol + Vitamin C", "warning",
                 lambda a, b: (
                     f"Retinoids like {a} work best at a neutral pH, while Vitamin C forms like {b} require "
                     f"a low acidic pH. Layering them can reduce the effectiveness of both and significantly "
                     f"increase irritation, especially on sensitive skin. "
                     f"Tip: Use Vitamin C in the morning and Retinol at night."
                 ))

            # 7. NEW: Peptides + AHA/BHA (warning — acids degrade peptide bonds)
            for acid_cat in ("AHA", "BHA"):
                if "Peptides" in actives1 and acid_cat in actives2:
                    acid = actives2[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": actives1["Peptides"], "ingredient_b": acid,
                        "conflict_type": f"Peptides + {acid_cat}", "severity": "warning",
                        "message": (
                            f"The low-pH environment created by {acid} can break down peptide bonds in "
                            f"{actives1['Peptides']}, significantly reducing its anti-ageing effectiveness. "
                            f"Tip: Apply peptides and acids in separate routines, or wait 30 min between applications."
                        ),
                    })
                if acid_cat in actives1 and "Peptides" in actives2:
                    acid = actives1[acid_cat]
                    conflicts.append({
                        "product_a": p1, "product_b": p2,
                        "ingredient_a": acid, "ingredient_b": actives2["Peptides"],
                        "conflict_type": f"{acid_cat} + Peptides", "severity": "warning",
                        "message": (
                            f"The low-pH environment created by {acid} can break down peptide bonds in "
                            f"{actives2['Peptides']}, significantly reducing its anti-ageing effectiveness. "
                            f"Tip: Apply peptides and acids in separate routines, or wait 30 min between applications."
                        ),
                    })

            # 8. NEW: AHA + Benzoyl Peroxide (danger — oxidation makes AHA less effective)
            _add("AHA", "Benzoyl Peroxide", "AHA", "Benzoyl Peroxide", "AHA + Benzoyl Peroxide", "danger",
                 lambda a, b: (
                     f"Benzoyl Peroxide is an oxidizing agent that can deactivate AHAs like {a} and vice-versa, "
                     f"making both less effective while dramatically increasing dryness and irritation risk. "
                     f"Tip: Use AHA at night and Benzoyl Peroxide in the morning, never together."
                 ))

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
@limiter.limit(_limit("20/minute"))
def barcode_lookup(code: str, request: Request):
    """Look up product details and ingredients by barcode using Open Beauty Facts.

    Results are cached in Redis for 24 hours — barcode data rarely changes.
    """
    from app.barcode import cached_lookup_barcode, ProductNotFound

    # Check Redis first (24 h TTL — product data is stable)
    _cache_key = make_key("barcode", code)
    cached = get_cached(_cache_key)
    if cached is not None:
        logger.debug("Cache HIT for barcode=%s", code)
        return cached

    try:
        result = cached_lookup_barcode(code)
    except ProductNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    set_cached(_cache_key, result, ttl=86400)  # 24 hours
    logger.debug("Cache SET barcode=%s", code)
    return result


# ── RAG Chat endpoint ─────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatOut)
@limiter.limit(_limit("10/minute"))
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

    # 4. Prompt-injection guard — block known jailbreak patterns before
    #    forwarding the question to the model. The question has already been
    #    length-capped by Pydantic (max_length=500), so we only need to strip
    #    instruction-override attempts.
    _INJECTION_PATTERNS = [
        "ignore previous", "ignore all previous", "ignore above",
        "disregard previous", "forget previous", "new instruction",
        "act as", "you are now", "pretend you are", "pretend to be",
        "your new role", "system prompt", "jailbreak",
        "do anything now", "dan mode", "developer mode",
    ]
    question_lower = payload.question.lower()
    for pattern in _INJECTION_PATTERNS:
        if pattern in question_lower:
            return ChatOut(
                answer=(
                    "I can only answer questions about skincare ingredients "
                    "from the analysed product. Please ask a specific ingredient question."
                ),
                grounded_on=grounded_on,
                source="guard",
            )

    answer, source = ask(payload.question, context)

    return ChatOut(answer=answer, grounded_on=grounded_on, source=source)


# ── OCR endpoint ──────────────────────────────────────────────────────────────

@app.post("/extract-text")
@limiter.limit(_limit("10/minute"))
async def extract_text(request: Request, file: UploadFile = File(...)):
    """Extract ingredient text from an uploaded label image.

    Rate-limited to 10 req/min — OCR is CPU-heavy. Identical image bytes
    are served from the Redis cache for 1 hour.
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

    # Check cache first — OCR on the same image bytes always gives the same result.
    _cache_key = make_key("ocr", hash_bytes(contents))
    cached = get_cached(_cache_key)
    if cached is not None:
        logger.debug("Cache HIT for OCR hash=%s", _cache_key)
        return cached

    try:
        text = run_ocr(contents)
    except OCRUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {exc}")

    result = {"text": text}
    set_cached(_cache_key, result, ttl=3600)  # 1 hour
    return result
