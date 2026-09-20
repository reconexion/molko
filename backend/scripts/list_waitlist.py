"""Lista los correos de la lista de espera (más antiguos primero).

Uso:
    cd backend && .venv/bin/python -m scripts.list_waitlist
"""

import sys

sys.path.insert(0, ".")

from app import models  # noqa: E402,F401
from app.db.base import Base, SessionLocal, engine  # noqa: E402
from app.models.waitlist import WaitlistEntry  # noqa: E402

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        entries = db.query(WaitlistEntry).order_by(WaitlistEntry.created_at).all()
        for entry in entries:
            print(f"{entry.created_at:%Y-%m-%d %H:%M}  {entry.email}")
        print(f"\n{len(entries)} en la lista de espera")
    finally:
        db.close()
