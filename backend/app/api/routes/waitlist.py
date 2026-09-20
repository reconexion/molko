from fastapi import APIRouter, Depends, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.routes.auth import normalize_email
from app.core.rate_limit import rate_limit
from app.db.base import get_db
from app.models.waitlist import WaitlistEntry
from app.schemas.waitlist import WaitlistRequest, WaitlistResponse

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


# Siempre responde igual, esté o no el correo ya anotado, para no revelar quién
# está en la lista.
@router.post(
    "",
    response_model=WaitlistResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit("waitlist", limit=5, window_seconds=600))],
)
def join_waitlist(payload: WaitlistRequest, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    if db.query(WaitlistEntry).filter(WaitlistEntry.email == email).first() is None:
        db.add(WaitlistEntry(email=email))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return WaitlistResponse()
