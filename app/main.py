import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.analysis import analyze_text
from app.auth import create_token, get_current_user, require_user
from app.database import SessionLocal, get_db
from app.explain import explain_ingredient
from app.matching import Matcher
from app.models import Ingredient, User
from app.ocr import OCRUnavailable
from app.ocr import extract_text as run_ocr
from app.rules import Profile
from app.schemas import AnalyzeIn, LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserIn
from app import users as users_svc

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("skinguard")

# Max upload size for label images (default 8 MB) — protects OCR from huge files.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024))

# ── Rate limiter ──────────────────────────────────────────────────────────────
# Keyed by client IP. Limits protect the OCR (CPU-heavy) and analyze (24k fuzzy
# matches) endpoints from accidental or malicious flooding.
limiter = Limiter(key_func=get_remote_address, default_limits=[])

# ── Matcher singleton ─────────────────────────────────────────────────────────
# Built ONCE at startup from the DB. After init it holds no live DB connection
# so it can be safely shared across concurrent requests.
_matcher: Optional[Matcher] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the Matcher index once at startup; tear down cleanly on shutdown."""
    global _matcher
    logger.info("Building matcher index from DB aliases...")
    db = SessionLocal()
    try:
        _matcher = Matcher(db)
        logger.info(
            "Matcher ready: %d aliases, %d ingredients indexed.",
            len(_matcher._choices),
            len(_matcher._id_to_inci),
        )
    finally:
        db.close()
    yield
    _matcher = None
    logger.info("Matcher index cleared.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SkinGuard API",
    description=(
        "AI-powered skincare ingredient analyzer. "
        "Educational use only — not medical advice."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: configure SKINGUARD_CORS_ORIGINS as comma-separated list in production.
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


# ── Dependency: get the singleton Matcher ────────────────────────────────────

def get_matcher() -> Matcher:
    """FastAPI dependency that returns the startup-built Matcher singleton."""
    if _matcher is None:
        # Fallback for tests that override this dependency directly.
        raise RuntimeError(
            "Matcher not initialised. "
            "Start the app via uvicorn (lifespan) or override get_matcher in tests."
        )
    return _matcher


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "matcher_aliases": len(_matcher._choices) if _matcher else 0,
    }


# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    """Register a new account with email + password (min 8 chars).

    Returns a JWT token so the client is immediately logged in.
    """
    try:
        user = users_svc.register_user(db, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    token = create_token(user.email)
    return TokenOut(
        access_token=token,
        email=user.email,
        profile=users_svc.profile_dict(user),
    )


@app.post("/auth/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    """Authenticate with email + password. Returns a JWT Bearer token."""
    user = users_svc.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )
    token = create_token(user.email)
    return TokenOut(
        access_token=token,
        email=user.email,
        profile=users_svc.profile_dict(user),
    )


@app.get("/auth/me")
def me(user: User = Depends(require_user)):
    """Return the currently authenticated user's profile."""
    return {"email": user.email, "profile": users_svc.profile_dict(user)}


# ── User / profile endpoints ──────────────────────────────────────────────────

@app.post("/users")
def create_or_get_user(payload: UserIn, db: Session = Depends(get_db)):
    """Legacy endpoint: register/fetch a user by email only (no password).

    Kept for backward compatibility. New clients should use POST /auth/register.
    """
    user = users_svc.get_or_create_user(db, payload.email)
    return {"id": user.id, "email": user.email, "profile": users_svc.profile_dict(user)}


@app.put("/users/{email}/profile")
def save_profile(
    email: str,
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Save a user's skin profile. Accepts both authenticated and legacy requests."""
    user = users_svc.get_or_create_user(db, email)
    user = users_svc.update_profile(db, user, payload.model_dump())
    return {"email": user.email, "profile": users_svc.profile_dict(user)}


@app.get("/users/{email}/scans")
def scan_history(
    email: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
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
@limiter.limit("30/minute")
def analyze(
    request: Request,
    payload: AnalyzeIn,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Analyze a (possibly OCR-extracted, user-edited) ingredient list.

    Rate-limited to 30 requests/min per IP.
    If a valid Bearer token is provided, the result is saved to scan history.
    Falls back to `user_email` in the payload for legacy clients.
    """
    profile = Profile(
        pregnant=payload.profile.pregnant,
        sensitive_skin=payload.profile.sensitive_skin,
        acne_prone=payload.profile.acne_prone,
        fungal_acne=payload.profile.fungal_acne,
        avoid_list=payload.profile.avoid_list,
    )
    result = analyze_text(db, payload.text, profile, matcher=matcher)

    # Prefer JWT-identified user; fall back to email in payload (legacy).
    save_user = current_user
    if save_user is None and payload.user_email:
        save_user = users_svc.get_or_create_user(db, payload.user_email)

    if save_user:
        users_svc.save_scan(db, save_user, payload.text, result)
        logger.info(
            "Saved scan for %s (score=%s)", save_user.email, result["safety_score"]
        )

    return result


@app.get("/explain/{name}")
def explain(
    name: str,
    db: Session = Depends(get_db),
    matcher: Matcher = Depends(get_matcher),
):
    """Plain-language explanation for a single ingredient (fuzzy-matched)."""
    match = matcher.match_token(name)
    if match.status != "matched":
        raise HTTPException(
            status_code=404, detail=f"No ingredient found for '{name}'."
        )
    ing = db.get(Ingredient, match.ingredient_id)
    return {
        "ingredient": ing.inci_name,
        "confidence": match.confidence,
        "explanation": explain_ingredient(ing),
    }


@app.post("/extract-text")
@limiter.limit("10/minute")
async def extract_text(request: Request, file: UploadFile = File(...)):
    """Extract ingredient text from an uploaded label image (with preprocessing).

    Rate-limited to 10 requests/min per IP — Tesseract is CPU-heavy.
    Returns text that the user is expected to review/edit before calling /analyze.
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
