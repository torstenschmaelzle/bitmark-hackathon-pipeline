"""
FastAPI application entry point.

CORS is configured to allow the Vite dev server (localhost:5173) and any
production frontend URL set via FRONTEND_URL environment variable.
"""

import os
from dotenv import load_dotenv

# Load .env before importing anything that reads env vars
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .util.file_store import ensure_dirs
from .util.logging import setup_logging

setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="Bitmark Document Intelligence API",
    description=(
        "Ingests PDF, HTML, and DOCX documents, extracts structure, "
        "classifies elements, and outputs Bitmark JSON."
    ),
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server and any configured frontend URL
# ---------------------------------------------------------------------------
_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
_extra_origin = os.getenv("FRONTEND_URL")
if _extra_origin:
    _allowed_origins.append(_extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
app.include_router(router)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup() -> None:
    ensure_dirs()


@app.get("/")
async def root() -> dict:
    return {
        "message": "Bitmark Document Intelligence API",
        "docs": "/docs",
        "health": "/api/health",
    }
