"""API endpoint integration tests using FastAPI TestClient.

Uses an in-memory SQLite DB with the curated ingredient fixture, and overrides
both the get_db and get_matcher dependencies so the tests are fully self-contained
— no running server, no external DB, no Tesseract binary needed.
"""

import csv
import os
import uuid

# pyrefly: ignore [missing-import]
import pytest
# pyrefly: ignore [missing-import]
from fastapi.testclient import TestClient
# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app, get_matcher
from app.matching import Matcher
from app.models import Ingredient, Alias, User, Scan

CURATED = os.path.join("data", "curated", "ingredient_flags.csv")


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def test_db_session():
    """In-memory SQLite seeded with curated ingredients for all module tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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
    yield db
    db.close()


@pytest.fixture(scope="module")
def client(test_db_session):
    """TestClient with DB and Matcher dependency overrides."""
    test_matcher = Matcher(test_db_session)

    def override_db():
        yield test_db_session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_matcher] = lambda: test_matcher

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


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


# ── New Group 1 & Group 3 & Group 6 tests ─────────────────────────────────────

def test_legacy_users_returns_410(client):
    r = client.post("/users", json={"email": "legacy@example.com"})
    assert r.status_code == 410
    assert "legacy endpoint is gone" in r.json()["detail"].lower()


def test_scan_history_requires_auth(client):
    r = client.get("/users/somebody@example.com/scans")
    assert r.status_code == 401
    
    r = client.get("/auth/scans")
    assert r.status_code == 401


def test_profile_update_requires_auth(client):
    r = client.put("/users/somebody@example.com/profile", json={"pregnant": True})
    assert r.status_code == 401


def test_scan_history_and_profile_jwt_authorized(client):
    email = f"jwt_{uuid.uuid4().hex[:8]}@example.com"
    # Register
    reg = client.post("/auth/register", json={"email": email, "password": "securepass123"})
    assert reg.status_code == 201
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Access own scans
    r = client.get(f"/users/{email}/scans", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == email

    # Try accessing someone else's scans -> 403 Forbidden
    r = client.get("/users/other@example.com/scans", headers=headers)
    assert r.status_code == 403

    # Try updating own profile
    r = client.put(f"/users/{email}/profile", json={"sensitive_skin": True}, headers=headers)
    assert r.status_code == 200
    assert r.json()["profile"]["sensitive_skin"] is True

    # Try updating someone else's profile -> 403 Forbidden
    r = client.put("/users/other@example.com/profile", json={"sensitive_skin": True}, headers=headers)
    assert r.status_code == 403

    # Test /auth/scans JWT endpoint
    r = client.get("/auth/scans", headers=headers)
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_barcode_returns_graceful_404(client, monkeypatch):
    from app import barcode
    
    def mock_lookup(barcode_str):
        raise barcode.ProductNotFound("Product not found in Open Beauty Facts database.")
    
    monkeypatch.setattr(barcode, "lookup_barcode", mock_lookup)
    barcode.cached_lookup_barcode.cache_clear()

    r = client.get("/barcode/1234567890123")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


def test_alternatives_in_findings(client):
    r = client.post(
        "/analyze",
        json={
            "text": "Coconut Oil",
            "profile": {"acne_prone": True},
        },
    )
    assert r.status_code == 200
    data = r.json()
    findings = data["findings"]
    assert len(findings) > 0
    coconut_finding = next((f for f in findings if "coconut" in f["message"].lower()), None)
    assert coconut_finding is not None
    assert "alternatives" in coconut_finding
    assert coconut_finding["alternatives"] == ["Squalane", "Argan Oil", "Jojoba Oil"]


def test_analyze_routine_compatible(client):
    r = client.post(
        "/analyze/routine",
        json={
            "products": [
                {"name": "Hydrating Cleanser", "text": "Water, Glycerin"},
                {"name": "Barrier Serum", "text": "Niacinamide, Ceramide NP"}
            ]
        }
    )
    assert r.status_code == 200
    data = r.json()
    assert data["compatible"] is True
    assert "no active ingredient conflicts" in data["summary"].lower()
    assert len(data["conflicts"]) == 0
    assert "Hydrating Cleanser" in data["product_actives"]


def test_analyze_routine_incompatible(client):
    r = client.post(
        "/analyze/routine",
        json={
            "products": [
                {"name": "Retinol Serum", "text": "Retinol, Glycerin"},
                {"name": "Exfoliating Toner", "text": "Glycolic Acid, Water"}
            ]
        }
    )
    assert r.status_code == 200
    data = r.json()
    assert data["compatible"] is False
    assert "layering conflicts" in data["summary"].lower()
    assert len(data["conflicts"]) == 1
    conflict = data["conflicts"][0]
    assert conflict["conflict_type"] == "AHA + Retinol"
    assert conflict["severity"] == "danger"
    assert "Retinol Serum" in [conflict["product_a"], conflict["product_b"]]
    assert "Exfoliating Toner" in [conflict["product_a"], conflict["product_b"]]


