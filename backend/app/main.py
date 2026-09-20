from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (registra los modelos antes de create_all)
from app.api.routes import auth, billing, google, transcode, waitlist, youtube
from app.core.config import DEFAULT_JWT_SECRET, MIN_JWT_SECRET_LENGTH, settings
from app.core.middleware import BodySizeLimitMiddleware, IpFloodMiddleware, SecurityHeadersMiddleware
from app.db.base import Base, engine, ensure_sqlite_columns

# Fail closed: with the default (public) secret anyone can sign a session token for any
# user id. A warning at startup is easy to miss, so the server refuses to start instead.
if settings.jwt_secret == DEFAULT_JWT_SECRET or len(settings.jwt_secret) < MIN_JWT_SECRET_LENGTH:
    raise RuntimeError(
        f"JWT_SECRET falta o es débil (mínimo {MIN_JWT_SECRET_LENGTH} caracteres). Genera una con: "
        'python -c "import secrets; print(secrets.token_urlsafe(48))" y ponla en backend/.env'
    )

Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()

is_production = settings.environment == "production"
app = FastAPI(
    title=settings.app_name,
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

_MIB = 1024 * 1024
# add_middleware puts each new one outermost. CORS goes last so that 413/429 rejections
# from the layers below still carry CORS headers and the browser can show the error.
app.add_middleware(IpFloodMiddleware, limit=600, window_seconds=60)
app.add_middleware(
    BodySizeLimitMiddleware,
    default_limit=1 * _MIB,
    path_limits={("POST", "/transcode"): transcode.MAX_VIDEO_BYTES + 1 * _MIB},
)
app.add_middleware(SecurityHeadersMiddleware)
# Bearer tokens travel in the Authorization header, never in cookies, so credentialed
# CORS is unnecessary; keep it off and allow only what the frontend actually uses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(google.router)
app.include_router(billing.router)
app.include_router(waitlist.router)
# Los subtítulos automáticos (api/routes/transcription.py + Deepgram) quedan para una
# versión futura: para reactivarlos, importa el router y regístralo aquí.
app.include_router(transcode.router)
app.include_router(youtube.router)


@app.get("/health")
def health():
    return {"status": "ok"}
