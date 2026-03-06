"""
Layer B — Canonical Document Model

All adapters convert their source-specific structures into these Pydantic models.
Downstream classification and export code operates exclusively on CanonicalDoc.
Information is never silently discarded; provenance fields carry source-specific data.
"""

from __future__ import annotations

import uuid
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class SourceType(str, Enum):
    PDF = "pdf"
    HTML = "html"
    DOCX = "docx"


class ElementLabel(str, Enum):
    BODY_TEXT = "body_text"
    HEADING_1 = "heading_1"
    HEADING_2 = "heading_2"
    HEADING_3 = "heading_3"
    NUMBERED_LIST_SINGLE = "numbered_list_single"
    NUMBERED_LIST_NESTED = "numbered_list_nested"
    BULLETED_LIST_SINGLE = "bulleted_list_single"
    BULLETED_LIST_NESTED = "bulleted_list_nested"
    BLOCK_ELEMENT = "block_element"
    TABLE = "table"
    TABLE_HEADER_ROW = "table_header_row"
    TABLE_CAPTION = "table_caption"
    FOOTNOTE = "footnote"
    MATH = "math"
    IMAGE = "image"
    CHARACTER_FORMATTING = "character_formatting"
    ITALIC_EMPHASIS_OR_TERM = "italic_emphasis_or_term"
    CROSS_REFERENCE = "cross_reference"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Span — character-level annotation
# ---------------------------------------------------------------------------

class Span(BaseModel):
    text: str
    bold: bool = False
    italic: bool = False
    font_name: Optional[str] = None
    font_size: Optional[float] = None
    color: Optional[str] = None
    href: Optional[str] = None
    baseline_shift: Optional[float] = None


# ---------------------------------------------------------------------------
# SpanAnnotation — inline semantic annotation (cross-references, citations)
# ---------------------------------------------------------------------------

class SpanAnnotation(BaseModel):
    """
    An inline semantic annotation anchored to a character range within block.text.
    Added to ClassifiedBlock.annotations during post-processing.
    Never changes the block's primary label.
    """
    type: str = "cross_reference"
    target_kind: str          # table | figure | chapter | section | equation | appendix | bibliography | other
    raw_text: str             # the exact matched substring from block.text
    normalized_target: str    # human-readable canonical form, e.g. "Table 3", "Section 1.2"
    confidence: float = Field(ge=0.0, le=1.0)
    start: int                # start char offset in block.text (inclusive)
    end: int                  # end char offset in block.text (exclusive)


# ---------------------------------------------------------------------------
# Block — paragraph / structural unit
# ---------------------------------------------------------------------------

class Block(BaseModel):
    block_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    page: Optional[int] = None
    bbox: Optional[List[float]] = None
    text: str
    spans: List[Span] = Field(default_factory=list)
    source_provenance: Dict[str, Any] = Field(default_factory=dict)
    features: Dict[str, Any] = Field(default_factory=dict)
    relationships: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# CanonicalDoc — top-level document representation
# ---------------------------------------------------------------------------

class CanonicalDoc(BaseModel):
    doc_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_type: SourceType
    metadata: Dict[str, Any] = Field(default_factory=dict)
    blocks: List[Block] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Classification models
# ---------------------------------------------------------------------------

class ClassifiedBlock(BaseModel):
    """Classification result for a single Block."""
    block_id: str
    label: ElementLabel
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: List[str] = Field(default_factory=list)
    llm_used: bool = False
    notes: Optional[str] = None
    # Inline semantic annotations (cross-references, citations).
    # Populated by post-processing. Never overrides the block label.
    annotations: List[SpanAnnotation] = Field(default_factory=list)


class ClassificationDoc(BaseModel):
    """Full classification result for a document."""
    doc_id: str
    blocks: List[ClassifiedBlock] = Field(default_factory=list)
