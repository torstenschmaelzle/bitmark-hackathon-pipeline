"""
Layer C Step 3 — Deterministic Post-Processing

Passes:
  1. List grouping — merge consecutive list items, assign list_id
  2. Table grouping — merge table rows, detect header row
  3. Caption attachment — attach captions to adjacent tables
  4. Reference annotation — detect cross-references inside ALL blocks.
     List items keep their list label; annotations are stored inline.
     Only promotes to cross_reference label when the reference IS the whole block.
"""

from __future__ import annotations

import re
import uuid
import logging
from typing import Dict, List, Optional, Tuple

from .canonical_model import (
    Block, CanonicalDoc, ClassificationDoc, ClassifiedBlock, ElementLabel, SpanAnnotation
)

logger = logging.getLogger(__name__)

_LIST_LABELS = frozenset({
    ElementLabel.BULLETED_LIST_SINGLE, ElementLabel.BULLETED_LIST_NESTED,
    ElementLabel.NUMBERED_LIST_SINGLE, ElementLabel.NUMBERED_LIST_NESTED,
})
_TABLE_LABELS = frozenset({ElementLabel.TABLE, ElementLabel.TABLE_HEADER_ROW})

_CAPTION_RE = re.compile(r"^(Table|Figure|Fig\.?|Chart|Exhibit)\s+\d+", re.IGNORECASE)

# ---------------------------------------------------------------------------
# Reference annotation patterns
# Each tuple: (compiled pattern, target_kind)
# Group 0 = full match, Group 1 = identifier (used for normalization)
# ---------------------------------------------------------------------------

_ANN_PATTERNS: List[Tuple[re.Pattern, str]] = [
    # Table: "Table 3", "Tab. 3", "see Table 3"
    (re.compile(r'\b(?:Table|Tab\.?)\s+(\d+[\w.]*)', re.IGNORECASE), 'table'),
    # Figure: "Figure 2", "Fig. 2a"
    (re.compile(r'\b(?:Figure|Fig\.?)\s+(\d+[a-zA-Z]?)', re.IGNORECASE), 'figure'),
    # Chapter: "Chapter 5", "Ch. 5"
    (re.compile(r'\b(?:Chapter|Ch\.?)\s+(\d+[\w.]*)', re.IGNORECASE), 'chapter'),
    # Section: "Section 1.2", "Sec. 3"
    (re.compile(r'\b(?:Section|Sec\.?)\s+([\d.]+\w*)', re.IGNORECASE), 'section'),
    # Equation: "Eq. (4)", "Equation 4"
    (re.compile(r'\b(?:Equation|Eq\.?)\s*\(?(\d+[\w.]*)\)?', re.IGNORECASE), 'equation'),
    # Appendix: "Appendix A", "Appendix B2"
    (re.compile(r'\bAppendix\s+([A-Z\d][\w.]*)', re.IGNORECASE), 'appendix'),
    # Bracketed numeric citations: [1], [1,2], [1-3], [12]
    (re.compile(r'\[(\d+(?:[,\s\-]\s*\d+)*)\]'), 'bibliography'),
    # Author-year in parens: (Smith, 2020), (Smith et al., 2020)
    (re.compile(r'\(([A-Z][a-z]+(?:\s+et\s+al\.?)?,\s*\d{4})\)'), 'bibliography'),
]

_KIND_LABELS = {
    'table': 'Table', 'figure': 'Figure', 'chapter': 'Chapter',
    'section': 'Section', 'equation': 'Equation', 'appendix': 'Appendix',
}


def _normalize(kind: str, identifier: str, raw: str) -> str:
    prefix = _KIND_LABELS.get(kind)
    if prefix:
        return f"{prefix} {identifier.strip()}"
    return raw.strip()  # bibliography: use raw text


