"""
Layer C Step 2 — LLM-Assisted Classification

Only invoked when heuristic confidence is below HEURISTIC_CONFIDENCE_THRESHOLD.
Uses Anthropic API by default; designed to be swapped for other providers.

The LLM is instructed to be conservative: prefer "unknown" when unsure.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from .canonical_model import Block, ClassifiedBlock, ElementLabel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config (from environment)
# ---------------------------------------------------------------------------

USE_LLM = os.getenv("USE_LLM", "false").lower() == "true"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")
LLM_CONFIDENCE_THRESHOLD = 0.60  # if LLM returns below this, force UNKNOWN

ALLOWED_LABELS = [label.value for label in ElementLabel]

# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a document structure classifier for a document intelligence system.
Your task: given a text block and context, classify it into one of the allowed element types.

Allowed labels:
body_text, heading_1, heading_2, heading_3, numbered_list_single, numbered_list_nested,
bulleted_list_single, bulleted_list_nested, block_element, table, table_header_row,
table_caption, footnote, math, image, character_formatting, italic_emphasis_or_term,
cross_reference, unknown

Rules:
- Be CONSERVATIVE. If you are unsure, return unknown.
- Return ONLY valid JSON matching the schema — no prose, no markdown fences.
- confidence must be a float between 0.0 and 1.0.
- evidence must be a list of short strings explaining your reasoning.
- should_defer = true means you are not confident and the system will force unknown.

Response schema (strict JSON):
{
  "label": "<one of the allowed labels>",
  "confidence": <float 0.0-1.0>,
  "evidence": ["<reason 1>", "<reason 2>"],
  "should_defer": <true|false>
}"""


def _build_user_prompt(
    block: Block,
    context_before: List[Block],
    context_after: List[Block],
) -> str:
    """Build the user-turn prompt for a single block."""
    def block_summary(b: Block, role: str) -> str:
        text_preview = b.text[:200].replace("\n", " ").strip()
        return (
            f"[{role}] text: {json.dumps(text_preview)}\n"
            f"  features: {json.dumps({k: v for k, v in b.features.items() if v is not None}, default=str)}\n"
            f"  provenance: {json.dumps(b.source_provenance, default=str)}"
        )

    parts = []
    for i, cb in enumerate(context_before):
        parts.append(block_summary(cb, f"CONTEXT_BEFORE_{i+1}"))
    parts.append(block_summary(block, "TARGET_BLOCK"))
    for i, ca in enumerate(context_after):
        parts.append(block_summary(ca, f"CONTEXT_AFTER_{i+1}"))

    return "\n\n".join(parts) + "\n\nClassify TARGET_BLOCK. Return only JSON."


# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------

def _call_anthropic(user_prompt: str) -> Optional[Dict[str, Any]]:
    """Call Anthropic API and return parsed JSON or None on failure."""
    try:
        import anthropic  # type: ignore
    except ImportError:
        logger.warning("anthropic package not installed; skipping LLM call")
        return None

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set; skipping LLM call")
        return None

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = client.messages.create(
            model=LLM_MODEL,
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = message.content[0].text.strip()
        # Strip markdown fences if model adds them despite instructions
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as exc:
        logger.warning("LLM call failed: %s", exc)
        return None


def _call_llm(user_prompt: str) -> Optional[Dict[str, Any]]:
    """Dispatch to the configured LLM provider."""
    if LLM_PROVIDER == "anthropic":
        return _call_anthropic(user_prompt)
    logger.warning("Unknown LLM_PROVIDER=%s; skipping", LLM_PROVIDER)
    return None


# ---------------------------------------------------------------------------
# Main classifier
# ---------------------------------------------------------------------------

def classify_with_llm(
    block: Block,
    context_before: List[Block],
    context_after: List[Block],
    existing: ClassifiedBlock,
) -> ClassifiedBlock:
    """
    Attempt LLM classification for a block that heuristics could not label confidently.
    Returns the original ClassifiedBlock with llm_used=True and potentially a new label.
    Falls back to UNKNOWN if the LLM call fails or the response is ambiguous.
    """
    if not USE_LLM:
        return existing

    user_prompt = _build_user_prompt(block, context_before, context_after)
    response = _call_llm(user_prompt)

    if response is None:
        # LLM unavailable — keep existing (likely UNKNOWN) with a note
        return existing.model_copy(
            update={
                "notes": "LLM call failed; kept heuristic result",
                "llm_used": True,
            }
        )

    # Validate label
    raw_label = response.get("label", "unknown")
    if raw_label not in ALLOWED_LABELS:
        raw_label = "unknown"

    llm_confidence = float(response.get("confidence", 0.0))
    llm_evidence = list(response.get("evidence", []))
    should_defer = bool(response.get("should_defer", False))

    # Force unknown for low confidence or explicit defer
    if should_defer or llm_confidence < LLM_CONFIDENCE_THRESHOLD:
        final_label = ElementLabel.UNKNOWN
        final_confidence = llm_confidence
        llm_evidence.append("LLM deferred or confidence below threshold → forced unknown")
    else:
        final_label = ElementLabel(raw_label)
        final_confidence = llm_confidence

    return ClassifiedBlock(
        block_id=block.block_id,
        label=final_label,
        confidence=final_confidence,
        evidence=llm_evidence,
        llm_used=True,
        notes=None,
    )
