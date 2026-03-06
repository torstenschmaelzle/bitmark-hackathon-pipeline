/**
 * DocumentView
 *
 * Continuous reading-order document rendering with:
 * - Per-label background fill + left border
 * - Inline annotation highlighting for cross-references (even inside list items)
 * - Style overrides read from localStorage (set via BitmarkSettingsPage)
 * - Segment-based text renderer that merges span formatting + annotation ranges
 */

import React, { useMemo } from 'react';
import type { Block, Span } from '../types/canonical';
import type { CanonicalDoc } from '../types/canonical';
import type { ClassificationDoc, ClassifiedBlock, ElementLabel, SpanAnnotation } from '../types/classification';
import {
  LABEL_BG, LABEL_BORDER, LABEL_COLORS,
  loadStyleSettings, overrideToCss,
} from '../types/classification';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface MergedBlock { block: Block; cb: ClassifiedBlock }

type RenderItem =
  | { kind: 'single'; m: MergedBlock }
  | { kind: 'list';   items: MergedBlock[]; isNumbered: boolean }
  | { kind: 'table';  rows: MergedBlock[]; caption?: MergedBlock };

interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
  href?: string | null;
  annotation?: SpanAnnotation;
}

// ---------------------------------------------------------------------------
// Label sets
// ---------------------------------------------------------------------------

const BULLETED = new Set<ElementLabel>(['bulleted_list_single', 'bulleted_list_nested']);
const NUMBERED = new Set<ElementLabel>(['numbered_list_single', 'numbered_list_nested']);
const LIST_SET = new Set<ElementLabel>([...BULLETED, ...NUMBERED]);
const TABLE_SET = new Set<ElementLabel>(['table', 'table_header_row']);

// ---------------------------------------------------------------------------
// Segment builder — merges span formatting + annotation ranges
// ---------------------------------------------------------------------------