def _find_annotations(text: str) -> List[SpanAnnotation]:
    """Run all patterns against text and return SpanAnnotation objects."""
    annotations: List[SpanAnnotation] = []
    seen_ranges: List[Tuple[int, int]] = []

    for pattern, kind in _ANN_PATTERNS:
        for m in pattern.finditer(text):
            start, end = m.start(), m.end()
            # Skip if overlapping with an already-recorded annotation
            if any(s < end and start < e for s, e in seen_ranges):
                continue
            identifier = m.group(1) if m.lastindex and m.lastindex >= 1 else m.group(0)
            raw = m.group(0)
            annotations.append(SpanAnnotation(
                type="cross_reference",
                target_kind=kind,
                raw_text=raw,
                normalized_target=_normalize(kind, identifier, raw),
                confidence=0.85,
                start=start,
                end=end,
            ))
            seen_ranges.append((start, end))

    return sorted(annotations, key=lambda a: a.start)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_postprocessing(
    doc: CanonicalDoc,
    classification: ClassificationDoc,
) -> ClassificationDoc:
    block_map: Dict[str, Block] = {b.block_id: b for b in doc.blocks}
    cbs: List[ClassifiedBlock] = [cb.model_copy() for cb in classification.blocks]

    _pass_list_grouping(cbs, block_map)
    _pass_table_grouping(cbs, block_map)
    _pass_caption_attachment(cbs, block_map)
    _pass_reference_annotations(cbs, block_map)

    return ClassificationDoc(doc_id=classification.doc_id, blocks=cbs)


# ---------------------------------------------------------------------------
# Pass 1: List grouping
# ---------------------------------------------------------------------------

def _pass_list_grouping(
    cbs: List[ClassifiedBlock],
    block_map: Dict[str, Block],
) -> None:
    n = len(cbs)
    i = 0
    while i < n:
        if cbs[i].label not in _LIST_LABELS:
            i += 1
            continue

        run_indices = [i]
        j = i + 1
        while j < n and cbs[j].label in _LIST_LABELS:
            run_indices.append(j)
            j += 1

        if len(run_indices) > 1:
            list_id = str(uuid.uuid4())
            has_nested = any(
                cbs[k].label in (ElementLabel.BULLETED_LIST_NESTED, ElementLabel.NUMBERED_LIST_NESTED)
                for k in run_indices
            )
            is_numbered = any(
                cbs[k].label in (ElementLabel.NUMBERED_LIST_SINGLE, ElementLabel.NUMBERED_LIST_NESTED)
                for k in run_indices
            )
            for list_index, k in enumerate(run_indices):
                new_label = (
                    ElementLabel.NUMBERED_LIST_NESTED if (is_numbered and has_nested) else
                    ElementLabel.NUMBERED_LIST_SINGLE if is_numbered else
                    ElementLabel.BULLETED_LIST_NESTED if has_nested else
                    ElementLabel.BULLETED_LIST_SINGLE
                )
                cbs[k] = cbs[k].model_copy(update={
                    "label": new_label,
                    "evidence": cbs[k].evidence + [f"list_group={list_id} index={list_index}"],
                })
                block_map[cbs[k].block_id].relationships["list_id"] = list_id
                block_map[cbs[k].block_id].relationships["list_index"] = list_index
        i = j


# ---------------------------------------------------------------------------
# Pass 2: Table grouping
# ---------------------------------------------------------------------------

def _pass_table_grouping(
    cbs: List[ClassifiedBlock],
    block_map: Dict[str, Block],
) -> None:
    n = len(cbs)
    i = 0
    while i < n:
        if cbs[i].label not in _TABLE_LABELS:
            i += 1
            continue

        run_indices = [i]
        j = i + 1
        while j < n and cbs[j].label in _TABLE_LABELS:
            run_indices.append(j)
            j += 1

        table_id = str(uuid.uuid4())
        for row_index, k in enumerate(run_indices):
            block = block_map[cbs[k].block_id]
            if row_index == 0 and cbs[k].label != ElementLabel.TABLE_HEADER_ROW:
                if block.features.get("all_bold") or block.features.get("bold_ratio", 0) >= 0.70:
                    cbs[k] = cbs[k].model_copy(update={
                        "label": ElementLabel.TABLE_HEADER_ROW,
                        "evidence": cbs[k].evidence + ["first_row_all_bold→header"],
                    })
            block.relationships["table_id"] = table_id
            block.relationships["row_index"] = row_index
        i = j


