"""
Bitmark Export

Uses LABEL_TO_BITMARK from bitmark_mapping.py as the single source of truth.
Every block appears in bits[]. All bits carry a bitmark_extension field.
Annotations (cross-references) are included in the extension.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from .canonical_model import (
    Block, CanonicalDoc, ClassificationDoc, ClassifiedBlock, ElementLabel, Span
)
from .bitmark_mapping import LABEL_TO_BITMARK, get_mapping

logger = logging.getLogger(__name__)


def _spans_to_body(spans: List[Span]) -> str:
    parts: List[str] = []
    for span in spans:
        text = span.text
        if span.bold and span.italic:
            text = f"**_{text}_**"
        elif span.bold:
            text = f"**{text}**"
        elif span.italic:
            text = f"_{text}_"
        if span.href:
            text = f"[{text}]({span.href})"
        parts.append(text)
    return "".join(parts)


def _make_bit(block: Block, cb: ClassifiedBlock) -> Dict[str, Any]:
    """Build one Bitmark bit, always including bitmark_extension."""
    label_str = cb.label.value
    mapping_entry = LABEL_TO_BITMARK.get(label_str, {})
    bitmark_type = mapping_entry.get("bitmark_type", "article")
    body_text = _spans_to_body(block.spans) if block.spans else block.text

    # Core fields
    bit: Dict[str, Any] = {
        "type":       bitmark_type,
        "block_id":   block.block_id,
        "label":      label_str,
        "confidence": round(cb.confidence, 4),
        # Extension — always present so total_bits == extracted blocks
        "bitmark_extension": {
            "block_id":        block.block_id,
            "label":           label_str,
            "bitmark_type":    bitmark_type,
            "confidence":      round(cb.confidence, 4),
            "text":            block.text[:500],
            "page":            block.page,
            "bbox":            block.bbox,
            "evidence":        cb.evidence,
            "annotations":     [a.model_dump() for a in (cb.annotations or [])],
        },
    }

    # Type-specific content
    if cb.label in (ElementLabel.HEADING_1, ElementLabel.HEADING_2, ElementLabel.HEADING_3):
        bit["level"] = mapping_entry.get("level", 1)
        bit["item"]  = block.text.strip()

    elif cb.label in (
        ElementLabel.BULLETED_LIST_SINGLE, ElementLabel.BULLETED_LIST_NESTED,
        ElementLabel.NUMBERED_LIST_SINGLE, ElementLabel.NUMBERED_LIST_NESTED,
    ):
        bit["list_id"]    = block.relationships.get("list_id", "")
        bit["list_index"] = block.relationships.get("list_index", 0)
        bit["ordered"]    = mapping_entry.get("ordered", False)
        bit["nested"]     = mapping_entry.get("nested", False)
        bit["item"]       = body_text.strip()

    elif cb.label in (ElementLabel.TABLE, ElementLabel.TABLE_HEADER_ROW):
        bit["table_id"]  = block.relationships.get("table_id", "")
        bit["row_index"] = block.relationships.get("row_index", 0)
        bit["is_header"] = cb.label == ElementLabel.TABLE_HEADER_ROW
        bit["item"]      = block.text.strip()

    elif cb.label == ElementLabel.IMAGE:
        bit["src"] = block.source_provenance.get("image_src", "")
        bit["alt"] = block.text.strip()

    else:
        bit["body"] = body_text

    if block.page is not None:
        bit["page"] = block.page
    if block.bbox:
        bit["bbox"] = block.bbox

    return bit


def export_bitmark(
    doc: CanonicalDoc,
    classification: ClassificationDoc,
) -> Dict[str, Any]:
    cb_by_id: Dict[str, ClassifiedBlock] = {cb.block_id: cb for cb in classification.blocks}
    mapping_meta = get_mapping()

    bits: List[Dict[str, Any]] = []
    type_counts: Dict[str, int] = {}

    for block in doc.blocks:
        cb = cb_by_id.get(block.block_id)
        if cb is None:
            cb = ClassifiedBlock(
                block_id=block.block_id,
                label=ElementLabel.UNKNOWN,
                confidence=0.0,
                evidence=["missing_classification"],
            )
        bit = _make_bit(block, cb)
        bits.append(bit)
        btype = bit.get("type", "article")
        type_counts[btype] = type_counts.get(btype, 0) + 1

    logger.info("Bitmark export: %d bits, type counts: %s", len(bits), type_counts)

    # Title from first heading_1
    title = str(doc.metadata.get("original_filename", doc.metadata.get("title", "Untitled")))
    for block in doc.blocks:
        cb = cb_by_id.get(block.block_id)
        if cb and cb.label == ElementLabel.HEADING_1:
            title = block.text.strip()
            break

    return {
        "bitmark": {
            "type": "book",
            "book": {
                "title": title,
                "doc_id": doc.doc_id,
                "source_type": doc.source_type.value,
                "metadata": doc.metadata,
                "bits": bits,
            },
        },
        "_meta": {
            "generator": "bitmark-hackathon-pipeline",
            "bitmark_compliance": "partial",
            "_mapping_version": mapping_meta["version"],
            "note": (
                "Subset of Bitmark format. All blocks carry a bitmark_extension field. "
                "Cross-reference annotations are in bitmark_extension.annotations. "
                "Do not use for production Bitmark compliance."
            ),
            "total_bits":    len(bits),
            "mapped_bits":   sum(1 for b in bits if b.get("label") != "unknown"),
            "unmapped_bits": sum(1 for b in bits if b.get("label") == "unknown"),
            "type_counts":   type_counts,
        },
    }
