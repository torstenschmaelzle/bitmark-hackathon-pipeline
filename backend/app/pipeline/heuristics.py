"""
Layer C Step 1 — Heuristic Classification

High-precision, conservative rules.
FIX: body_text fallback now fires for any non-empty text block (word_count >= 1),
not just blocks with 8+ words. Short blocks that don't match a more specific rule
get body_text with lower confidence rather than staying as UNKNOWN.
Image blocks produced by the PDF adapter are also handled here.
"""

from __future__ import annotations

import re
import statistics
from typing import Dict, List, Optional, Tuple

from .canonical_model import Block, CanonicalDoc, ClassifiedBlock, ElementLabel

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BULLET_CHARS = frozenset({"•", "·", "◦", "▪", "▸", "→", "‣", "–", "*", "○", "►", "✓", "✗", "❖"})

_NUMBERED_SINGLE_RE = re.compile(
    r"^\s*(?:\d{1,3}|[a-z]|[ivxlcdm]+)[.)]\s+", re.IGNORECASE
)
_NUMBERED_NESTED_RE = re.compile(
    r"^\s*(?:\d+\.){1,3}\d*\s+|^\s*[A-Z]\.\d+\s+"
)
_CROSS_REF_RE = re.compile(
    r"\b(?:see|refer\s+to|cf\.?|per|as\s+in)\s+"
    r"(?:Table|Figure|Fig\.?|Chapter|Section|Appendix|Equation|Eq\.?)\s+[\w\d]+",
    re.IGNORECASE,
)
_MATH_RE = re.compile(r"\$.*?\$|\\[a-zA-Z]+\{|∫|∑|∏|√|≤|≥|≠|∈|∉|∀|∃|⟹|±|∂|∇|⊂|⊃|∪|∩")


# ---------------------------------------------------------------------------
# Feature computation (doc-level, called once per document)
# ---------------------------------------------------------------------------

def compute_doc_features(doc: CanonicalDoc) -> None:
    """
    Compute relative features for every block and store in block.features.
    Modifies blocks in place.
    """
    # Collect all non-None font sizes (exclude image placeholder blocks)
    all_sizes: List[float] = []
    for block in doc.blocks:
        if block.text == "[IMAGE]":
            continue
        for span in block.spans:
            if span.font_size is not None and span.font_size > 0:
                all_sizes.append(span.font_size)

    median_size: Optional[float] = statistics.median(all_sizes) if all_sizes else None

    # Per-page max-y (for footnote bottom-of-page detection)
    page_heights: Dict[int, float] = {}
    for block in doc.blocks:
        if block.bbox and block.page is not None:
            y1 = block.bbox[3]
            page_heights[block.page] = max(page_heights.get(block.page, 0.0), y1)

    for block in doc.blocks:
        f = block.features

        # --- font size ---
        sizes = [s.font_size for s in block.spans if s.font_size]
        f["avg_font_size"] = (sum(sizes) / len(sizes)) if sizes else None
        if median_size and f["avg_font_size"]:
            f["font_size_ratio"] = round(f["avg_font_size"] / median_size, 4)
        else:
            f["font_size_ratio"] = None

        # --- formatting ratios ---
        total_chars = max(len(block.text), 1)
        bold_chars   = sum(len(s.text) for s in block.spans if s.bold)
        italic_chars = sum(len(s.text) for s in block.spans if s.italic)
        f["bold_ratio"]   = round(bold_chars   / total_chars, 4)
        f["italic_ratio"] = round(italic_chars / total_chars, 4)
        f["all_bold"]     = bold_chars   >= total_chars * 0.85
        f["all_italic"]   = italic_chars >= total_chars * 0.85

        # --- length ---
        f["block_length"] = len(block.text.strip())
        f["word_count"]   = len(block.text.split())
        f["is_short"]     = f["block_length"] < 120  # raised from 80 — covers typical headings

        # --- indentation (PDF: x0 of bbox) ---
        f["x0"] = block.bbox[0] if block.bbox else None

        # --- page position (y0 / page_height) ---
        if block.bbox and block.page is not None:
            page_h = page_heights.get(block.page, 0.0)
            f["page_position_ratio"] = round(block.bbox[1] / page_h, 4) if page_h > 0 else None
        else:
            f["page_position_ratio"] = None

        # --- list patterns ---
        stripped = block.text.lstrip()
        f["starts_with_bullet"]      = bool(stripped) and stripped[0] in BULLET_CHARS
        f["numbered_single_match"]   = bool(_NUMBERED_SINGLE_RE.match(block.text))
        f["numbered_nested_match"]   = bool(_NUMBERED_NESTED_RE.match(block.text))

        # --- cross-ref / math ---
        f["has_cross_ref"] = bool(_CROSS_REF_RE.search(block.text))
        f["has_math"]      = bool(_MATH_RE.search(block.text))

        # --- indentation depth (rough leading-space count) ---
        leading = len(block.text) - len(block.text.lstrip(" \t"))
        f["indentation_level"] = leading // 2


