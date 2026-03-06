"""
Pipeline Orchestrator

Top-level coordinator that:
  1. Selects the correct adapter based on file extension
  2. Runs classification (heuristics + optional LLM)
  3. Runs post-processing
  4. Exports all three artifacts to disk
  5. Returns the job output dict
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict

from ..adapters.pdf_adapter import PDFAdapter
from ..adapters.html_adapter import HTMLAdapter
from ..adapters.docx_adapter import DOCXAdapter
from ..util.file_store import get_output_path
from .classification import classify_document
from .postprocess import run_postprocessing
from .bitmark_export import export_bitmark
from .canonical_model import CanonicalDoc

logger = logging.getLogger(__name__)

_ADAPTERS = {
    ".pdf": PDFAdapter,
    ".html": HTMLAdapter,
    ".htm": HTMLAdapter,
    ".docx": DOCXAdapter,
}


def run_pipeline(
    job_id: str,
    file_path: Path,
    original_filename: str,
) -> Dict[str, Any]:
    """
    Execute the full ingestion → classification → export pipeline.

    Returns a dict with keys: canonical, classification, bitmark
    (each being a JSON-serializable dict).

    Raises RuntimeError on unrecoverable errors (e.g. unsupported file type).
    """
    suffix = file_path.suffix.lower()
    adapter_cls = _ADAPTERS.get(suffix)
    if adapter_cls is None:
        raise RuntimeError(f"Unsupported file type: {suffix}")

    logger.info("[%s] Ingesting %s with %s", job_id, original_filename, adapter_cls.__name__)
    t0 = time.perf_counter()

    # Layer A: ingestion
    adapter = adapter_cls()
    doc: CanonicalDoc = adapter.ingest(file_path)
    doc.metadata["original_filename"] = original_filename
    doc.metadata["job_id"] = job_id
    logger.info("[%s] Ingested %d blocks in %.2fs", job_id, len(doc.blocks), time.perf_counter() - t0)

    # Layer C step 1+2: classification
    classification = classify_document(doc)

    # Layer C step 3: post-processing
    classification = run_postprocessing(doc, classification)

    # Export: Bitmark JSON
    bitmark = export_bitmark(doc, classification)

    # Serialize all three artifacts
    canonical_data = doc.model_dump()
    classification_data = classification.model_dump()
    bitmark_data = bitmark

    # Persist to disk
    _save_artifact(job_id, "canonical", canonical_data)
    _save_artifact(job_id, "classification", classification_data)
    _save_artifact(job_id, "bitmark", bitmark_data)

    logger.info("[%s] Pipeline complete in %.2fs", job_id, time.perf_counter() - t0)

    return {
        "canonical": canonical_data,
        "classification": classification_data,
        "bitmark": bitmark_data,
    }


def _save_artifact(job_id: str, artifact: str, data: Dict[str, Any]) -> None:
    path = get_output_path(job_id, artifact)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)
    logger.debug("Saved %s to %s", artifact, path)


def load_artifact(job_id: str, artifact: str) -> Dict[str, Any]:
    """Load a previously saved artifact from disk."""
    path = get_output_path(job_id, artifact)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
