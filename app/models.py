from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
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


class Alias(Base):
    """Alternate name for an ingredient (INCI synonym, common or trade name).

    Lets the matcher resolve 'Vitamin B3' or 'Aqua/Water' to the canonical row.
    """

    __tablename__ = "aliases"
    __table_args__ = (UniqueConstraint("name", name="uq_alias_name"),)

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, index=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False)

    ingredient = relationship("Ingredient", back_populates="aliases")


class User(Base):
    """A user identified by email, with a saved skin profile.

    NOTE: this is identity-by-email persistence, NOT authentication. There is no
    password/session here yet — anyone who knows an email can act as that user.
    Add real auth (password hash + JWT/session) before any public deployment.
    """

    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=_utcnow)

    # Real auth: bcrypt hash. Null = legacy email-only account (no password set yet).
    hashed_password = Column(String, nullable=True)

    # Saved skin profile (avoids re-toggling every visit).
    pregnant = Column(Boolean, default=False)
    sensitive_skin = Column(Boolean, default=False)
    acne_prone = Column(Boolean, default=False)
    fungal_acne = Column(Boolean, default=False)
    avoid_list = Column(JSON, default=list)

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
    safety_score = Column(Integer, nullable=False)
    coverage_percent = Column(Integer, nullable=False)
    summary = Column(String, nullable=True)
    result = Column(JSON, nullable=True)  # full analysis payload snapshot

    user = relationship("User", back_populates="scans")
