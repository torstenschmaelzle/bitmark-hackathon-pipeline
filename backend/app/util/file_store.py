"""
File Store Utilities

Manages the data/uploads and data/outputs directories.
All paths are computed relative to this file's location.
"""

from __future__ import annotations

import os
from pathlib import Path

# Resolve data directory relative to backend root (two levels up from this file)
_BACKEND_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = _BACKEND_ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"


def ensure_dirs() -> None:
    """Create required directories if they don't exist."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)


def get_upload_path(job_id: str, original_filename: str) -> Path:
    """Return the path where the uploaded file should be saved."""
    suffix = Path(original_filename).suffix
    return UPLOADS_DIR / f"{job_id}{suffix}"


def get_output_path(job_id: str, artifact: str) -> Path:
    """
    Return the path for a job output artifact.
    artifact must be one of: canonical, classification, bitmark
    """
    return OUTPUTS_DIR / job_id / f"{artifact}.json"


def artifact_exists(job_id: str, artifact: str) -> bool:
    return get_output_path(job_id, artifact).exists()


def list_job_artifacts(job_id: str) -> list[str]:
    """Return list of artifact names that exist for a job."""
    job_dir = OUTPUTS_DIR / job_id
    if not job_dir.exists():
        return []
    return [p.stem for p in job_dir.glob("*.json")]
