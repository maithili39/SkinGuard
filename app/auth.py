"""JWT authentication + password hashing for SkinGuard.

Design decisions:
- passlib/bcrypt for password hashing (battle-tested, slow enough to resist brute-force).
- python-jose for JWT (compact, stateless sessions — no server-side session store needed).
- SECRET_KEY from environment — must be changed in production.
- 7-day token expiry — long enough for comfort, short enough to limit exposure.
- `get_current_user` is OPTIONAL (returns None, not 401) so public endpoints can also
  accept an optional user context without forcing login.
- `require_user` is the strict version that raises 401.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

logger = logging.getLogger("skinguard.auth")

# ── Config ────────────────────────────────────────────────────────────────────

SECRET_KEY: str = os.environ.get("SECRET_KEY", "dev-secret-CHANGE-IN-PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

if SECRET_KEY == "dev-secret-CHANGE-IN-PRODUCTION":
    logger.warning(
        "SECRET_KEY is using the insecure default. "
        "Set SECRET_KEY in your .env before deploying."
    )

# ── Password hashing ──────────────────────────────────────────────────────────

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(email: str) -> str:
    """Create a signed JWT that expires in ACCESS_TOKEN_EXPIRE_DAYS days."""
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    """Return the email (subject) from a valid JWT, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── FastAPI dependencies ──────────────────────────────────────────────────────

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Optional auth — returns the User if a valid Bearer token is provided, else None.

    Use this for endpoints that work for both authenticated and anonymous users
    (e.g. /analyze can save history when logged in, or just return results when not).
    """
    if not credentials:
        return None
    email = decode_token(credentials.credentials)
    if not email:
        return None
    return db.query(User).filter_by(email=email.strip().lower()).first()


def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    """Strict auth — raises HTTP 401 if no valid token is provided."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
