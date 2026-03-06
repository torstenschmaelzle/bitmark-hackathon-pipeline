/** Mirror of classification models in canonical_model.py */

export type ElementLabel =
  | 'body_text'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'numbered_list_single'
  | 'numbered_list_nested'
  | 'bulleted_list_single'
  | 'bulleted_list_nested'
  | 'block_element'
  | 'table'
  | 'table_header_row'
  | 'table_caption'
  | 'footnote'
  | 'math'
  | 'image'
  | 'character_formatting'
  | 'italic_emphasis_or_term'
  | 'cross_reference'
  | 'unknown';

/** Inline semantic annotation anchored to a char range within block.text */
export interface SpanAnnotation {
  type: 'cross_reference';
  target_kind: 'table' | 'figure' | 'chapter' | 'section' | 'equation' | 'appendix' | 'bibliography' | 'other';
  raw_text: string;
  normalized_target: string;
  confidence: number;
  start: number;  // inclusive char offset in block.text
  end: number;    // exclusive char offset in block.text
}

export interface ClassifiedBlock {
  block_id: string;
  label: ElementLabel;
  confidence: number;
  evidence: string[];
  llm_used: boolean;
  notes?: string | null;
  annotations?: SpanAnnotation[];  // inline cross-reference annotations
}

export interface ClassificationDoc {
  doc_id: string;
  blocks: ClassifiedBlock[];
}

// ---------------------------------------------------------------------------
// Single source of truth: background fill colors per label (document view)
// ---------------------------------------------------------------------------
export const LABEL_BG: Record<ElementLabel, string> = {
  body_text:               '#E8F5E9',
  heading_1:               '#FFF3E0',
  heading_2:               '#FFE0B2',
  heading_3:               '#FFCCBC',
  numbered_list_single:    '#E3F2FD',
  numbered_list_nested:    '#BBDEFB',
  bulleted_list_single:    '#EDE7F6',
  bulleted_list_nested:    '#D1C4E9',
  block_element:           '#F3E5F5',
  table:                   '#E0F7FA',
  table_header_row:        '#B2EBF2',
  table_caption:           '#FFF9C4',
  footnote:                '#ECEFF1',
  math:                    '#FCE4EC',
  image:                   '#E1F5FE',
  character_formatting:    '#F1F8E9',
  italic_emphasis_or_term: '#DCEDC8',
  cross_reference:         '#D7CCC8',
  unknown:                 '#F5F5F5',
};

export const LABEL_BORDER: Record<ElementLabel, string> = {
  body_text:               '#81C784',
  heading_1:               '#FFB74D',
  heading_2:               '#FFA726',
  heading_3:               '#FF8A65',
  numbered_list_single:    '#64B5F6',
  numbered_list_nested:    '#42A5F5',
  bulleted_list_single:    '#9575CD',
  bulleted_list_nested:    '#7E57C2',
  block_element:           '#CE93D8',
  table:                   '#4DD0E1',
  table_header_row:        '#26C6DA',
  table_caption:           '#F9A825',
  footnote:                '#90A4AE',
  math:                    '#F48FB1',
  image:                   '#4FC3F7',
  character_formatting:    '#AED581',
  italic_emphasis_or_term: '#9CCC65',
  cross_reference:         '#A1887F',
  unknown:                 '#BDBDBD',
};

export const LABEL_COLORS: Record<ElementLabel, { bg: string; text: string }> = {
  body_text:               { bg: LABEL_BG.body_text,               text: '#1b5e20' },
  heading_1:               { bg: LABEL_BG.heading_1,               text: '#e65100' },
  heading_2:               { bg: LABEL_BG.heading_2,               text: '#bf360c' },
  heading_3:               { bg: LABEL_BG.heading_3,               text: '#bf360c' },
  numbered_list_single:    { bg: LABEL_BG.numbered_list_single,    text: '#0d47a1' },
  numbered_list_nested:    { bg: LABEL_BG.numbered_list_nested,    text: '#0d47a1' },
  bulleted_list_single:    { bg: LABEL_BG.bulleted_list_single,    text: '#4a148c' },
  bulleted_list_nested:    { bg: LABEL_BG.bulleted_list_nested,    text: '#4a148c' },
  block_element:           { bg: LABEL_BG.block_element,           text: '#6a1b9a' },
  table:                   { bg: LABEL_BG.table,                   text: '#006064' },
  table_header_row:        { bg: LABEL_BG.table_header_row,        text: '#006064' },
  table_caption:           { bg: LABEL_BG.table_caption,           text: '#827717' },
  footnote:                { bg: LABEL_BG.footnote,                text: '#546e7a' },
  math:                    { bg: LABEL_BG.math,                    text: '#880e4f' },
  image:                   { bg: LABEL_BG.image,                   text: '#01579b' },
  character_formatting:    { bg: LABEL_BG.character_formatting,    text: '#33691e' },
  italic_emphasis_or_term: { bg: LABEL_BG.italic_emphasis_or_term, text: '#33691e' },
  cross_reference:         { bg: LABEL_BG.cross_reference,         text: '#4e342e' },
  unknown:                 { bg: LABEL_BG.unknown,                 text: '#616161' },
};

// ---------------------------------------------------------------------------
// localStorage style settings helpers
// ---------------------------------------------------------------------------

export const STYLE_STORAGE_KEY = 'bitmark-style-settings';

export type LabelStyleOverride = {
  fontSize?: number;
  fontWeight?: number | string;
  textColor?: string;
  backgroundColor?: string;
  lineHeight?: number;
  marginTop?: number;
  marginBottom?: number;
};

export type StyleSettings = Partial<Record<ElementLabel, LabelStyleOverride>>;

export function loadStyleSettings(): StyleSettings {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStyleSettings(settings: StyleSettings): void {
  localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(settings));
}

export function clearStyleSettings(): void {
  localStorage.removeItem(STYLE_STORAGE_KEY);
}

/** Convert a LabelStyleOverride to React CSSProperties */
export function overrideToCss(o: LabelStyleOverride): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (o.fontSize)       css.fontSize       = `${o.fontSize}px`;
  if (o.fontWeight)     css.fontWeight     = o.fontWeight;
  if (o.textColor)      css.color          = o.textColor;
  if (o.backgroundColor) css.backgroundColor = o.backgroundColor;
  if (o.lineHeight)     css.lineHeight     = o.lineHeight;
  if (o.marginTop    != null) css.marginTop    = `${o.marginTop}px`;
  if (o.marginBottom != null) css.marginBottom = `${o.marginBottom}px`;
  return css;
}

// Need React for the CSSProperties type
import type React from 'react';
