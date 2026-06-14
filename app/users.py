"""User + scan-history persistence helpers.

Two modes of operation:
  - Legacy (email-only): get_or_create_user — no password, no session token.
  - Real auth: register_user + authenticate_user — bcrypt password + JWT.

Existing email-only accounts have hashed_password=None and must register a
password before they can use the JWT login flow.
"""

import re

from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password
from app.models import User, Scan


def get_or_create_user(db: Session, email: str) -> User:
    """Legacy: create or fetch a user by email with no password (backward compat)."""
    email = email.strip().lower()
    user = db.query(User).filter_by(email=email).first()
    if user is None:
        user = User(email=email, avoid_list=[])
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def validate_password_complexity(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if not any(c.isupper() for c in password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not any(c.islower() for c in password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one digit.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise ValueError("Password must contain at least one special character.")

def register_user(db: Session, email: str, password: str, full_name: str | None = None) -> User:
    """Create a new user with a bcrypt-hashed password.

    Raises ValueError if the email is already registered.
    """
    email = email.strip().lower()
    validate_password_complexity(password)
    if db.query(User).filter_by(email=email).first():
        raise ValueError("Email already registered.")
    user = User(
        email=email,
        full_name=full_name.strip() if full_name else None,
        avoid_list=[],
        hashed_password=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Verify email + password. Returns the User or None on failure.

    Returns None (not an exception) so callers can decide on the HTTP response.
    """
    user = db.query(User).filter_by(email=email.strip().lower()).first()
    if not user or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def update_profile(db: Session, user: User, profile: dict) -> User:
    user.pregnant = profile.get("pregnant", user.pregnant)
    user.sensitive_skin = profile.get("sensitive_skin", user.sensitive_skin)
    user.acne_prone = profile.get("acne_prone", user.acne_prone)
    user.fungal_acne = profile.get("fungal_acne", user.fungal_acne)
    user.rosacea = profile.get("rosacea", user.rosacea)
    user.dry_skin = profile.get("dry_skin", user.dry_skin)
    user.oily_skin = profile.get("oily_skin", user.oily_skin)
    user.combination_skin = profile.get("combination_skin", user.combination_skin)
    user.normal_skin = profile.get("normal_skin", user.normal_skin)
    user.avoid_list = profile.get("avoid_list", user.avoid_list)
    db.commit()
    db.refresh(user)
    return user


def save_scan(db: Session, user: User, text: str, result: dict) -> Scan:
    scan = Scan(
        user_id=user.id,
        input_text=text,
        safety_score=result["safety_score"],
        coverage_percent=result["coverage_percent"],
        summary=result.get("summary"),
        result=result,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def profile_dict(user: User) -> dict:
    return {
        "pregnant": user.pregnant,
        "sensitive_skin": user.sensitive_skin,
        "acne_prone": user.acne_prone,
        "fungal_acne": user.fungal_acne,
        "rosacea": getattr(user, "rosacea", False),
        "dry_skin": getattr(user, "dry_skin", False),
        "oily_skin": getattr(user, "oily_skin", False),
        "combination_skin": getattr(user, "combination_skin", False),
        "normal_skin": getattr(user, "normal_skin", False),
        "avoid_list": user.avoid_list or [],
    }

