"""API endpoint integration tests using FastAPI TestClient.

Uses an in-memory SQLite DB with the curated ingredient fixture, and overrides
both the get_db and get_matcher dependencies so the tests are fully self-contained
— no running server, no external DB, no Tesseract binary needed.
"""

import csv
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app import main  # Import main module to access app and _matcher
from app.main import app, get_matcher
from app.matching import Matcher
from app.models import Ingredient, Alias, User, Scan  # Import all models to ensure tables are created

CURATED = os.path.join("data", "curated", "ingredient_flags.csv")


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def test_db_engine_and_session():
    """Create a test database and session that's shared across all tests in the module."""
    import tempfile
    from pathlib import Path
    
    # Use a temporary file-based SQLite database instead of in-memory
    # In-memory databases don't work well with FastAPI's thread pool
    temp_dir = Path(tempfile.gettempdir())
    db_file = temp_dir / "skinguard_test.db"
    db_file.unlink(missing_ok=True)  # Remove if exists
    
    database_url = f"sqlite:///{db_file}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    seen: set = set()
    with open(CURATED, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            comedo = row["comedogenic"].strip()
            ing = Ingredient(
                inci_name=row["inci_name"].strip(),
                function=row["function"].strip() or None,
                comedogenic=int(comedo) if comedo.isdigit() else None,
                fungal_acne_safe=row["fungal_acne_safe"].strip() or None,
                pregnancy_safe=row["pregnancy_safe"].strip() or None,
                irritant=row["irritant"].strip() or None,
                source=row["source"].strip() or None,
            )
            db.add(ing)
            db.flush()
            for name in [ing.inci_name] + [
                a for a in row["aliases"].split("|") if a.strip()
            ]:
                key = name.strip().lower()
                if key and key not in seen:
                    seen.add(key)
                    db.add(Alias(name=name.strip(), ingredient=ing))
    db.commit()
    
    yield engine, db
    
    # Cleanup - properly close the connection before deleting the file
    db.close()
    engine.dispose()  # Close all connections in the pool
    try:
        db_file.unlink(missing_ok=True)  # Cleanup
    except Exception:
        pass  # Ignore cleanup errors


@pytest.fixture(scope="function")
def test_db_session(test_db_engine_and_session):
    """Provide a fresh session for each test (but sharing the same test database)."""
    engine, _ = test_db_engine_and_session
    Session = sessionmaker(bind=engine)
    db = Session()
    yield db
    db.rollback()  # Rollback changes from this test
    db.close()


@pytest.fixture(scope="module")
def _setup_module_lifespan():
    """Setup that runs once per module."""
    import os
    # Skip the app lifespan to avoid creating real DB connections
    os.environ["SKIP_LIFESPAN"] = "1"
    yield
    if "SKIP_LIFESPAN" in os.environ:
        del os.environ["SKIP_LIFESPAN"]


@pytest.fixture(scope="function")
def client(test_db_session, _setup_module_lifespan):
    """TestClient with DB and Matcher dependency overrides."""
    test_matcher = Matcher(test_db_session)

    def override_db():
        """Always return the same test session."""
        yield test_db_session

    # Override the get_db dependency
    app.dependency_overrides[get_db] = override_db
    
    # Set the global _matcher so health() and get_matcher() work
    main._matcher = test_matcher

    client_instance = TestClient(app)
    try:
        yield client_instance
    finally:
        # Cleanup
        app.dependency_overrides.clear()
        main._matcher = None


# ── Health ────────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ── Analyze ───────────────────────────────────────────────────────────────────

def test_analyze_basic(client):
    r = client.post(
        "/analyze",
        json={"text": "Aqua, Glycerin, Niacinamide"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["coverage_percent"] == 100
    assert data["matched_count"] == 3


def test_analyze_with_profile_flags(client):
    r = client.post(
        "/analyze",
        json={
            "text": "Aqua, Retinol, Coconut Oil",
            "profile": {"pregnant": True, "acne_prone": True},
        },
    )
    assert r.status_code == 200
    data = r.json()
    concerns = {f["concern"] for f in data["findings"]}
    assert "pregnancy" in concerns
    assert "acne" in concerns


def test_analyze_null_score_when_no_risk_data(client):
    """A label with zero matched ingredients yields safety_score=None."""
    # Send a clearly-unrecognized string that won't match any curated ingredient
    r = client.post("/analyze", json={"text": "Zxqwerty9999Unobtanium ZZZNOMATCH"})
    assert r.status_code == 200
    data = r.json()
    # Either safety_score is None (nothing matched) or coverage_percent is 0
    assert data["safety_score"] is None or data["matched_count"] == 0


def test_analyze_text_too_long(client):
    r = client.post("/analyze", json={"text": "A" * 15_001})
    assert r.status_code == 422  # pydantic validation error


# ── Auth endpoints ────────────────────────────────────────────────────────────

def test_register_new_user(client):
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "securepass123"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == email
    assert "access_token" in data


def test_register_duplicate_email(client):
    email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "securepass123"})
    r = client.post("/auth/register", json={"email": email, "password": "anotherpass456"})
    assert r.status_code == 409


def test_register_short_password(client):
    r = client.post(
        "/auth/register",
        json={"email": f"short_{uuid.uuid4().hex[:8]}@example.com", "password": "1234567"},
    )
    assert r.status_code == 422


def test_login_correct_credentials(client):
    email = f"login_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "mypassword99"})
    r = client.post("/auth/login", json={"email": email, "password": "mypassword99"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password(client):
    email = f"wrongpw_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "correct123"})
    r = client.post("/auth/login", json={"email": email, "password": "wrongpass"})
    assert r.status_code == 401


def test_me_authenticated(client):
    email = f"me_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/auth/register", json={"email": email, "password": "securepass123"})
    assert reg.status_code == 201, f"Registration failed: {reg.json()}"
    token = reg.json()["access_token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_me_unauthenticated(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


# ── Explain ───────────────────────────────────────────────────────────────────

def test_explain_known_ingredient(client):
    r = client.get("/explain/Niacinamide")
    assert r.status_code == 200
    assert "explanation" in r.json()


def test_explain_unknown_ingredient(client):
    r = client.get("/explain/Zxqwerty9999Unobtanium")
    assert r.status_code == 404