# ---------------------------------------------------------------------------
# Pass 3: Caption attachment
# ---------------------------------------------------------------------------

def _pass_caption_attachment(
    cbs: List[ClassifiedBlock],
    block_map: Dict[str, Block],
) -> None:
    n = len(cbs)
    for i, cb in enumerate(cbs):
        if cb.label not in _TABLE_LABELS:
            continue
        if i > 0:
            prev, prev_block = cbs[i - 1], block_map[cbs[i - 1].block_id]
            if _is_caption_candidate(prev_block, prev):
                cbs[i - 1] = prev.model_copy(update={
                    "label": ElementLabel.TABLE_CAPTION,
                    "confidence": 0.80,
                    "evidence": prev.evidence + ["caption_before_table"],
                })
        if i < n - 1:
            nxt, nxt_block = cbs[i + 1], block_map[cbs[i + 1].block_id]
            if nxt.label not in _TABLE_LABELS and _is_caption_candidate(nxt_block, nxt):
                cbs[i + 1] = nxt.model_copy(update={
                    "label": ElementLabel.TABLE_CAPTION,
                    "confidence": 0.78,
                    "evidence": nxt.evidence + ["caption_after_table"],
                })


def _is_caption_candidate(block: Block, cb: ClassifiedBlock) -> bool:
    text = block.text.strip()
    if not text or len(text) > 300:
        return False
    if cb.confidence >= 0.85 and cb.label not in (ElementLabel.BODY_TEXT, ElementLabel.UNKNOWN):
        return False
    return bool(_CAPTION_RE.match(text))


# ---------------------------------------------------------------------------
# Pass 4: Reference annotations
#
# Key rule: list items KEEP their list label.
# Annotations are stored in ClassifiedBlock.annotations.
# A block is promoted to cross_reference only when:
#   - It is NOT a list item, AND
#   - Reference text covers >= 50% of block text
# ---------------------------------------------------------------------------

def _pass_reference_annotations(
    cbs: List[ClassifiedBlock],
    block_map: Dict[str, Block],
) -> None:
    total_annotated = 0

    for i, cb in enumerate(cbs):
        block = block_map[cb.block_id]
        text = block.text.strip()
        if not text:
            continue

        annotations = _find_annotations(text)
        if not annotations:
            continue

        total_annotated += 1
        is_list = cb.label in _LIST_LABELS

        if is_list:
            # Keep list label; add annotations only
            cbs[i] = cb.model_copy(update={
                "annotations": annotations,
                "evidence": cb.evidence + [
                    f"contains_ref_annotations: {[a.normalized_target for a in annotations]}"
                ],
            })
        else:
            # For non-list blocks: promote to cross_reference only if refs dominate
            matched_chars = sum(a.end - a.start for a in annotations)
            if matched_chars >= len(text) * 0.5:
                cbs[i] = cb.model_copy(update={
                    "label": ElementLabel.CROSS_REFERENCE,
                    "confidence": 0.84,
                    "annotations": annotations,
                    "evidence": cb.evidence + [
                        f"cross_ref_dominant: {annotations[0].normalized_target}"
                    ],
                })
            else:
                # References are present but block has other content — annotate only
                cbs[i] = cb.model_copy(update={
                    "annotations": annotations,
                    "evidence": cb.evidence + [
                        f"inline_refs: {[a.normalized_target for a in annotations]}"
                    ],
                })

    logger.info("Reference annotations: %d blocks annotated", total_annotated)
