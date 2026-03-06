"""
Bitmark Type Mapping — single source of truth.

Maps internal classification labels to Bitmark bit types.
Used by:
  - bitmark_export.py  (maps bits at export time)
  - GET /api/bitmark/mapping  (served to frontend for settings page)

To change a mapping, edit ONLY this file.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

# ---------------------------------------------------------------------------
# Canonical mapping: label → Bitmark type metadata
# ---------------------------------------------------------------------------

LABEL_TO_BITMARK: Dict[str, Dict[str, Any]] = {
    "body_text": {
        "bitmark_type": "article",
        "description": "General body text paragraph",
        "has_body": True,
    },
    "heading_1": {
        "bitmark_type": "chapter",
        "description": "Top-level heading (H1)",
        "level": 1,
    },
    "heading_2": {
        "bitmark_type": "chapter",
        "description": "Second-level heading (H2)",
        "level": 2,
    },
    "heading_3": {
        "bitmark_type": "chapter",
        "description": "Third-level heading (H3)",
        "level": 3,
    },
    "numbered_list_single": {
        "bitmark_type": "cloze-list",
        "description": "Single-level ordered list item",
        "ordered": True,
        "nested": False,
    },
    "numbered_list_nested": {
        "bitmark_type": "cloze-list",
        "description": "Nested ordered list item",
        "ordered": True,
        "nested": True,
    },
    "bulleted_list_single": {
        "bitmark_type": "cloze-list",
        "description": "Single-level unordered list item",
        "ordered": False,
        "nested": False,
    },
    "bulleted_list_nested": {
        "bitmark_type": "cloze-list",
        "description": "Nested unordered list item",
        "ordered": False,
        "nested": True,
    },
    "block_element": {
        "bitmark_type": "article",
        "description": "Block-level element (blockquote, code block, etc.)",
        "extension_note": "No direct Bitmark equivalent; stored as article with block_element extension",
    },
    "table": {
        "bitmark_type": "table",
        "description": "Table data row",
    },
    "table_header_row": {
        "bitmark_type": "table",
        "description": "Table header row",
        "is_header": True,
    },
    "table_caption": {
        "bitmark_type": "article",
        "description": "Table or figure caption",
        "extension_note": "Stored as article with table_caption extension",
    },
    "footnote": {
        "bitmark_type": "article",
        "description": "Footnote or endnote text",
        "extension_note": "No dedicated Bitmark footnote type; stored as article with footnote extension",
    },
    "math": {
        "bitmark_type": "article",
        "description": "Mathematical expression or equation block",
        "extension_note": "Stored as article with math extension pending Bitmark math type support",
    },
    "image": {
        "bitmark_type": "image",
        "description": "Image or figure placeholder",
    },
    "character_formatting": {
        "bitmark_type": "article",
        "description": "Inline character-level formatting run",
        "extension_note": "Formatting preserved in span markup within body",
    },
    "italic_emphasis_or_term": {
        "bitmark_type": "article",
        "description": "Italic emphasis or defined term",
        "extension_note": "Stored as article with italic body markup",
    },
    "cross_reference": {
        "bitmark_type": "article",
        "description": "Standalone cross-reference to another document element",
        "extension_note": "Reference details in bitmark_extension.annotations",
    },
    "unknown": {
        "bitmark_type": "article",
        "description": "Block that could not be classified with sufficient confidence",
        "extension_note": "Original text preserved; classification deferred",
    },
}


def get_mapping() -> Dict[str, Any]:
    """
    Return the full mapping dict with a stable version hash.
    The hash changes whenever LABEL_TO_BITMARK is edited.
    """
    mapping_json = json.dumps(LABEL_TO_BITMARK, sort_keys=True)
    version = hashlib.sha256(mapping_json.encode()).hexdigest()[:12]
    return {
        "mapping": LABEL_TO_BITMARK,
        "version": version,
        "label_count": len(LABEL_TO_BITMARK),
    }
