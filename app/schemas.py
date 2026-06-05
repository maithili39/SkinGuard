from pydantic import BaseModel, EmailStr, Field


class ProfileIn(BaseModel):
    pregnant: bool = False
    sensitive_skin: bool = False
    acne_prone: bool = False
    fungal_acne: bool = False
    rosacea: bool = False
    dry_skin: bool = False
    oily_skin: bool = False
    combination_skin: bool = False
    normal_skin: bool = False
    avoid_list: list[str] = Field(default_factory=list)


class AnalyzeIn(BaseModel):
    # Raw ingredient text — capped at 50,000 chars.
    text: str = Field(..., max_length=50_000)
    profile: ProfileIn = ProfileIn()
    # If provided, the result is saved to this user's scan history.
    user_email: str | None = None


class UserIn(BaseModel):
    email: EmailStr


class ProfileUpdate(ProfileIn):
    pass


# ── Auth schemas ─────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=8, description="Min 8 characters")
    full_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    """Returned by /auth/login and /auth/register.

    The JWT is set as an HttpOnly cookie — it is NOT returned in the body
    to prevent XSS token theft via localStorage.
    """
    email: str
    full_name: str | None = None
    profile: dict


# Kept for backwards-compat in tests that still check 'access_token'.
class TokenOut(AuthOut):
    """Deprecated alias — access_token field omitted intentionally."""
    pass


# ── Chat / RAG schemas ────────────────────────────────────────────────────────

class ChatIn(BaseModel):
    """Request body for the /chat endpoint (RAG Q&A grounded on analysis results)."""
    question: str = Field(..., min_length=3, max_length=500)
    # Full analysis result dict from a prior /analyze call — used as grounding context.
    analysis_context: dict
    # Explicit list of ingredient names to focus on (taken from found_ingredients).
    ingredient_names: list[str] = Field(default_factory=list)


class ChatOut(BaseModel):
    """Response from the /chat RAG endpoint."""
    answer: str
    # Which ingredients' data was used as grounding context for this answer.
    grounded_on: list[str]
    # LLM model used (or "template" if LLM unavailable).
    source: str


class RoutineProduct(BaseModel):
    name: str = Field(..., max_length=100)
    text: str = Field(..., max_length=50_000)


class RoutineAnalyzeIn(BaseModel):
    products: list[RoutineProduct] = Field(..., min_length=1)


# ── Password reset schemas ───────────────────────────────────────────────────

class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, description="Min 8 characters")

