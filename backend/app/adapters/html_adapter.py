"""
Layer A — HTML Adapter (BeautifulSoup4)

Why BeautifulSoup4 over lxml:
  - More forgiving on malformed HTML (common in pasted web content)
  - Simpler API for depth-aware DOM traversal
  - Good Unicode handling

Maps semantic HTML tags to block provenance hints consumed by heuristics.
Inline elements (em, strong, a, code) become Span annotations on parent blocks.
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..pipeline.canonical_model import Block, CanonicalDoc, SourceType, Span

logger = logging.getLogger(__name__)

# Tags that create new blocks
_BLOCK_TAGS = {
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "pre", "code", "figure", "figcaption",
    "aside", "section", "article", "header", "footer",
    "tr", "td", "th",
}

_HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

# Tags that carry inline formatting
_INLINE_FORMAT = {
    "strong": ("bold", True),
    "b": ("bold", True),
    "em": ("italic", True),
    "i": ("italic", True),
    "code": ("bold", False),  # treat inline code as bold visually
}


class HTMLAdapter:
    """Ingest an HTML file and produce a CanonicalDoc."""

    def ingest(self, file_path: Path) -> CanonicalDoc:
        try:
            from bs4 import BeautifulSoup  # type: ignore
        except ImportError as e:
            raise RuntimeError("beautifulsoup4 not installed. Run: pip install beautifulsoup4") from e

        content = file_path.read_text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(content, "html.parser")

        doc_id = hashlib.sha1(content.encode()).hexdigest()[:16]

        # Extract metadata from <head>
        metadata: Dict[str, Any] = {}
        title_tag = soup.find("title")
        if title_tag:
            metadata["title"] = title_tag.get_text(strip=True)
        for meta in soup.find_all("meta"):
            name = meta.get("name") or meta.get("property", "")
            content_val = meta.get("content", "")
            if name and content_val:
                metadata[f"meta_{name}"] = content_val

        # Find body or use whole document
        body = soup.find("body") or soup

        blocks: List[Block] = []
        _walk_element(body, blocks, depth=0, list_type="ul", list_depth=0)

        # Remove empty blocks
        blocks = [b for b in blocks if b.text.strip()]

        return CanonicalDoc(
            doc_id=doc_id,
            source_type=SourceType.HTML,
            metadata=metadata,
            blocks=blocks,
        )


def _walk_element(
    element: Any,
    blocks: List[Block],
    depth: int,
    list_type: str,
    list_depth: int,
) -> None:
    """
    Recursively walk the DOM tree.
    When a block-level tag is encountered, extract it as a Block.
    Otherwise recurse into children.
    """
    from bs4 import Tag, NavigableString  # type: ignore

    if not hasattr(element, "children"):
        return

    current_list_type = list_type
    current_list_depth = list_depth

    for child in element.children:
        if isinstance(child, NavigableString):
            # Loose text under body — wrap as paragraph if meaningful
            text = str(child).strip()
            if text and depth == 0:
                blocks.append(
                    Block(
                        text=text,
                        spans=[Span(text=text)],
                        source_provenance={"html_tag": "text_node"},
                    )
                )
            continue

        if not isinstance(child, Tag):
            continue

        tag_name = child.name.lower() if child.name else ""

        # List containers: track type and depth
        if tag_name == "ul":
            _walk_element(child, blocks, depth + 1, "ul", list_depth + 1)
            continue
        if tag_name == "ol":
            _walk_element(child, blocks, depth + 1, "ol", list_depth + 1)
            continue
        if tag_name == "table":
            _extract_table(child, blocks)
            continue

        if tag_name in _BLOCK_TAGS:
            block = _extract_block(child, tag_name, list_type, list_depth)
            if block:
                blocks.append(block)
            # Recurse for nested structures (e.g. div containing h2 + p)
            if tag_name in ("div", "section", "article", "header", "footer", "figure"):
                _walk_element(child, blocks, depth + 1, list_type, list_depth)
        else:
            _walk_element(child, blocks, depth + 1, list_type, list_depth)


def _extract_block(
    element: Any,
    tag_name: str,
    list_type: str,
    list_depth: int,
) -> Optional[Block]:
    """
    Extract a single block from a block-level HTML element.
    Collects inline spans with formatting from child elements.
    """
    spans, plain_text = _extract_spans(element)
    if not plain_text.strip():
        return None

    prov: Dict[str, Any] = {
        "html_tag": tag_name,
    }

    if tag_name == "li":
        prov["list_type"] = list_type
        prov["depth"] = max(0, list_depth - 1)  # list_depth counts the <ul>/<ol> wrapper

    if tag_name in ("td", "th"):
        prov["is_header_row"] = tag_name == "th"

    # Footnote: look for role="doc-footnote" or class containing "footnote"
    classes = " ".join(element.get("class", []))
    role = element.get("role", "")
    if "footnote" in classes.lower() or role in ("doc-footnote", "note"):
        prov["is_footnote"] = True

    return Block(
        text=plain_text.strip(),
        spans=spans,
        source_provenance=prov,
    )


def _extract_spans(element: Any) -> Tuple[List[Span], str]:
    """
    Walk inline content of a block element and build a list of Spans.
    Tracks bold, italic, href state through the subtree.
    """
    from bs4 import Tag, NavigableString  # type: ignore

    spans: List[Span] = []
    plain_parts: List[str] = []

    def _recurse(node: Any, bold: bool, italic: bool, href: Optional[str]) -> None:
        if isinstance(node, NavigableString):
            text = str(node)
            if text:
                spans.append(
                    Span(
                        text=text,
                        bold=bold,
                        italic=italic,
                        href=href,
                    )
                )
                plain_parts.append(text)
            return

        if not isinstance(node, Tag):
            return

        tag = node.name.lower() if node.name else ""

        # Update formatting state
        new_bold = bold or tag in ("strong", "b")
        new_italic = italic or tag in ("em", "i")
        new_href = href or (node.get("href") if tag == "a" else None)

        # Skip script/style
        if tag in ("script", "style", "noscript"):
            return

        for child in node.children:
            _recurse(child, new_bold, new_italic, new_href)

    _recurse(element, False, False, None)

    # Merge adjacent spans with identical formatting
    merged: List[Span] = []
    for span in spans:
        if (
            merged
            and merged[-1].bold == span.bold
            and merged[-1].italic == span.italic
            and merged[-1].href == span.href
        ):
            merged[-1] = merged[-1].model_copy(
                update={"text": merged[-1].text + span.text}
            )
        else:
            merged.append(span)

    return merged, "".join(plain_parts)


def _extract_table(table_element: Any, blocks: List[Block]) -> None:
    """
    Extract all rows from an HTML table as individual TABLE blocks.
    Header rows (<thead> or <th> cells) get is_header_row=True.
    """
    from bs4 import Tag  # type: ignore

    in_thead = False

    for section in table_element.children:
        if not isinstance(section, Tag):
            continue
        section_tag = section.name.lower() if section.name else ""
        if section_tag == "thead":
            in_thead = True
        elif section_tag in ("tbody", "tfoot"):
            in_thead = False

        if section_tag in ("thead", "tbody", "tfoot"):
            rows = section.find_all("tr", recursive=False)
        elif section_tag == "tr":
            rows = [section]
        else:
            continue

        for row in rows:
            cells = row.find_all(["td", "th"])
            cell_texts = [c.get_text(separator=" ", strip=True) for c in cells]
            row_text = " | ".join(cell_texts)
            if not row_text.strip():
                continue

            has_th = any(c.name == "th" for c in cells)
            is_header = in_thead or has_th

            spans = [Span(text=t, bold=is_header) for t in cell_texts if t]
            blocks.append(
                Block(
                    text=row_text,
                    spans=spans,
                    source_provenance={
                        "html_tag": "tr",
                        "is_header_row": is_header,
                        "cell_count": len(cell_texts),
                    },
                )
            )
