"""
Layer C — Classification Orchestration

Coordinates:
  1. Heuristics (always run)
  2. LLM for blocks below confidence threshold (optional, env-gated)
Returns ClassificationDoc ready for post-processing.
"""

from __future__ import annotations

import logging
from typing import List

from .canonical_model import CanonicalDoc, ClassificationDoc, ClassifiedBlock, ElementLabel
from .heuristics import run_heuristics, HEURISTIC_CONFIDENCE_THRESHOLD
from .llm_classifier import classify_with_llm, USE_LLM

logger = logging.getLogger(__name__)

CONTEXT_WINDOW = 2  # blocks before and after for LLM context


def classify_document(doc: CanonicalDoc) -> ClassificationDoc:
    """
    Full classification pass over a CanonicalDoc.
    Returns ClassificationDoc (pre-postprocessing).
    """
    logger.info("Running heuristics on %d blocks", len(doc.blocks))
    heuristic_results: List[ClassifiedBlock] = run_heuristics(doc)

    final_results: List[ClassifiedBlock] = []
    blocks = doc.blocks

    for i, (block, heuristic_cb) in enumerate(zip(blocks, heuristic_results)):
        cb = heuristic_cb

        # If confidence is below threshold, optionally escalate to LLM
        if heuristic_cb.confidence < HEURISTIC_CONFIDENCE_THRESHOLD:
            if USE_LLM:
                logger.debug(
                    "Block %s below threshold (%.2f) → LLM",
                    block.block_id,
                    heuristic_cb.confidence,
                )
                context_before = blocks[max(0, i - CONTEXT_WINDOW): i]
                context_after = blocks[i + 1: i + 1 + CONTEXT_WINDOW]
                cb = classify_with_llm(block, context_before, context_after, heuristic_cb)
            else:
                # No LLM: blocks below threshold that have a label keep it;
                # blocks that heuristics left as UNKNOWN stay UNKNOWN.
                # We annotate the evidence to be transparent.
                if heuristic_cb.label == ElementLabel.UNKNOWN:
                    cb = heuristic_cb.model_copy(
                        update={"evidence": heuristic_cb.evidence + ["below_threshold_llm_disabled"]}
                    )

        final_results.append(cb)

    logger.info(
        "Classification complete. LLM used for %d blocks.",
        sum(1 for r in final_results if r.llm_used),
    )

    return ClassificationDoc(doc_id=doc.doc_id, blocks=final_results)
