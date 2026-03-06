"""
Bitmark Export — Compliant Bitmark JSON

Produces a Bitmark JSON array of bits following the official Bitmark specification:
https://docs.bitmark.cloud/

Top-level structure:
{
  "bitmark": [
    {
      "bit": { "type": "...", "format": "bitmark++", ... },
      "bitmark_extension": { ... }    // pipeline provenance, separate from Bitmark core
    },
    ...
  ],
  "_meta": { ... }    // pipeline-level metadata, NOT part of Bitmark core
}

Bit types used:
  chapter  — headings (level 1 / 2 / 3)
  article  — body text, lists, tables, footnotes, math, images, and all other blocks
             body uses bitmark++ ProseMirror-like node structure per the Bitmark docs
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from .canonical_model import (
    Block, CanonicalDoc, ClassificationDoc, ClassifiedBlock, ElementLabel, Span,
)
from .bitmark_mapping import get_mapping

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# bitmark++ text node helpers
# ---------------------------------------------------------------------------

def _text_node(
    text: str,
    bold: bool = False,
    italic: bool = False,
    href: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a bitmark++ inline text node."""
    node: Dict[str, Any] = {"type": "text", "text": text}
    marks: List[Dict[str, Any]] = []
    if bold:
        marks.append({"type": "bold"})
    if italic:
        marks.append({"type": "italic"})
    if href:
        marks.append({"type": "link", "attrs": {"href": href}})
    if marks:
        node["marks"] = marks
    return node


def _spans_to_content(spans: List[Span], fallback: str = "") -> List[Dict[str, Any]]:
    """Convert Span list to bitmark++ inline content nodes."""
    nodes = [
        _text_node(s.text, bold=s.bold, italic=s.italic, href=s.href)
        for s in spans
        if s.text
    ]
    return nodes if nodes else [{"type": "text", "text": fallback}]


def _paragraph(content: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "paragraph", "content": content, "attrs": {"section": ""}}


def _image_node(src: str, alt: Optional[str] = None) -> Dict[str, Any]:
    return {
        "type": "image",
        "attrs": {
            "src": src,
            "alt": alt or None,
            "title": None,
            "class": "center",
            "section": "",
        },
    }


def _list_item(content: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "listItem", "content": [_paragraph(content)]}


# ---------------------------------------------------------------------------
# Bit builders
# ---------------------------------------------------------------------------

def _chapter_bit(block: Block, cb: ClassifiedBlock) -> Dict[str, Any]:
    """Build a chapter bit for headings (h1/h2/h3)."""
    level_map = {
        ElementLabel.HEADING_1: 1,
        ElementLabel.HEADING_2: 2,
        ElementLabel.HEADING_3: 3,
    }
    return {
        "bit": {
            "type": "chapter",
            "format": "text",
            "item": block.text.strip(),
            "level": level_map.get(cb.label, 1),
        },
        "bitmark_extension": _extension(block, cb),
    }


def _article_bit(block: Block, cb: ClassifiedBlock) -> Dict[str, Any]:
    """Build an article bit for all non-heading content."""
    return {
        "bit": {
            "type": "article",
            "format": "bitmark++",
            "body": _build_body(block, cb),
        },
        "bitmark_extension": _extension(block, cb),
    }


def _build_body(block: Block, cb: ClassifiedBlock) -> List[Dict[str, Any]]:
    """Build the bitmark++ body node array for an article bit."""
    label = cb.label

    # Image: inline image body node
    if label == ElementLabel.IMAGE:
        src = block.source_provenance.get("image_src", "")
        return [_image_node(src, block.text.strip() or None)]

    # Bulleted lists
    if label in (ElementLabel.BULLETED_LIST_SINGLE, ElementLabel.BULLETED_LIST_NESTED):
        content = _spans_to_content(block.spans, block.text)
        return [{"type": "bulletList", "content": [_list_item(content)]}]

    # Numbered lists
    if label in (ElementLabel.NUMBERED_LIST_SINGLE, ElementLabel.NUMBERED_LIST_NESTED):
        content = _spans_to_content(block.spans, block.text)
        return [{"type": "orderedList", "content": [_list_item(content)]}]

    # Tables, footnotes, math, block_element, captions, cross_reference, and all other:
    # render as a plain paragraph; bitmark_extension carries any structured details.
    content = _spans_to_content(block.spans, block.text)
    return [_paragraph(content)]


def _extension(block: Block, cb: ClassifiedBlock) -> Dict[str, Any]:
    """Pipeline provenance — stored in bitmark_extension, NOT Bitmark core fields."""
    return {
        "block_id": block.block_id,
        "label": cb.label.value,
        "confidence": round(cb.confidence, 4),
        "text": block.text[:500],
        "page": block.page,
        "bbox": block.bbox,
        "evidence": cb.evidence,
        "annotations": [a.model_dump() for a in (cb.annotations or [])],
    }


# ---------------------------------------------------------------------------
# Internal validator — checks required fields before returning
# ---------------------------------------------------------------------------

def _validate(bits: List[Dict[str, Any]]) -> List[str]:
    warnings: List[str] = []
    for i, wrapper in enumerate(bits):
        if "bit" not in wrapper:
            warnings.append(f"bit[{i}]: missing 'bit' key")
            continue
        inner = wrapper["bit"]
        if "type" not in inner:
            warnings.append(f"bit[{i}]: missing 'type'")
        if "format" not in inner:
            warnings.append(f"bit[{i}]: missing 'format'")
    return warnings


# ---------------------------------------------------------------------------
# Main export
# ---------------------------------------------------------------------------

def export_bitmark(
    doc: CanonicalDoc,
    classification: ClassificationDoc,
) -> Dict[str, Any]:
    cb_by_id: Dict[str, ClassifiedBlock] = {
        cb.block_id: cb for cb in classification.blocks
    }
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

        if cb.label in (ElementLabel.HEADING_1, ElementLabel.HEADING_2, ElementLabel.HEADING_3):
            bit = _chapter_bit(block, cb)
        else:
            bit = _article_bit(block, cb)

        bits.append(bit)
        btype = bit["bit"]["type"]
        type_counts[btype] = type_counts.get(btype, 0) + 1

    validation_warnings = _validate(bits)
    if validation_warnings:
        logger.warning("Bitmark validation warnings: %s", validation_warnings)

    if not bits and doc.blocks:
        validation_warnings.append(
            "No bits produced despite having blocks — check classifier output"
        )

    logger.info("Bitmark export: %d bits, type counts: %s", len(bits), type_counts)

    # Title: first heading_1 text, or fall back to filename
    title = str(doc.metadata.get("original_filename", doc.metadata.get("title", "Untitled")))
    for block in doc.blocks:
        cb = cb_by_id.get(block.block_id)
        if cb and cb.label == ElementLabel.HEADING_1:
            title = block.text.strip()
            break

    return {
        "bitmark": bits,
        "_meta": {
            "generator": "bitmark-hackathon-pipeline",
            "bitmark_compliance": "article + chapter bits, bitmark++ body format",
            "mapping_version": mapping_meta["version"],
            "title": title,
            "doc_id": doc.doc_id,
            "source_type": doc.source_type.value,
            "total_bits": len(bits),
            "type_counts": type_counts,
            "validation_warnings": validation_warnings,
        },
    }
