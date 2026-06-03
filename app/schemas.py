from pydantic import BaseModel, EmailStr, Field


class ProfileIn(BaseModel):
    pregnant: bool = False
    sensitive_skin: bool = False
    acne_prone: bool = False
    fungal_acne: bool = False
    avoid_list: list[str] = Field(default_factory=list)


class AnalyzeIn(BaseModel):
    # Raw ingredient text — capped at 15,000 chars (~300 ingredients).
    text: str = Field(..., max_length=15_000)
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


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str
    profile: dict
