import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.chat import router as chat_router
from backend.api.jd import router as jd_router


CLIENT_URL = os.getenv(
    "CLIENT_URL"
)

ALLOWED_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]

if CLIENT_URL:
    ALLOWED_ORIGINS.append(
        CLIENT_URL.rstrip("/")
    )


app = FastAPI(
    title="Portfolio AI API",
    version="1.0.0",
    description="Backend API for my AI-powered professional portfolio."
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(chat_router)
app.include_router(jd_router)


@app.get("/")
async def root():
    return {
        "message": "Portfolio AI API is running"
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "portfolio-ai-api"
    }