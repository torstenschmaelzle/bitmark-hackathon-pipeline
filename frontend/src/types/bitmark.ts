/**
 * Bitmark JSON types — matches the output of backend/app/pipeline/bitmark_export.py
 *
 * Top-level structure returned as job.bitmark:
 * {
 *   "bitmark": [ { "bit": {...}, "bitmark_extension": {...} }, ... ],
 *   "_meta":   { title, total_bits, type_counts, ... }
 * }
 */

/** bitmark++ body node (ProseMirror-like document node) */
export interface BodyNode {
  type: string;                                               // paragraph | text | bulletList | orderedList | listItem | image | heading
  text?: string;                                             // only on type="text"
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: BodyNode[];                                      // child nodes
  attrs?: Record<string, unknown>;                           // e.g. {level, src, alt}
}

/** The inner "bit" object — the core Bitmark content */
export interface BitmarkBitCore {
  type: string;          // "article" | "chapter"
  format: string;        // "bitmark++" | "text"
  item?: string;         // chapter: heading text
  level?: number;        // chapter: heading level (1|2|3)
  body?: BodyNode[];     // article: structured body node array
}

/** Pipeline provenance stored alongside the bit — NOT Bitmark core */
export interface BitmarkExtension {
  block_id: string;
  label: string;
  confidence: number;
  text: string;
  page?: number | null;
  bbox?: number[] | null;
  evidence: string[];
  annotations?: unknown[];
}

/** One entry in the bitmark array */
export interface BitmarkWrapper {
  bit: BitmarkBitCore;
  bitmark_extension?: BitmarkExtension;
}

/** Top-level artifact as stored in job.bitmark */
export interface BitmarkDoc {
  bitmark: BitmarkWrapper[];
  _meta: {
    generator: string;
    bitmark_compliance: string;
    mapping_version: string;
    title: string;
    doc_id: string;
    source_type: string;
    total_bits: number;
    type_counts: Record<string, number>;
    validation_warnings: string[];
  };
}
