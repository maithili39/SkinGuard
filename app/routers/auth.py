import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.auth import create_reset_token, create_token, decode_reset_token, get_current_user, hash_password, hash_reset_token, require_user
from app.database import get_db
from app.deps import CORS_ORIGINS, IS_PRODUCTION, _limit, limiter
from app.models import Scan, User
from app.schemas import AuthOut, ForgotPasswordIn, LoginIn, RegisterIn, ResetPasswordIn
from app import users as users_svc

logger = logging.getLogger("skinguard.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=7 * 86400,
        expires=7 * 86400,
        samesite="lax",
        secure=IS_PRODUCTION,
        path="/",
    )


@router.post("/register", status_code=201)
@limiter.limit(_limit("5/minute"))
def register(request: Request, payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    """Register a new account. Sets an HttpOnly session cookie — JWT is NOT in the body."""
    try:
        user = users_svc.register_user(db, payload.email, payload.password, full_name=payload.full_name)
    except ValueError as exc:
        msg = str(exc)
        if "already registered" in msg.lower() or "already exists" in msg.lower():
            raise HTTPException(status_code=409, detail="User already exists.")
        raise HTTPException(status_code=400, detail=msg)
    _set_auth_cookie(response, create_token(user.email))
    return AuthOut(email=user.email, full_name=user.full_name, profile=users_svc.profile_dict(user))


@router.post("/login")
@limiter.limit(_limit("10/minute"))
def login(request: Request, payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    """Authenticate with email + password. Sets an HttpOnly session cookie."""
    user = users_svc.authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    _set_auth_cookie(response, create_token(user.email))
    return AuthOut(email=user.email, full_name=user.full_name, profile=users_svc.profile_dict(user))


@router.post("/logout")
def logout(response: Response):
    """Clear session cookie to log out."""
    response.delete_cookie(key="access_token", path="/", samesite="lax")
    return {"detail": "Successfully logged out."}


@router.get("/me")
def me(user: User = Depends(require_user)):
    """Return the currently authenticated user's profile."""
    return {"email": user.email, "full_name": user.full_name, "profile": users_svc.profile_dict(user)}


@router.post("/forgot-password")
@limiter.limit(_limit("5/minute"))
def forgot_password(request: Request, payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    """Generate a signed reset token and send email (or log reset link in dev)."""
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter_by(email=email_clean).first()
    _generic_response = {"detail": "If the email exists in our system, a password reset link has been sent."}

    if not user:
        logger.info("Forgot password request for non-existent email: %s", email_clean)
        return _generic_response

    token = create_reset_token(user.email)
    # Fix #4: persist a one-way hash of the token so the reset endpoint can
    # reject replays. The hash is cleared as soon as the token is consumed.
    user.password_reset_token_hash = hash_reset_token(token)
    db.commit()

    # Never trust the client-supplied Origin to build the reset link — an attacker
    # could point the emailed URL at their own host. Only use it if it is one of
    # our configured trusted origins, otherwise fall back to the first one.
    _default_origin = CORS_ORIGINS[0] if CORS_ORIGINS else "http://localhost:3000"
    request_origin = request.headers.get("origin")
    origin = request_origin if request_origin in CORS_ORIGINS else _default_origin
    reset_url = f"{origin}/reset-password?token={token}"

    resend_api_key = os.environ.get("RESEND_API_KEY")
    if resend_api_key:
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            }
            email_payload = {
                "from": "SkinGuard <noreply@resend.dev>",
                "to": [user.email],
                "subject": "Reset your SkinGuard Password",
                "html": (
                    f"<p>You requested a password reset for your SkinGuard account.</p>"
                    f"<p>Click the link below to set a new password (expires in 1 hour):</p>"
                    f"<p><a href=\"{reset_url}\">{reset_url}</a></p>"
                    f"<p>If you did not request this, please ignore this email.</p>"
                ),
            }
            with httpx.Client() as client:
                res = client.post("https://api.resend.com/emails", json=email_payload, headers=headers)
                res.raise_for_status()
            logger.info("Password reset email sent via Resend for user: %s", user.email)
        except Exception as exc:
            logger.error("Failed to send password reset email via Resend: %s. Logging reset link instead.", exc)
            logger.warning("DEVELOPER RESET URL: %s", reset_url)
    else:
        logger.info("Resend not configured (RESEND_API_KEY missing).")
        logger.warning("DEVELOPER RESET URL: %s", reset_url)

    return _generic_response


@router.post("/reset-password")
@limiter.limit(_limit("5/minute"))
def reset_password(request: Request, payload: ResetPasswordIn, db: Session = Depends(get_db)):
    """Validate reset token and update password."""
    email = decode_reset_token(payload.token)
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    user = db.query(User).filter_by(email=email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    # Fix #4: one-time-use guard — reject replayed tokens.
    # The stored hash is cleared immediately after first use so a second
    # request with the same token fails here even if the JWT is still valid.
    from app.auth import hash_reset_token as _hrt
    if not user.password_reset_token_hash or user.password_reset_token_hash != _hrt(payload.token):
        raise HTTPException(status_code=400, detail="Reset token has already been used or was not issued.")

    try:
        users_svc.validate_password_complexity(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user.hashed_password = hash_password(payload.new_password)
    # Consume the token — clears the stored hash so replays are rejected.
    user.password_reset_token_hash = None
    db.commit()
    logger.info("Password reset successfully for user: %s", user.email)
    return {"detail": "Password has been reset successfully."}


@router.get("/scans")
def auth_scan_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Return authenticated user's scan history (paginated)."""
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == current_user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "email": current_user.email,
        "offset": offset,
        "limit": limit,
        "scans": [
            {
                "id": s.id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "safety_score": s.safety_score,
                "coverage_percent": s.coverage_percent,
                "summary": s.summary,
                "input_text": s.input_text,
            }
            for s in scans
        ],
    }
