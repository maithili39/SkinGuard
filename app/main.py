import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

import app.deps as deps
from app.database import SessionLocal
from app.deps import ENV, VERSION, get_matcher, limiter  # get_matcher re-exported for test imports
from app.routers import auth, users, analyze, misc

# ── Logging ───────────────────────────────────────────────────────────────────

if ENV == "production":
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

# ── Sentry ────────────────────────────────────────────────────────────────────

_SENTRY_DSN = os.environ.get("SENTRY_DSN")
if _SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=_SENTRY_DSN, traces_sample_rate=0.1)
        logger.info("Sentry SDK initialized successfully.")
    except ImportError:
        logger.warning("Sentry DSN set but sentry-sdk package is not installed.")
    except Exception as exc:
        logger.error("Failed to initialize Sentry SDK: %s", exc)


# ── Lifespan (build matcher index) ───────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("SKIP_LIFESPAN") != "1":
        from app.explain import is_available as llm_ok
        if not llm_ok():
            logger.warning(
                "GEMINI_API_KEY is not set or invalid. "
                "LLM-powered features will be unavailable, falling back to template-based replies."
            )
        logger.info("Building matcher index from DB aliases…")

        db = SessionLocal()
        try:
            from app.matching import Matcher
            deps._matcher = Matcher(db)
            logger.info(
                "Matcher ready: %d aliases, %d ingredients indexed.",
                len(deps._matcher._choices),
                len(deps._matcher._id_to_inci),
            )
            try:
                from app.embedding_matcher import EmbeddingMatcher
                logger.info("Building sentence-embedding index (first run is slow)…")
                deps._embedding_matcher = EmbeddingMatcher.build(db, deps._matcher)
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

    deps._matcher = None
    deps._embedding_matcher = None
    logger.info("Matcher index cleared.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SkinGuard API",
    description=(
        "AI-powered skincare ingredient analyzer. "
        "Educational use only — not medical advice."
    ),
    version=VERSION,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_origins = os.environ.get(
    "SKINGUARD_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
_origin_list = [o.strip() for o in _origins.split(",") if o.strip()]

if ENV == "production" and any("localhost" in o or "127.0.0.1" in o for o in _origin_list):
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

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(analyze.router)
app.include_router(misc.router)
