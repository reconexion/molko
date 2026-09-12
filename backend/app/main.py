from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, billing
from app.core.config import settings
from app.db.base import Base, engine
from app.models import user  # noqa: F401  (ensures models are registered before create_all)

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(billing.router)


@app.get("/health")
def health():
    return {"status": "ok"}
