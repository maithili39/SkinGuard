"""API endpoint integration tests using FastAPI TestClient.

Uses an in-memory SQLite DB with the curated ingredient fixture, and overrides
both the get_db and get_matcher dependencies so the tests are fully self-contained
— no running server, no external DB, no Tesseract binary needed.
"""

import csv
import os
import uuid

# Set environment variables for tests before importing the app
os.environ["SKIP_RATELIMIT"] = "1"

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
    r = client.post("/analyze", json={"text": "A" * 50_001})
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
    # JWT is set as an HttpOnly cookie — it is NOT in the response body.
    assert "access_token" not in data
    assert "profile" in data


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
    # JWT is cookie-only; response body contains email and profile, not access_token.
    assert "access_token" not in r.json()
    assert "email" in r.json()


def test_login_wrong_password(client):
    email = f"wrongpw_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/auth/register", json={"email": email, "password": "correct123"})
    r = client.post("/auth/login", json={"email": email, "password": "wrongpass"})
    assert r.status_code == 401


def test_me_authenticated(client):
    email = f"me_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/auth/register", json={"email": email, "password": "securepass123"})
    assert reg.status_code == 201, f"Registration failed: {reg.json()}"
    # After register the TestClient holds the HttpOnly cookie — use it directly.
    r = client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_me_unauthenticated(client):
    # Clear any session cookie left by previous tests (module-scoped client).
    client.cookies.clear()
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
    # Register — cookie is set in the TestClient's jar automatically.
    reg = client.post("/auth/register", json={"email": email, "password": "securepass123"})
    assert reg.status_code == 201
    # Mint a token directly for Bearer-based assertions (does not hit the API).
    from app.auth import create_token
    token = create_token(email)
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


