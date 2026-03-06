"""
Shared API-level schemas (separate from pipeline Pydantic models).
These are what the API routes expose to the frontend.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class JobState(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class JobStatus(BaseModel):
    job_id: str
    state: JobState
    filename: str
    created_at: float
    error: Optional[str] = None
    # Populated when state == DONE
    canonical: Optional[Dict[str, Any]] = None
    classification: Optional[Dict[str, Any]] = None
    bitmark: Optional[Dict[str, Any]] = None


class UploadResponse(BaseModel):
    job_id: str
    message: str = "Processing started"


ALLOWED_EXTENSIONS = {".pdf", ".html", ".htm", ".docx"}
ALLOWED_ARTIFACTS = {"canonical", "classification", "bitmark"}
