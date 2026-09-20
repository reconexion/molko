from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models.usage import YoutubeDownload


def month_start() -> datetime:
    return utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def youtube_downloads_this_month(db: Session, user_id: int) -> int:
    return (
        db.query(func.count(YoutubeDownload.id))
        .filter(YoutubeDownload.user_id == user_id, YoutubeDownload.created_at >= month_start())
        .scalar()
        or 0
    )