# ---------------------------------------------------------------------------
# Heuristic rules (priority order)
# ---------------------------------------------------------------------------

def _classify_by_provenance(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    """
    High-confidence labels from adapter-supplied structural hints
    (html_tag, docx_style, block_type).
    """
    prov = block.source_provenance
    html_tag   = prov.get("html_tag", "")
    docx_style = prov.get("docx_style", "")
    block_type = prov.get("block_type", "")

    # Image placeholder produced by PDF adapter
    if block_type == "image" or block.text == "[IMAGE]":
        return ElementLabel.IMAGE, 0.95, ["adapter_image_block"]

    # HTML headings
    if html_tag == "h1": return ElementLabel.HEADING_1, 0.95, ["html_tag=h1"]
    if html_tag == "h2": return ElementLabel.HEADING_2, 0.95, ["html_tag=h2"]
    if html_tag == "h3": return ElementLabel.HEADING_3, 0.95, ["html_tag=h3"]
    if html_tag in ("h4", "h5", "h6"):
        return ElementLabel.HEADING_3, 0.85, [f"html_tag={html_tag}→heading_3"]

    # HTML list items
    if html_tag == "li":
        list_type = prov.get("list_type", "ul")
        depth     = prov.get("depth", 0)
        if list_type == "ol":
            lbl = ElementLabel.NUMBERED_LIST_NESTED if depth > 0 else ElementLabel.NUMBERED_LIST_SINGLE
        else:
            lbl = ElementLabel.BULLETED_LIST_NESTED if depth > 0 else ElementLabel.BULLETED_LIST_SINGLE
        return lbl, 0.90, [f"html_tag=li type={list_type} depth={depth}"]

    # HTML table rows
    if html_tag in ("table", "tr", "td", "th"):
        if html_tag == "table":
            return ElementLabel.TABLE, 0.92, ["html_tag=table"]
        if html_tag == "th" or prov.get("is_header_row"):
            return ElementLabel.TABLE_HEADER_ROW, 0.90, ["html th/is_header_row"]
        return ElementLabel.TABLE, 0.80, [f"html_tag={html_tag}"]

    if html_tag in ("blockquote", "pre", "code", "figure"):
        return ElementLabel.BLOCK_ELEMENT, 0.85, [f"html_tag={html_tag}"]
    if html_tag in ("footnote", "aside") or prov.get("is_footnote"):
        return ElementLabel.FOOTNOTE, 0.85, ["html semantic footnote"]

    # DOCX named styles
    dl = docx_style.lower()
    if "heading 1" in dl: return ElementLabel.HEADING_1, 0.95, [f"docx_style={docx_style}"]
    if "heading 2" in dl: return ElementLabel.HEADING_2, 0.95, [f"docx_style={docx_style}"]
    if "heading 3" in dl: return ElementLabel.HEADING_3, 0.95, [f"docx_style={docx_style}"]
    if "heading"   in dl: return ElementLabel.HEADING_3, 0.85, [f"docx_style={docx_style} generic"]
    if "caption"   in dl: return ElementLabel.TABLE_CAPTION, 0.88, [f"docx_style={docx_style}"]
    if "footnote"  in dl: return ElementLabel.FOOTNOTE, 0.92, [f"docx_style={docx_style}"]
    if "list" in dl or prov.get("numbering_id"):
        depth      = prov.get("numbering_depth", 0)
        num_format = prov.get("numbering_format", "bullet")
        if num_format in ("bullet", "none"):
            lbl = ElementLabel.BULLETED_LIST_NESTED if depth > 0 else ElementLabel.BULLETED_LIST_SINGLE
        else:
            lbl = ElementLabel.NUMBERED_LIST_NESTED if depth > 0 else ElementLabel.NUMBERED_LIST_SINGLE
        return lbl, 0.88, [f"docx_style={docx_style} depth={depth} fmt={num_format}"]

    # DOCX table / footnote block types
    if block_type == "table_row":
        if prov.get("is_header_row"):
            return ElementLabel.TABLE_HEADER_ROW, 0.88, ["docx table header row"]
        return ElementLabel.TABLE, 0.85, ["docx table row"]
    if block_type == "footnote":
        return ElementLabel.FOOTNOTE, 0.92, ["docx footnote block"]

    return None


def _classify_by_font_size(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    """
    Heading detection via font-size ratio relative to document median.
    Fires only for short, isolated blocks.
    """
    f       = block.features
    ratio   = f.get("font_size_ratio")
    is_short= f.get("is_short", True)
    all_bold= f.get("all_bold", False)

    if ratio is None or not is_short:
        return None

    if ratio >= 1.6:
        return ElementLabel.HEADING_1, 0.82, [f"font_size_ratio={ratio}>=1.6"]
    if ratio >= 1.3:
        conf = 0.78 if all_bold else 0.72
        return ElementLabel.HEADING_2, conf, [f"font_size_ratio={ratio}>=1.3", f"all_bold={all_bold}"]
    if ratio >= 1.12 and all_bold:
        return ElementLabel.HEADING_3, 0.70, [f"font_size_ratio={ratio}>=1.12", "all_bold"]

    return None


def _classify_list_by_text(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    f    = block.features
    text = block.text.strip()
    if not text:
        return None

    if f.get("starts_with_bullet"):
        depth = f.get("indentation_level", 0)
        lbl   = ElementLabel.BULLETED_LIST_NESTED if depth >= 2 else ElementLabel.BULLETED_LIST_SINGLE
        return lbl, 0.80, [f"starts_with_bullet depth={depth}"]

    if f.get("numbered_nested_match"):
        return ElementLabel.NUMBERED_LIST_NESTED, 0.75, ["numbered_nested_pattern"]

    if f.get("numbered_single_match"):
        return ElementLabel.NUMBERED_LIST_SINGLE, 0.75, ["numbered_single_pattern"]

    return None


def _classify_footnote(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    """
    PDF-only: small font near page bottom with a footnote-marker prefix.
    Requires 3 corroborating signals.
    """
    f        = block.features
    evidence: List[str] = []
    score    = 0

    ratio = f.get("font_size_ratio")
    if ratio is not None and ratio < 0.80:
        score += 1; evidence.append(f"font_size_ratio={ratio}<0.80")

    pos = f.get("page_position_ratio")
    if pos is not None and pos > 0.82:
        score += 1; evidence.append(f"page_position_ratio={pos}>0.82")

    if any(s.baseline_shift is not None and s.baseline_shift > 0 for s in block.spans):
        score += 1; evidence.append("has_superscript_span")

    if f.get("is_short"):
        score += 1; evidence.append("is_short_block")

    start = block.text.strip()[:3]
    if start and (start[0].isdigit() or start[0] in ("*", "†", "‡", "§")):
        score += 1; evidence.append("footnote_marker_prefix")

    if score >= 3:
        return ElementLabel.FOOTNOTE, min(0.55 + 0.05 * (score - 3), 0.65), evidence

    return None


def _classify_cross_reference(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    if block.features.get("has_cross_ref"):
        return ElementLabel.CROSS_REFERENCE, 0.82, ["cross_ref_pattern_matched"]
    return None


def _classify_math(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    if block.features.get("has_math"):
        return ElementLabel.MATH, 0.78, ["math_pattern_matched"]
    return None


def _classify_italic_emphasis(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    f = block.features
    italic_ratio = f.get("italic_ratio", 0.0)
    if italic_ratio >= 0.70 and f.get("is_short") and f.get("word_count", 0) >= 2:
        return ElementLabel.ITALIC_EMPHASIS_OR_TERM, 0.65, [
            f"italic_ratio={italic_ratio}>=0.70", "is_short"
        ]
    return None


def _classify_body_text(block: Block) -> Optional[Tuple[ElementLabel, float, List[str]]]:
    """
    FIX: Previously required word_count >= 8 — too strict.
    Now fires for any non-empty block. Confidence scales with word count.
    Short blocks get 0.55 (below LLM threshold so LLM can refine when enabled).
    Long blocks get 0.72 (above threshold, stays as body_text).
    """
    f     = block.features
    ratio = f.get("font_size_ratio")
    wc    = f.get("word_count", 0)

    if not block.text.strip() or wc == 0:
        return None

    # Reject if font size is clearly heading-level (already handled above, but guard)
    if ratio is not None and ratio >= 1.12:
        return None

    if wc >= 8:
        conf = 0.72
    elif wc >= 3:
        conf = 0.62
    else:
        conf = 0.52  # very short — leave for LLM or keep as body_text tentatively

    return ElementLabel.BODY_TEXT, conf, [f"word_count={wc}", f"font_size_ratio={ratio}"]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

HEURISTIC_CONFIDENCE_THRESHOLD = 0.75


def run_heuristics(doc: CanonicalDoc) -> List[ClassifiedBlock]:
    compute_doc_features(doc)
    results: List[ClassifiedBlock] = []

    for block in doc.blocks:
        label, confidence, evidence = _apply_rules(block)
        results.append(
            ClassifiedBlock(
                block_id=block.block_id,
                label=label,
                confidence=confidence,
                evidence=evidence,
                llm_used=False,
            )
        )

    return results


def _apply_rules(block: Block) -> Tuple[ElementLabel, float, List[str]]:
    if not block.text.strip():
        return ElementLabel.UNKNOWN, 1.0, ["empty_block"]

    for rule in (
        _classify_by_provenance,      # strongest: adapter-supplied hints
        _classify_cross_reference,    # specific regex pattern
        _classify_math,               # specific symbol pattern
        _classify_list_by_text,       # bullet / numbered prefix
        _classify_by_font_size,       # relative font size (PDF/DOCX)
        _classify_footnote,           # multi-signal footnote
        _classify_italic_emphasis,    # italic-dominant short block
        _classify_body_text,          # general fallback — now fires broadly
    ):
        result = rule(block)
        if result is not None:
            return result

    return ElementLabel.UNKNOWN, 0.40, ["no_rule_matched"]
