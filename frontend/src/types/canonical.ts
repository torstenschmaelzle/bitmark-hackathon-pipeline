/** Mirror of backend/app/pipeline/canonical_model.py */

export type SourceType = 'pdf' | 'html' | 'docx';

export interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  font_name?: string | null;
  font_size?: number | null;
  color?: string | null;
  href?: string | null;
  baseline_shift?: number | null;
}

export interface Block {
  block_id: string;
  page?: number | null;
  bbox?: [number, number, number, number] | null;
  text: string;
  spans: Span[];
  source_provenance: Record<string, unknown>;
  features: Record<string, unknown>;
  relationships: Record<string, unknown>;
}

export interface CanonicalDoc {
  doc_id: string;
  source_type: SourceType;
  metadata: Record<string, unknown>;
  blocks: Block[];
}
