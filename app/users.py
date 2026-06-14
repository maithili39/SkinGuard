"""User + scan-history persistence helpers.

Two modes of operation:
  - Legacy (email-only): get_or_create_user — no password, no session token.
  - Real auth: register_user + authenticate_user — bcrypt password + JWT.

Existing email-only accounts have hashed_password=None and must register a
password before they can use the JWT login flow.
"""

import hashlib
import logging
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password
from app.models import AuditLog, User, Scan

logger = logging.getLogger("skinguard.users")


# ── GDPR audit helpers ────────────────────────────────────────────────────────

def _email_hash(email: str) -> str:
    """One-way SHA-256 hash of an email for PII-safe audit metadata."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:16]


def record_audit(db: Session, user: User, action: str, meta: dict | None = None) -> None:
    """Append an immutable audit event to both the AuditLog table and the
    user.gdpr_audit JSON column.

    action should be a dot-namespaced slug like 'account.created',
    'password.reset', 'account.deleted', 'profile.updated', 'scan.deleted'.
    meta must be PII-free — use _email_hash() for any email reference.
    """
    ts = datetime.now(timezone.utc).isoformat()
    entry = {"ts": ts, "action": action, "meta": meta or {}}

    # Append to the in-row JSON column (fast, denormalised).
    audit_list = list(user.gdpr_audit or [])
    audit_list.append(entry)
    user.gdpr_audit = audit_list

    # Also insert into the dedicated audit table (queryable, filterable).
    db.add(AuditLog(user_id=user.id, action=action, meta=meta))


# ── HIBP password breach check (T3-4) ────────────────────────────────────────

def check_hibp(password: str) -> int:
    """Check password against HaveIBeenPwned Pwned Passwords API (k-anonymity model).

    Sends only the first 5 chars of the SHA-1 hash — the full password is
    NEVER sent to the API. Returns the breach count (0 = not breached).
    Degrades gracefully on network errors (returns 0 so registration is not blocked).

    See: https://haveibeenpwned.com/API/v3#PwnedPasswords
    """
    import httpx

    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        resp = httpx.get(
            f"https://api.pwnedpasswords.com/range/{prefix}",
            headers={"Add-Padding": "true"},
            timeout=3.0,
        )
        resp.raise_for_status()
        for line in resp.text.splitlines():
            hash_suffix, _, count_str = line.partition(":")
            if hash_suffix.strip() == suffix:
                return int(count_str.strip())
    except Exception as exc:
        logger.warning("HIBP check failed (non-blocking): %s", exc)
    return 0


# ── Core user operations ──────────────────────────────────────────────────────

def get_or_create_user(db: Session, email: str) -> User:
    """Legacy: create or fetch a user by email with no password (backward compat)."""
    email = email.strip().lower()
    user = db.query(User).filter_by(email=email).filter(User.deleted_at == None).first()
    if user is None:
        user = User(email=email, avoid_list=[], gdpr_audit=[])
        db.add(user)
        db.flush()
        record_audit(db, user, "account.created", {"source": "legacy"})
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


def register_user(
    db: Session, email: str, password: str, full_name: str | None = None
) -> User:
    """Create a new user with a bcrypt-hashed password.

    T3-4: Checks password against HaveIBeenPwned Pwned Passwords — rejects
    passwords found in public breach databases (>= 1 occurrence).

    Raises ValueError if the email is already registered or password is breached.
    """
    email = email.strip().lower()
    validate_password_complexity(password)

    # T3-4: HIBP breach check (k-anonymity, non-blocking on network failure).
    breach_count = check_hibp(password)
    if breach_count > 0:
        raise ValueError(
            f"This password has appeared in {breach_count:,} known data breach(es). "
            "Please choose a different password that hasn't been publicly exposed."
        )

    if db.query(User).filter_by(email=email).first():
        raise ValueError("Email already registered.")

    user = User(
        email=email,
        full_name=full_name.strip() if full_name else None,
        avoid_list=[],
        gdpr_audit=[],
        hashed_password=hash_password(password),
    )
    db.add(user)
    db.flush()  # get user.id before audit log
    record_audit(db, user, "account.created", {"email_hash": _email_hash(email)})
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """Verify email + password. Returns the User or None on failure."""
    user = db.query(User).filter_by(email=email.strip().lower()).filter(User.deleted_at == None).first()
    if not user or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def soft_delete_user(db: Session, user: User) -> None:
    """T3-1: Soft-delete a user account (GDPR erasure request).

    Sets deleted_at, anonymises the email so the slot can be reused, and
    logs the deletion event. A background job can hard-delete rows older
    than the retention period.
    """
    record_audit(db, user, "account.deleted", {"email_hash": _email_hash(user.email)})
    user.deleted_at = datetime.now(timezone.utc)
    # Anonymise PII so the row is no longer personally identifiable.
    user.full_name = None
    user.avoid_list = []
    user.email = f"deleted_{user.id}@skinguard.invalid"
    # Soft-delete all scans too.
    for scan in user.scans:
        if scan.deleted_at is None:
            scan.deleted_at = datetime.now(timezone.utc)
    db.commit()
    logger.info("User %s soft-deleted (GDPR erasure).", user.id)


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
    record_audit(db, user, "profile.updated")
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
