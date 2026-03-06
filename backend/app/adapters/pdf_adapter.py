"""
Layer A — PDF Adapter (PyMuPDF)

FIX: was using rawdict which stores text in per-character 'chars' arrays,
not in a 'text' field on the span. Switched to 'dict' mode where every span
has a plain 'text' string. Bold/italic come from the flags bitmask; font name
is used as a secondary signal for PDFs that embed formatting only in the name.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..pipeline.canonical_model import Block, CanonicalDoc, SourceType, Span

logger = logging.getLogger(__name__)

# PyMuPDF span flag bits (same in dict and rawdict modes)
_FLAG_BOLD   = 1 << 4   # 16
_FLAG_ITALIC = 1 << 1   # 2


class PDFAdapter:
    """Ingest a PDF file and produce a CanonicalDoc."""

    def ingest(self, file_path: Path) -> CanonicalDoc:
        try:
            import fitz  # PyMuPDF
        except ImportError as e:
            raise RuntimeError("PyMuPDF not installed. Run: pip install PyMuPDF") from e

        doc_id = _file_hash(file_path)
        pdf = fitz.open(str(file_path))

        metadata: Dict[str, Any] = {
            "page_count": pdf.page_count,
            "pdf_metadata": dict(pdf.metadata) if pdf.metadata else {},
        }

        all_blocks: List[Block] = []
        total_text_spans = 0
        warnings: List[str] = []

        for page_num in range(pdf.page_count):
            page = pdf[page_num]
            page_rect = page.rect
            page_blocks, span_count = _extract_page_blocks(page, page_num + 1, page_rect)
            all_blocks.extend(page_blocks)
            total_text_spans += span_count

        pdf.close()

        # Extraction report — always present so the UI can show it
        if not all_blocks:
            warnings.append("no_text_extracted")
            warnings.append("pdf_may_be_scanned_or_text_is_not_extractable")

        metadata["extraction"] = {
            "pages_processed": metadata["page_count"],
            "text_blocks_found": len(all_blocks),
            "text_spans_found": total_text_spans,
            "warnings": warnings,
        }

        logger.info(
            "PDF extraction: %d pages, %d blocks, %d spans, warnings=%s",
            metadata["page_count"], len(all_blocks), total_text_spans, warnings,
        )

        return CanonicalDoc(
            doc_id=doc_id,
            source_type=SourceType.PDF,
            metadata=metadata,
            blocks=all_blocks,
        )


def _extract_page_blocks(page: Any, page_num: int, page_rect: Any) -> tuple[List[Block], int]:
    """
    Extract text blocks from one page using get_text("dict").

    In "dict" mode every span has a plain `text` string — unlike "rawdict"
    which only stores individual characters in a `chars` list.

    Returns (list_of_blocks, total_span_count).
    """
    # flags=0 keeps default text reconstruction (no extra whitespace munging)
    data = page.get_text("dict", flags=0)
    page_width = float(page_rect.width)
    page_height = float(page_rect.height)

    blocks: List[Block] = []
    total_spans = 0

    for raw_block in data.get("blocks", []):
        block_type = raw_block.get("type", 0)

        # ---- image block ----
        if block_type == 1:
            bbox = list(raw_block.get("bbox", [0.0, 0.0, 0.0, 0.0]))
            blocks.append(
                Block(
                    page=page_num,
                    bbox=bbox,
                    text="[IMAGE]",
                    spans=[Span(text="[IMAGE]")],
                    source_provenance={
                        "block_type": "image",
                        "page_width": page_width,
                        "page_height": page_height,
                    },
                )
            )
            continue

        if block_type != 0:
            continue  # skip non-text, non-image blocks

        # ---- text block ----
        all_spans: List[Span] = []
        block_bbox = list(raw_block.get("bbox", [0.0, 0.0, 0.0, 0.0]))

        for line in raw_block.get("lines", []):
            for span in line.get("spans", []):
                # In "dict" mode this field is always a string
                span_text: str = span.get("text", "")
                if not span_text:
                    continue

                flags: int = span.get("flags", 0)
                font_name: str = span.get("font", "") or ""
                font_size_raw = span.get("size")
                font_size: Optional[float] = float(font_size_raw) if font_size_raw else None

                # Bold / italic: flags bitmask is primary; font name is secondary fallback
                # (some PDFs encode bold/italic only in the name, flags=0)
                is_bold = bool(flags & _FLAG_BOLD) or _name_has(font_name, ("Bold", "Black", "Heavy", "Semibold", "Demi"))
                is_italic = bool(flags & _FLAG_ITALIC) or _name_has(font_name, ("Italic", "Oblique", "Slant"))

                color_int = span.get("color")
                color_hex = _color_to_hex(color_int) if isinstance(color_int, int) else None

                # Superscript: compare span origin-y to line bbox bottom
                origin = span.get("origin")
                line_bbox = line.get("bbox", [0, 0, 0, 0])
                baseline_shift: Optional[float] = None
                if origin and font_size:
                    origin_y = float(origin[1])
                    line_y1  = float(line_bbox[3])
                    rel = (line_y1 - origin_y) / font_size
                    if rel > 0.35:
                        baseline_shift = rel

                all_spans.append(
                    Span(
                        text=span_text,
                        bold=is_bold,
                        italic=is_italic,
                        font_name=font_name or None,
                        font_size=font_size,
                        color=color_hex,
                        baseline_shift=baseline_shift,
                    )
                )
                total_spans += 1

        if not all_spans:
            continue

        full_text = "".join(s.text for s in all_spans)
        if not full_text.strip():
            continue

        blocks.append(
            Block(
                page=page_num,
                bbox=block_bbox,
                text=full_text,
                spans=all_spans,
                source_provenance={
                    "block_type": "text",
                    "page_width": page_width,
                    "page_height": page_height,
                    "line_count": len(raw_block.get("lines", [])),
                },
            )
        )

    return blocks, total_spans


def _name_has(font_name: str, keywords: tuple[str, ...]) -> bool:
    """Case-insensitive check for any keyword in a font name."""
    lower = font_name.lower()
    return any(k.lower() in lower for k in keywords)


def _color_to_hex(color_int: int) -> str:
    r = (color_int >> 16) & 0xFF
    g = (color_int >> 8) & 0xFF
    b = color_int & 0xFF
    return f"#{r:02X}{g:02X}{b:02X}"


def _file_hash(path: Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]