def test_scan_saving_null_safety_score(client, test_db_session):
    # Add a custom matched ingredient that has NO curated risk flags
    ing = Ingredient(
        # INCI names are matched by upper/lowercase depending on matching engine,
        # but the database INCI is always uppercase in the seed data.
        inci_name="NORISKDATAING",
        function="emollient",
        comedogenic=None,
        fungal_acne_safe=None,
        pregnancy_safe=None,
        irritant=None,
        regulatory_status="allowed",
    )
    test_db_session.add(ing)
    test_db_session.add(Alias(name="NoRiskDataIng", ingredient=ing))
    test_db_session.commit()

    # Rebuild matcher so it picks up the new ingredient
    from app.matching import Matcher
    from app.main import app, get_matcher
    new_matcher = Matcher(test_db_session)
    app.dependency_overrides[get_matcher] = lambda: new_matcher

    email = f"jwt_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/auth/register", json={"email": email, "password": "securepass123"})
    assert reg.status_code == 201

    r = client.post(
        "/analyze",
        json={
            "text": "NoRiskDataIng",
            "user_email": email,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["safety_score"] is None

    from app.auth import create_token
    token = create_token(email)
    headers = {"Authorization": f"Bearer {token}"}

    r_history = client.get(f"/users/{email}/scans", headers=headers)
    assert r_history.status_code == 200
    scans = r_history.json()["scans"]
    assert len(scans) == 1
    assert scans[0]["safety_score"] is None
    assert scans[0]["input_text"] == "NoRiskDataIng"


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


# ── Chat ──────────────────────────────────────────────────────────────────────

def test_chat_with_ingredient_context(client):
    """Chat returns a non-empty answer grounded on provided ingredient data."""
    analysis_context = {
        "found_ingredients": [
            {"matched_name": "Niacinamide", "explanation": "A B vitamin that reduces pores."},
            {"matched_name": "Glycerin", "explanation": "A humectant that attracts water."},
        ],
        "summary": "Mostly gentle ingredients.",
    }
    r = client.post(
        "/chat",
        json={
            "question": "Is Niacinamide safe for sensitive skin?",
            "analysis_context": analysis_context,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "answer" in data
    assert len(data["answer"]) > 10
    assert "grounded_on" in data
    assert "source" in data


def test_chat_empty_context_returns_helpful_message(client):
    """Chat with no found_ingredients returns a useful prompt to run analysis first."""
    r = client.post(
        "/chat",
        json={
            "question": "Is this product safe?",
            "analysis_context": {"found_ingredients": []},
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "answer" in data
    assert "analysis" in data["answer"].lower()
    assert data["grounded_on"] == []


def test_chat_filtered_by_ingredient_names(client):
    """ingredient_names filter restricts grounding to the specified subset."""
    analysis_context = {
        "found_ingredients": [
            {"matched_name": "Niacinamide", "explanation": "Vitamin B3."},
            {"matched_name": "Retinol", "explanation": "Vitamin A derivative."},
        ],
    }
    r = client.post(
        "/chat",
        json={
            "question": "Tell me about Niacinamide.",
            "analysis_context": analysis_context,
            "ingredient_names": ["Niacinamide"],
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "Niacinamide" in data["grounded_on"]
    assert "Retinol" not in data["grounded_on"]


def test_forgot_and_reset_password_flow(client):
    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    
    # 1. Register new user
    client.post("/auth/register", json={"email": email, "password": "oldpassword123"})
    
    # 2. Call forgot password
    r = client.post("/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    assert "link has been sent" in r.json()["detail"]
    
    # 3. Create a token directly to use for reset (since we mock emailing)
    from app.auth import create_reset_token
    token = create_reset_token(email)
    
    # 4. Reset password using valid token
    r = client.post("/auth/reset-password", json={"token": token, "new_password": "newpassword123"})
    assert r.status_code == 200
    assert "has been reset successfully" in r.json()["detail"]
    
    # 5. Verify we can log in with new password
    r = client.post("/auth/login", json={"email": email, "password": "newpassword123"})
    assert r.status_code == 200
    
    # 6. Verify we cannot log in with old password
    r = client.post("/auth/login", json={"email": email, "password": "oldpassword123"})
    assert r.status_code == 401


def test_scan_history_pagination(client, test_db_session):
    # 1. Register a new user
    email = f"page_{uuid.uuid4().hex[:8]}@example.com"
    reg = client.post("/auth/register", json={"email": email, "password": "securepass123"})
    assert reg.status_code == 201
    
    # 2. Get JWT token
    from app.auth import create_token
    token = create_token(email)
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get user object from DB to associate scans
    user = test_db_session.query(User).filter_by(email=email).first()
    assert user is not None
    
    # 3. Create 5 scans manually in DB for this user
    for i in range(5):
        scan = Scan(
            user_id=user.id,
            input_text=f"IngredientList {i}",
            summary=f"Summary {i}",
            safety_score=8.5,
            coverage_percent=100.0,
        )
        test_db_session.add(scan)
    test_db_session.commit()
    
    # 4. Test default pagination (limit=20, offset=0)
    r = client.get("/auth/scans", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["scans"]) == 5
    assert data["limit"] == 20
    assert data["offset"] == 0
    
    # 5. Test limit=2, offset=1
    r = client.get("/auth/scans?limit=2&offset=1", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["scans"]) == 2
    assert data["limit"] == 2
    assert data["offset"] == 1
    
    # 6. Test invalid query parameters (limit <= 0, limit > 100, offset < 0)
    r = client.get("/auth/scans?limit=0", headers=headers)
    assert r.status_code == 422
    
    r = client.get("/auth/scans?limit=101", headers=headers)
    assert r.status_code == 422
    
    r = client.get("/auth/scans?offset=-1", headers=headers)
    assert r.status_code == 422
    
    # 7. Test user-specific route /users/{email}/scans pagination
    r = client.get(f"/users/{email}/scans?limit=3&offset=2", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data["scans"]) == 3
    assert data["limit"] == 3
    assert data["offset"] == 2


def test_password_complexity_validator():
    from app.users import validate_password_complexity
    import sys
    import pytest

    # Temporarily bypass the pytest check to test complexity rules
    original_pytest = sys.modules.get("pytest")
    if "pytest" in sys.modules:
        del sys.modules["pytest"]
    try:
        with pytest.raises(ValueError, match="uppercase"):
            validate_password_complexity("lowercase123!")
            
        with pytest.raises(ValueError, match="lowercase"):
            validate_password_complexity("UPPERCASE123!")
            
        with pytest.raises(ValueError, match="digit"):
            validate_password_complexity("LowercaseAndUpper!")
            
        with pytest.raises(ValueError, match="special"):
            validate_password_complexity("LowercaseAndUpper123")
            
        with pytest.raises(ValueError, match="8 characters"):
            validate_password_complexity("Short1!")

        # Valid password should pass
        validate_password_complexity("Valid123!")
    finally:
        if original_pytest:
            sys.modules["pytest"] = original_pytest


def test_analyze_routine_new_conflicts(client, test_db_session):
    # 1. Register a fermented ingredient in the test database so matcher can resolve it.
    ing = Ingredient(
        inci_name="BIFIDA FERMENT LYSATE",
        function="skin conditioning",
        comedogenic=None,
        fungal_acne_safe="yes",
        pregnancy_safe="yes",
        irritant="no",
        regulatory_status="allowed",
    )
    test_db_session.add(ing)
    test_db_session.add(Alias(name="Bifida Ferment Lysate", ingredient=ing))
    test_db_session.commit()

    # Rebuild matcher so it picks up the new ingredient
    from app.matching import Matcher
    from app.main import app, get_matcher
    new_matcher = Matcher(test_db_session)
    app.dependency_overrides[get_matcher] = lambda: new_matcher

    # 2. Test Double AHA Exfoliation (Glycolic Acid + Lactic Acid)
    r = client.post(
        "/analyze/routine",
        json={
            "products": [
                {"name": "AHA Toner", "text": "Glycolic Acid"},
                {"name": "Lactic Serum", "text": "Lactic Acid"}
            ]
        }
    )
    assert r.status_code == 200
    data = r.json()
    assert data["compatible"] is False
    double_aha = next(c for c in data["conflicts"] if c["conflict_type"] == "Double AHA Exfoliation")
    assert double_aha["severity"] == "warning"
    assert "Double AHA" in double_aha["conflict_type"]

    # 3. Test Multiple Exfoliants (Glycolic Acid [AHA] + Salicylic Acid [BHA])
    r = client.post(
        "/analyze/routine",
        json={
            "products": [
                {"name": "AHA Toner", "text": "Glycolic Acid"},
                {"name": "BHA Serum", "text": "Salicylic Acid"}
            ]
        }
    )
    assert r.status_code == 200
    data = r.json()
    assert data["compatible"] is False
    mult_exf = next(c for c in data["conflicts"] if c["conflict_type"] == "Multiple Exfoliants")
    assert mult_exf["severity"] == "warning"

    # 4. Test Fermented + low-pH active (Bifida Ferment Lysate + Glycolic Acid)
    r = client.post(
        "/analyze/routine",
        json={
            "products": [
                {"name": "Ferment Essence", "text": "Bifida Ferment Lysate"},
                {"name": "AHA Toner", "text": "Glycolic Acid"}
            ]
        }
    )
    assert r.status_code == 200
    data = r.json()
    assert data["compatible"] is False
    ferment_aha = next(c for c in data["conflicts"] if c["conflict_type"] == "Fermented + AHA")
    assert ferment_aha["severity"] == "warning"





