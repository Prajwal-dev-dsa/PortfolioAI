from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(
    title="Portfolio AI API",
    version="1.0.0",
    description="Backend API for my AI-powered professional portfolio."
)


# Allow the frontend to communicate with the backend.
# We will use these localhost origins during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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