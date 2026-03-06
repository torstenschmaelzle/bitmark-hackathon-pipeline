/** Minimal Bitmark JSON structure as produced by the backend */

export interface BitmarkBit {
  type: string;
  block_id: string;
  label: string;
  confidence: number;
  // Type-specific fields
  level?: number;          // heading
  item?: string;           // heading, list, table
  body?: string;           // article
  list_id?: string;
  list_index?: number;
  table_id?: string;
  row_index?: number;
  is_header?: boolean;
  page?: number;
  bbox?: [number, number, number, number];
  // Unmapped content
  bitmark_extension?: {
    block_id: string;
    label: string;
    confidence: number;
    text: string;
    evidence: string[];
  };
}

export interface BitmarkBook {
  title: string;
  doc_id: string;
  source_type: string;
  metadata: Record<string, unknown>;
  bits: BitmarkBit[];
}

export interface BitmarkDoc {
  bitmark: {
    type: 'book';
    book: BitmarkBook;
  };
  _meta: {
    generator: string;
    bitmark_compliance: string;
    note: string;
    total_bits: number;
    mapped_bits: number;
    unmapped_bits: number;
  };
}
