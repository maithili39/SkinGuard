from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import require_user
from app.database import get_db
from app.models import Scan, User
from app.schemas import ProfileUpdate, UserIn
from app import users as users_svc

router = APIRouter(prefix="/users", tags=["users"])



@router.post("", deprecated=True)
def create_or_get_user(payload: UserIn, db: Session = Depends(get_db)):
    """Legacy endpoint. Deprecated — use POST /auth/register instead."""
    raise HTTPException(
        status_code=410,
        detail="This legacy endpoint is gone. Please use POST /auth/register instead.",
    )


@router.put("/{email}/profile")
def save_profile(
    email: str,
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if current_user.email.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden: You can only update your own profile.")
    user = users_svc.update_profile(db, current_user, payload.model_dump())
    return {"email": user.email, "full_name": user.full_name, "profile": users_svc.profile_dict(user)}


@router.get("/{email}/scans")
def scan_history(
    email: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if current_user.email.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden: You can only access your own scans.")
    user = db.query(User).filter_by(email=email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="No such user.")
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "email": user.email,
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


@router.delete("/{email}", status_code=204)
def delete_account(
    email: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """T3-1 GDPR erasure: soft-delete the account and anonymise all PII.

    Only the account owner can delete their own account.
    Sets deleted_at, anonymises email/name, clears avoid list.
    Scans are soft-deleted but retained until the retention window expires.
    """
    if current_user.email.strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Forbidden: You can only delete your own account.")
    users_svc.soft_delete_user(db, current_user)
    return  # 204 No Content