function buildSegments(block: Block, annotations: SpanAnnotation[]): Segment[] {
  const text = block.text;
  if (!text) return [];

  // Collect all boundary positions from spans and annotations
  const breaks = new Set<number>([0, text.length]);
  let pos = 0;
  for (const span of block.spans ?? []) {
    breaks.add(pos);
    pos += span.text.length;
    breaks.add(pos);
  }
  for (const ann of annotations ?? []) {
    if (ann.start >= 0 && ann.end <= text.length && ann.start < ann.end) {
      breaks.add(ann.start);
      breaks.add(ann.end);
    }
  }

  // Build char-level formatting arrays from spans
  const boldAt    = new Uint8Array(text.length);
  const italicAt  = new Uint8Array(text.length);
  const hrefAt: (string | null)[] = new Array(text.length).fill(null);
  pos = 0;
  for (const span of block.spans ?? []) {
    const end = Math.min(pos + span.text.length, text.length);
    for (let i = pos; i < end; i++) {
      if (span.bold)  boldAt[i]   = 1;
      if (span.italic) italicAt[i] = 1;
      if (span.href)  hrefAt[i]   = span.href;
    }
    pos += span.text.length;
  }

  const sortedBreaks = [...breaks].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < sortedBreaks.length - 1; i++) {
    const start = sortedBreaks[i];
    const end   = Math.min(sortedBreaks[i + 1], text.length);
    if (start >= end) continue;

    const ann = (annotations ?? []).find(a => a.start <= start && a.end >= end);
    segments.push({
      text: text.slice(start, end),
      bold:  boldAt[start]  === 1,
      italic: italicAt[start] === 1,
      href:  hrefAt[start],
      annotation: ann,
    });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Segment renderer
// ---------------------------------------------------------------------------

function SegmentView({ seg, idx }: { seg: Segment; idx: number }) {
  let node: React.ReactNode = seg.text;

  if (seg.bold && seg.italic) node = <strong><em>{node}</em></strong>;
  else if (seg.bold)          node = <strong>{node}</strong>;
  else if (seg.italic)        node = <em style={{ textDecoration: 'underline dotted' }}>{node}</em>;

  if (seg.href) {
    node = <a href={seg.href} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>{node}</a>;
  }

  if (seg.annotation) {
    const ann = seg.annotation;
    const title = `${ann.target_kind}: ${ann.normalized_target} (${Math.round(ann.confidence * 100)}%)`;
    node = (
      <mark
        title={title}
        style={{
          background: '#FFF176',
          borderBottom: '2px solid #F57F17',
          borderRadius: 2,
          padding: '0 1px',
          cursor: 'help',
          fontStyle: 'inherit',
        }}
      >
        {node}
      </mark>
    );
  }

  return <span key={idx}>{node}</span>;
}

function renderContent(block: Block, annotations: SpanAnnotation[]): React.ReactNode {
  const segs = buildSegments(block, annotations);
  if (segs.length === 0) return block.text;
  return segs.map((seg, i) => <SegmentView key={i} seg={seg} idx={i} />);
}

// ---------------------------------------------------------------------------
// Annotation chips (shown when annotations are present on a list item)
// ---------------------------------------------------------------------------

function AnnotationChips({ annotations }: { annotations: SpanAnnotation[] }) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
      {annotations.map((ann, i) => (
        <span
          key={i}
          title={`${ann.target_kind} · confidence ${Math.round(ann.confidence * 100)}%`}
          style={{
            fontSize: 9,
            background: '#FFF9C4',
            border: '1px solid #F57F17',
            borderRadius: 3,
            padding: '1px 5px',
            cursor: 'help',
            fontFamily: 'monospace',
            color: '#E65100',
          }}
        >
          🔗 {ann.normalized_target}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block wrapper
// ---------------------------------------------------------------------------

function LabelPill({ label, confidence }: { label: ElementLabel; confidence: number }) {
  const color = LABEL_COLORS[label];
  return (
    <span style={{
      position: 'absolute', top: 3, right: 5,
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      background: color?.bg ?? '#eee', color: color?.text ?? '#333',
      padding: '1px 5px', borderRadius: 3, opacity: 0.75, pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {label} {Math.round(confidence * 100)}%
    </span>
  );
}

function blockBaseStyle(label: ElementLabel): React.CSSProperties {
  return {
    background:   LABEL_BG[label]    ?? '#fafafa',
    borderLeft:   `4px solid ${LABEL_BORDER[label] ?? '#ccc'}`,
    borderRadius: 3,
    padding:      '4px 10px',
    marginBottom: 2,
    position:     'relative',
  };
}

function BlockWrap({
  m, children, extraStyle,
}: { m: MergedBlock; children: React.ReactNode; extraStyle?: React.CSSProperties }) {
  const { block, cb } = m;
  const styleSettings = loadStyleSettings();
  const override = overrideToCss(styleSettings[cb.label] ?? {});
  const title = `${cb.label} (${Math.round(cb.confidence * 100)}%)\n${cb.evidence.join(' · ')}`;
  return (
    <div style={{ ...blockBaseStyle(cb.label), ...override }} title={title}>
      <LabelPill label={cb.label} confidence={cb.confidence} />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single block renderers
// ---------------------------------------------------------------------------

function renderSingle(m: MergedBlock): React.ReactNode {
  const { block, cb } = m;
  const anns = cb.annotations ?? [];
  const content = renderContent(block, anns);
  const styleSettings = loadStyleSettings();
  const override = overrideToCss(styleSettings[cb.label] ?? {});

  switch (cb.label) {
    case 'heading_1':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <h1 style={{ fontSize: '1.9em', fontWeight: 800, margin: '10px 0 4px', lineHeight: 1.25, paddingRight: 80, ...override }}>
            {content}
          </h1>
        </BlockWrap>
      );
    case 'heading_2':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <h2 style={{ fontSize: '1.45em', fontWeight: 700, margin: '8px 0 3px', lineHeight: 1.3, paddingRight: 80, ...override }}>
            {content}
          </h2>
        </BlockWrap>
      );
    case 'heading_3':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <h3 style={{ fontSize: '1.15em', fontWeight: 600, margin: '6px 0 2px', lineHeight: 1.4, paddingRight: 80, ...override }}>
            {content}
          </h3>
        </BlockWrap>
      );
    case 'footnote':
      return (
        <BlockWrap key={block.block_id} m={m} extraStyle={{ marginLeft: 24 }}>
          <p style={{ fontSize: '0.8em', margin: '2px 0', color: '#555', lineHeight: 1.5, paddingRight: 80, ...override }}>
            {content}
          </p>
          <AnnotationChips annotations={anns} />
        </BlockWrap>
      );
    case 'math':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <pre style={{ fontFamily: "'Fira Mono','Consolas',monospace", fontSize: '0.9em', margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6, paddingRight: 80, ...override }}>
            {block.text}
          </pre>
        </BlockWrap>
      );
    case 'image':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <div style={{ border: '1px dashed #90A4AE', borderRadius: 4, padding: 20, textAlign: 'center', color: '#546e7a', fontSize: '0.9em', margin: '4px 0' }}>
            <div style={{ fontSize: '2em', marginBottom: 4 }}>🖼</div>
            <div>[Image block]</div>
            {block.page != null && <div style={{ fontSize: '0.8em', marginTop: 2 }}>Page {block.page}</div>}
            {block.bbox && <div style={{ fontSize: '0.75em', color: '#90A4AE', marginTop: 2 }}>bbox: [{block.bbox.map(v => Math.round(v)).join(', ')}]</div>}
          </div>
        </BlockWrap>
      );
    case 'block_element':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <blockquote style={{ margin: '4px 0', paddingLeft: 12, borderLeft: 'none', fontStyle: 'italic', lineHeight: 1.6, paddingRight: 80, ...override }}>
            {content}
          </blockquote>
          <AnnotationChips annotations={anns} />
        </BlockWrap>
      );
    case 'table_caption':
      return (
        <BlockWrap key={block.block_id} m={m}>
          <p style={{ margin: '3px 0', fontStyle: 'italic', fontWeight: 600, fontSize: '0.9em', paddingRight: 80, ...override }}>
            {content}
          </p>
        </BlockWrap>
      );
    default:
      return (
        <BlockWrap key={block.block_id} m={m}>
          <p style={{ margin: '3px 0', lineHeight: 1.7, paddingRight: 80, ...override }}>
            {content}
          </p>
          <AnnotationChips annotations={anns} />
        </BlockWrap>
      );
  }
}

// ---------------------------------------------------------------------------
// List group renderer
// ---------------------------------------------------------------------------

function renderListGroup(group: Extract<RenderItem, { kind: 'list' }>, idx: number): React.ReactNode {
  const { items, isNumbered } = group;
  const Tag = isNumbered ? 'ol' : 'ul';
  return (
    <div key={`list-${idx}`} style={{ marginBottom: 2 }}>
      <Tag style={{ margin: '4px 0', paddingLeft: 0, listStyle: 'none' }}>
        {items.map((m) => {
          const isNested = m.cb.label === 'bulleted_list_nested' || m.cb.label === 'numbered_list_nested';
          const anns = m.cb.annotations ?? [];
          const content = renderContent(m.block, anns);
          const title = `${m.cb.label} (${Math.round(m.cb.confidence * 100)}%)\n${m.cb.evidence.join(' · ')}`;
          return (
            <li key={m.block.block_id} title={title} style={{
              background: LABEL_BG[m.cb.label] ?? '#fafafa',
              borderLeft: `4px solid ${LABEL_BORDER[m.cb.label] ?? '#ccc'}`,
              borderRadius: 3,
              padding: '3px 10px 3px 28px',
              marginBottom: 2,
              marginLeft: isNested ? 24 : 0,
              position: 'relative',
              lineHeight: 1.6,
              listStyle: isNumbered ? 'decimal' : 'disc',
              listStylePosition: 'inside',
            }}>
              <span style={{ position: 'absolute', top: 3, right: 5, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', opacity: 0.6, color: LABEL_COLORS[m.cb.label]?.text ?? '#333' }}>
                {m.cb.label}
              </span>
              {content}
              <AnnotationChips annotations={anns} />
            </li>
          );
        })}
      </Tag>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table group renderer
// ---------------------------------------------------------------------------

function renderTableGroup(group: Extract<RenderItem, { kind: 'table' }>, idx: number): React.ReactNode {
  const { rows, caption } = group;
  const parsed = rows.map(m => ({ m, cells: m.block.text.split(' | '), hasCells: m.block.text.includes(' | ') }));
  const hasStructure = parsed.some(r => r.hasCells);

  return (
    <div key={`table-${idx}`} style={{ marginBottom: 4 }}>
      {caption && (
        <div style={{ background: LABEL_BG['table_caption'], borderLeft: `4px solid ${LABEL_BORDER['table_caption']}`, borderRadius: '3px 3px 0 0', padding: '4px 10px', fontSize: '0.88em', fontStyle: 'italic', fontWeight: 600 }}>
          {renderContent(caption.block, caption.cb.annotations ?? [])}
        </div>
      )}
      {hasStructure ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <tbody>
            {parsed.map(({ m, cells }) => {
              const isHeader = m.cb.label === 'table_header_row';
              const CellTag = isHeader ? 'th' : 'td';
              return (
                <tr key={m.block.block_id} style={{ background: LABEL_BG[m.cb.label] ?? '#E0F7FA' }} title={`${m.cb.label} (${Math.round(m.cb.confidence * 100)}%)`}>
                  {cells.map((cell, ci) => (
                    <CellTag key={ci} style={{ border: `1px solid ${LABEL_BORDER[m.cb.label] ?? '#ccc'}`, padding: '5px 8px', textAlign: 'left', fontWeight: isHeader ? 700 : 400 }}>
                      {cell.trim()}
                    </CellTag>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{ background: LABEL_BG['table'], borderLeft: `4px solid ${LABEL_BORDER['table']}`, borderRadius: 3, padding: '8px 10px', fontSize: '0.85em' }}>
          <div style={{ fontSize: '0.8em', color: '#546e7a', marginBottom: 4, fontStyle: 'italic' }}>table — cell structure not available</div>
          {rows.map(m => <pre key={m.block.block_id} style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, lineHeight: 1.5 }}>{m.block.text}</pre>)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupItems(merged: MergedBlock[]): RenderItem[] {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < merged.length) {
    const label = merged[i].cb.label;
    if (LIST_SET.has(label)) {
      const isNumbered = NUMBERED.has(label);
      const listItems: MergedBlock[] = [];
      while (i < merged.length && LIST_SET.has(merged[i].cb.label) && NUMBERED.has(merged[i].cb.label) === isNumbered) {
        listItems.push(merged[i++]);
      }
      items.push({ kind: 'list', items: listItems, isNumbered });
    } else if (TABLE_SET.has(label)) {
      const rows: MergedBlock[] = [];
      while (i < merged.length && TABLE_SET.has(merged[i].cb.label)) rows.push(merged[i++]);
      let caption: MergedBlock | undefined;
      if (items.length > 0) {
        const prev = items[items.length - 1];
        if (prev.kind === 'single' && prev.m.cb.label === 'table_caption') {
          caption = prev.m;
          items.pop();
        }
      }
      items.push({ kind: 'table', rows, caption });
    } else {
      items.push({ kind: 'single', m: merged[i++] });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const ALL_LABELS: ElementLabel[] = [
  'heading_1','heading_2','heading_3','body_text',
  'bulleted_list_single','bulleted_list_nested','numbered_list_single','numbered_list_nested',
  'table','table_header_row','table_caption','block_element',
  'footnote','math','image','cross_reference','italic_emphasis_or_term','character_formatting','unknown',
];

function Legend() {
  return (
    <div style={{ marginBottom: 12, background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Legend &nbsp;
        <span style={{ fontWeight: 400, fontSize: 10 }}>hover any block to see label + evidence · <mark style={{ background: '#FFF176', border: '1px solid #F57F17', borderRadius: 2, padding: '0 3px' }}>yellow highlight</mark> = cross-reference</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {ALL_LABELS.map(label => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, padding: '2px 7px', borderRadius: 4, background: LABEL_BG[label], borderLeft: `3px solid ${LABEL_BORDER[label]}`, color: LABEL_COLORS[label]?.text ?? '#333', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  canonical: CanonicalDoc;
  classification: ClassificationDoc;
}

export function DocumentView({ canonical, classification }: Props) {
  const merged = useMemo<MergedBlock[]>(() => {
    const cbMap: Record<string, ClassifiedBlock> = {};
    for (const cb of classification.blocks ?? []) cbMap[cb.block_id] = cb;
    const result: MergedBlock[] = [];
    for (const block of canonical.blocks ?? []) {
      const cb = cbMap[block.block_id];
      if (cb) result.push({ block, cb });
    }
    return result;
  }, [canonical, classification]);

  const renderItems = useMemo(() => groupItems(merged), [merged]);

  if (renderItems.length === 0) {
    return <p style={{ color: '#c62828', background: '#ffebee', padding: '12px 16px', borderRadius: 8 }}>No blocks to display.</p>;
  }

  return (
    <div>
      <Legend />
      <div style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 15, lineHeight: 1.7, color: '#212121', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {renderItems.map((item, idx) => {
          if (item.kind === 'single') return renderSingle(item.m);
          if (item.kind === 'list')   return renderListGroup(item, idx);
          if (item.kind === 'table')  return renderTableGroup(item, idx);
          return null;
        })}
      </div>
    </div>
  );
}
