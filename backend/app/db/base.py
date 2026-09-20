from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utcnow() -> datetime:
    # SQLite devuelve datetimes sin zona horaria, así que todo se guarda y se
    # compara como UTC "naive" para que las comparaciones no mezclen tipos.
    return datetime.now(timezone.utc).replace(tzinfo=None)


# create_all no altera tablas existentes: cada columna nueva de "users" se agrega aquí
# para las bases SQLite ya creadas (con otro motor, usa migraciones).
_USER_COLUMNS = {
    "token_version": "INTEGER NOT NULL DEFAULT 0",
    "name": "VARCHAR(60)",
    "terms_accepted_at": "DATETIME",
    "terms_version": "VARCHAR(20)",
    "language": "VARCHAR(5) NOT NULL DEFAULT 'es'",
    "email_verified_at": "DATETIME",
    "google_sub": "VARCHAR(64)",
}


def ensure_sqlite_columns() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    existing = {column["name"] for column in inspect(engine).get_columns("users")}
    with engine.begin() as connection:
        for name, definition in _USER_COLUMNS.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))
        # SQLite no admite UNIQUE en ADD COLUMN: la unicidad de google_sub va en un índice.
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)"))
