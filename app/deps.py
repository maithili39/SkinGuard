"""Shared FastAPI dependencies and app-level singletons.

Keeping these here (rather than in main.py) lets routers import them
without creating circular dependencies on the app object.
"""

import os
from pathlib import Path
from typing import Optional

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.matching import Matcher

# ── Version ───────────────────────────────────────────────────────────────────

VERSION = Path(__file__).parent.parent.joinpath("VERSION").read_text().strip()

# ── Environment ───────────────────────────────────────────────────────────────

ENV = os.environ.get("ENV", "development").lower()

# ── Matcher singletons (set by lifespan in main.py) ──────────────────────────

_matcher: Optional[Matcher] = None
_embedding_matcher = None  # EmbeddingMatcher | None

# Max upload size for label images (default 8 MB).
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 8 * 1024 * 1024))

# ── Rate limiting ─────────────────────────────────────────────────────────────

_RATELIMIT_DISABLED = os.environ.get("SKIP_RATELIMIT", "0") == "1"


def _limit(real: str) -> str:
    """Return the real limit, or an effectively-unlimited one in test mode."""
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


# ── Matcher dependency ────────────────────────────────────────────────────────

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
