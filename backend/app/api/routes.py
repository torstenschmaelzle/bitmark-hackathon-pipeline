"""
API Routes

POST /api/upload              — upload a file, start processing
GET  /api/job/{job_id}        — poll job status and results
GET  /api/download/{job_id}/{artifact} — download a JSON artifact
GET  /api/bitmark/mapping     — return label → Bitmark type mapping + version hash
GET  /api/health
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..pipeline.orchestrator import run_pipeline, load_artifact
from ..pipeline.bitmark_mapping import get_mapping
from ..util.file_store import ensure_dirs, get_upload_path, get_output_path
from ..util.schemas import (
    JobState, JobStatus, UploadResponse, ALLOWED_EXTENSIONS, ALLOWED_ARTIFACTS,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_jobs: Dict[str, JobStatus] = {}


def _get_job(job_id: str) -> JobStatus:
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return _jobs[job_id]


def _process_job(job_id: str, file_path: Path, original_filename: str) -> None:
    job = _jobs[job_id]
    job.state = JobState.PROCESSING
    try:
        result = run_pipeline(job_id, file_path, original_filename)
        job.state = JobState.DONE
        job.canonical = result["canonical"]
        job.classification = result["classification"]
        job.bitmark = result["bitmark"]
        logger.info("[%s] Job complete", job_id)
    except Exception as exc:
        logger.exception("[%s] Pipeline failed: %s", job_id, exc)
        job.state = JobState.FAILED
        job.error = str(exc)


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile, background_tasks: BackgroundTasks) -> UploadResponse:
    ensure_dirs()
    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )
    job_id = str(uuid.uuid4())[:8]
    save_path = get_upload_path(job_id, filename)
    contents = await file.read()
    save_path.write_bytes(contents)
    logger.info("Saved upload %s → %s (%d bytes)", filename, save_path, len(contents))
    job = JobStatus(job_id=job_id, state=JobState.PENDING, filename=filename, created_at=time.time())
    _jobs[job_id] = job
    background_tasks.add_task(_process_job, job_id, save_path, filename)
    return UploadResponse(job_id=job_id)


@router.get("/job/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str) -> JobStatus:
    job = _get_job(job_id)
    if job.state == JobState.DONE and job.canonical is None:
        try:
            job.canonical = load_artifact(job_id, "canonical")
            job.classification = load_artifact(job_id, "classification")
            job.bitmark = load_artifact(job_id, "bitmark")
        except FileNotFoundError:
            pass
    return job


@router.get("/download/{job_id}/{artifact}")
async def download_artifact(job_id: str, artifact: str) -> FileResponse:
    if artifact not in ALLOWED_ARTIFACTS:
        raise HTTPException(status_code=400, detail=f"Unknown artifact '{artifact}'")
    job = _get_job(job_id)
    if job.state != JobState.DONE:
        raise HTTPException(status_code=409, detail=f"Job not complete (state={job.state.value})")
    path = get_output_path(job_id, artifact)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Artifact '{artifact}' not found on disk")
    return FileResponse(path=str(path), media_type="application/json", filename=f"{job_id}_{artifact}.json")


@router.get("/bitmark/mapping")
async def get_bitmark_mapping() -> dict:
    """Return the label → Bitmark type mapping and a version hash."""
    return get_mapping()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "jobs_in_memory": len(_jobs)}
