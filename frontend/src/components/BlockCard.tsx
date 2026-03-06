/**
 * BlockCard
 *
 * Renders a single classified block with:
 *  - Label badge (color-coded)
 *  - Confidence bar
 *  - Evidence chips
 *  - Inline span rendering (bold, italic, links)
 *  - LLM indicator
 */

import React, { useState } from 'react';
import type { Block } from '../types/canonical';
import type { ClassifiedBlock } from '../types/classification';
import { LABEL_COLORS } from '../types/classification';
import type { Span } from '../types/canonical';

interface Props {
  block: Block;
  classified: ClassifiedBlock;
}

export function BlockCard({ block, classified }: Props) {
  const [showEvidence, setShowEvidence] = useState(false);
  const colors = LABEL_COLORS[classified.label] ?? { bg: '#eee', text: '#333' };
  const confidence = Math.round(classified.confidence * 100);

  return (
    <div style={styles.card}>
      {/* Header row */}
      <div style={styles.header}>
        <span
          style={{
            ...styles.labelBadge,
            background: colors.bg,
            color: colors.text,
          }}
        >
          {classified.label}
        </span>

        {classified.llm_used && (
          <span style={styles.llmBadge} title="LLM was used for this classification">
            LLM
          </span>
        )}

        {block.page != null && (
          <span style={styles.pageBadge}>p.{block.page}</span>
        )}

        <div style={styles.confidenceWrapper} title={`Confidence: ${confidence}%`}>
          <div
            style={{
              ...styles.confidenceBar,
              width: `${confidence}%`,
              background: confidence >= 75 ? '#4caf50' : confidence >= 50 ? '#ff9800' : '#f44336',
            }}
          />
          <span style={styles.confidenceText}>{confidence}%</span>
        </div>

        <button
          style={styles.evidenceToggle}
          onClick={() => setShowEvidence((v) => !v)}
          title="Toggle evidence"
        >
          {showEvidence ? '▲' : '▼'} evidence
        </button>
      </div>

      {/* Evidence */}
      {showEvidence && (
        <div style={styles.evidenceBox}>
          {classified.evidence.length === 0 ? (
            <em style={{ color: '#999' }}>no evidence</em>
          ) : (
            classified.evidence.map((e, i) => (
              <span key={i} style={styles.evidenceChip}>
                {e}
              </span>
            ))
          )}
          {classified.notes && (
            <p style={styles.notes}>{classified.notes}</p>
          )}
        </div>
      )}

      {/* Block content with span rendering */}
      <div style={styles.content}>
        {block.spans.length > 0 ? (
          block.spans.map((span, i) => <SpanView key={i} span={span} />)
        ) : (
          <span>{block.text}</span>
        )}
      </div>
    </div>
  );
}

function SpanView({ span }: { span: Span }) {
  let node: React.ReactNode = span.text;

  if (span.italic && span.bold) {
    node = <strong><em>{node}</em></strong>;
  } else if (span.bold) {
    node = <strong>{node}</strong>;
  } else if (span.italic) {
    node = <em>{node}</em>;
  }

  if (span.baseline_shift && span.baseline_shift > 0) {
    node = <sup style={{ fontSize: '0.7em' }}>{node}</sup>;
  } else if (span.baseline_shift && span.baseline_shift < 0) {
    node = <sub style={{ fontSize: '0.7em' }}>{node}</sub>;
  }

  if (span.href) {
    node = (
      <a href={span.href} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>
        {node}
      </a>
    );
  }

  const spanStyle: React.CSSProperties = {};
  if (span.color && span.color !== '#000000' && span.color !== '#000') {
    spanStyle.color = span.color;
  }
  if (span.font_size) {
    // Scale relative to 12pt baseline for visual hint only
    const relSize = Math.max(0.7, Math.min(2.0, span.font_size / 12));
    if (relSize < 0.9 || relSize > 1.1) {
      spanStyle.fontSize = `${relSize}em`;
    }
  }

  return <span style={spanStyle}>{node}</span>;
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  labelBadge: {
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  llmBadge: {
    fontSize: 10,
    fontWeight: 700,
    background: '#ff6f00',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: '0.05em',
  },
  pageBadge: {
    fontSize: 11,
    color: '#888',
    background: '#f5f5f5',
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
  confidenceWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 80,
    maxWidth: 160,
  },
  confidenceBar: {
    height: 6,
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  confidenceText: {
    fontSize: 11,
    color: '#666',
    whiteSpace: 'nowrap',
  },
  evidenceToggle: {
    fontSize: 11,
    color: '#1565c0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  evidenceBox: {
    background: '#f9f9f9',
    border: '1px solid #e8e8e8',
    borderRadius: 4,
    padding: '8px 10px',
    marginBottom: 8,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  evidenceChip: {
    fontSize: 11,
    background: '#e8eaf6',
    color: '#3949ab',
    padding: '2px 7px',
    borderRadius: 12,
    whiteSpace: 'nowrap',
  },
  notes: {
    fontSize: 11,
    color: '#888',
    width: '100%',
    marginTop: 4,
    fontStyle: 'italic',
  },
  content: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#212121',
    wordBreak: 'break-word',
  },
};
