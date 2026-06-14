from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Ingredient(Base):
    """One canonical ingredient.

    Identity fields (inci_name, function, cas, regulatory_status) come from the
    authoritative EU CosIng dataset. The skincare-advice flags (comedogenic,
    fungal_acne_safe, pregnancy_safe, irritant) come from the curated CSV and
    each carry a `source` so the UI can show WHERE a warning came from.
    """

    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True)
    inci_name = Column(String, unique=True, nullable=False, index=True)
    function = Column(String, nullable=True)

    # Authoritative EU data
    cas = Column(String, nullable=True)
    regulatory_status = Column(String, default="allowed")  # allowed/restricted/banned

    # Curated skincare-advice flags (opinion/guidance, not EU law)
    comedogenic = Column(Integer, nullable=True)  # 0-5, null = unknown
    fungal_acne_safe = Column(String, nullable=True)  # yes/no/null
    pregnancy_safe = Column(String, nullable=True)  # yes/no/caution/null
    irritant = Column(String, nullable=True)  # yes/no/null

    notes = Column(String, nullable=True)
    source = Column(String, nullable=True)

    aliases = relationship(
        "Alias", back_populates="ingredient", cascade="all, delete-orphan"
    )


from app.config import settings
if settings.database_url.startswith("postgresql"):
    try:
        from pgvector.sqlalchemy import Vector
        EmbeddingType = Vector(384)
    except ImportError:
        from sqlalchemy import LargeBinary
        EmbeddingType = LargeBinary
else:
    from sqlalchemy import LargeBinary
    EmbeddingType = LargeBinary


class Alias(Base):
    """Alternate name for an ingredient (INCI synonym, common or trade name).

    Lets the matcher resolve 'Vitamin B3' or 'Aqua/Water' to the canonical row.
    """

    __tablename__ = "aliases"
    __table_args__ = (UniqueConstraint("name", name="uq_alias_name"),)

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, index=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False)
    embedding = Column(EmbeddingType, nullable=True)

    ingredient = relationship("Ingredient", back_populates="aliases")


class User(Base):
    """A user identified by email with a hashed password and saved skin profile.

    Authentication uses bcrypt (passlib) for password hashing and HS256 JWTs
    for stateless sessions (set as HttpOnly cookies).  Legacy email-only accounts
    have hashed_password=None and must set a password before using the login flow.
    """

    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=_utcnow)
    full_name = Column(String, nullable=True)

    # Real auth: bcrypt hash. Null = legacy email-only account (no password set yet).
    hashed_password = Column(String, nullable=True)

    # Fix #4: one-time-use password reset token guard (OWASP A04 replay prevention).
    # Stores a SHA-256 hash of the most recently issued reset token.
    # Set when a reset is requested; cleared (set to None) immediately after use.
    # A replayed token fails because the DB column is NULL after first use.
    password_reset_token_hash = Column(String, nullable=True)

    # Saved skin profile (avoids re-toggling every visit).
    pregnant = Column(Boolean, default=False)
    sensitive_skin = Column(Boolean, default=False)
    acne_prone = Column(Boolean, default=False)
    fungal_acne = Column(Boolean, default=False)
    rosacea = Column(Boolean, default=False)
    dry_skin = Column(Boolean, default=False)
    oily_skin = Column(Boolean, default=False)
    combination_skin = Column(Boolean, default=False)
    normal_skin = Column(Boolean, default=False)
    avoid_list = Column(JSON, default=list)

    # T3-1: Soft delete support.
    # NULL = active account. Non-null = account deleted (GDPR erasure requested).
    # Hard-delete is deferred so analytics/audit trails can be anonymised first.
    deleted_at = Column(DateTime, nullable=True, default=None)

    # T3-1: GDPR audit trail stored as a JSON list of event dicts.
    # Each entry: {"ts": ISO-8601, "action": str, "meta": dict}.
    # Written by audit_log() helper; never overwritten — only appended.
    gdpr_audit = Column(JSON, nullable=False, default=list)

    scans = relationship(
        "Scan", back_populates="user", cascade="all, delete-orphan",
        order_by="Scan.created_at.desc()",
    )


class Scan(Base):
    """A saved analysis result so users can review history."""

    __tablename__ = "scans"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=_utcnow)

    input_text = Column(String, nullable=False)
    safety_score = Column(Integer, nullable=True)
    coverage_percent = Column(Integer, nullable=False)
    summary = Column(String, nullable=True)
    result = Column(JSON, nullable=True)  # full analysis payload snapshot

    # T3-1: Soft delete — set when user requests scan deletion.
    deleted_at = Column(DateTime, nullable=True, default=None)

    user = relationship("User", back_populates="scans")


# T3-1: Dedicated GDPR audit log table.
# Stores an immutable, append-only record of every privacy-relevant action
# (account creation, password reset, data export, deletion request, etc.).
# Kept separate from gdpr_audit JSON column for queryability.
class AuditLog(Base):
    """Immutable GDPR / security audit log.

    One row per privacy-relevant event. Never updated or deleted — only inserted.
    Rows are retained for the legally required period (typically 6-12 months)
    and can be hard-deleted by a scheduled job after that window.
    """

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    # user_id may be NULL for anonymous events (e.g. failed login attempts).
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    occurred_at = Column(DateTime, default=_utcnow, nullable=False, index=True)
    # Action slug, e.g. "account.created", "password.reset", "account.deleted",
    # "profile.updated", "scan.deleted", "data.export"
    action = Column(String, nullable=False, index=True)
    # Arbitrary metadata — keep PII-free (store email hash, not plain email).
    meta = Column(JSON, nullable=True)


# T3-5: Anonymous scan analytics.
# Logged for every /analyze call that is NOT tied to a registered user.
# Captures aggregate metrics — no PII, no ingredient text, no IP address.
class AnonScanEvent(Base):
    """Anonymous scan event for product analytics (T3-5).

    Written for every un-authenticated /analyze request.
    Never contains PII — just aggregate metrics that help us understand
    how the product is being used (score distribution, coverage, flag rates).
    """

    __tablename__ = "anon_scan_events"

    id = Column(Integer, primary_key=True)
    occurred_at = Column(DateTime, default=_utcnow, nullable=False, index=True)
    # Score bin (None, 0-49, 50-79, 80-100) — not the exact score.
    score_band = Column(String, nullable=True)   # "none" | "low" | "mid" | "high"
    matched_count = Column(Integer, nullable=True)
    coverage_percent = Column(Integer, nullable=True)
    has_danger = Column(Boolean, nullable=False, default=False)
    has_warning = Column(Boolean, nullable=False, default=False)
    # How the input arrived: "paste" | "ocr" | "barcode"
    input_mode = Column(String, nullable=True)

