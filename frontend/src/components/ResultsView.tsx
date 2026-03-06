/**
 * ResultsView
 *
 * Shows the full pipeline output for a completed job.
 * Offers two display modes:
 *   - Document: continuous colored reading-order flow via DocumentView
 *   - Cards: existing BlockCard list (debug / detail view)
 */

import React, { useMemo, useState } from 'react';
import type { JobStatus } from '../api/client';
import { getDownloadUrl } from '../api/client';
import { BlockCard } from './BlockCard';
import { DocumentView } from './DocumentView';
import type { ElementLabel } from '../types/classification';
import { LABEL_COLORS } from '../types/classification';
import type { Block } from '../types/canonical';

interface Props {
  job: JobStatus;
  onEditBitmark: (jobId: string) => void;
}

type RawView  = 'none' | 'canonical' | 'classification' | 'bitmark';
type ViewMode = 'document' | 'cards';

export function ResultsView({ job, onEditBitmark }: Props) {
  const [rawView,  setRawView]  = useState<RawView>('none');
  const [viewMode, setViewMode] = useState<ViewMode>('document');

  const canonical      = job.canonical!;
  const classification = job.classification!;

  const cbById = useMemo(() => {
    const map: Record<string, { label: string; confidence: number; evidence: string[]; llm_used: boolean; notes?: string | null }> = {};
    for (const cb of (classification.blocks ?? [])) {
      map[cb.block_id] = cb;
    }
    return map;
  }, [classification]);

  const labelCounts = useMemo(() => {
    const counts: Partial<Record<ElementLabel, number>> = {};
    for (const cb of (classification.blocks ?? [])) {
      const lbl = cb.label as ElementLabel;
      counts[lbl] = (counts[lbl] ?? 0) + 1;
    }
    return counts;
  }, [classification]);

  const sortedLabels = (
    Object.entries(labelCounts) as [ElementLabel, number][]
  ).sort(([, a], [, b]) => b - a);

  const totalBlocks = canonical.blocks?.length ?? 0;
  const llmCount    = (classification.blocks ?? []).filter((b) => b.llm_used).length;

  const extraction = canonical.metadata?.extraction as {
    pages_processed?: number;
    text_blocks_found?: number;
    text_spans_found?: number;
    warnings?: string[];
  } | undefined;
  const warnings         = extraction?.warnings ?? [];
  const isScannedOrEmpty = warnings.some(
    (w) => w === 'no_text_extracted' || w.includes('scanned'),
  );

  const totalBits = (job.bitmark as any)?._meta?.total_bits ?? 0;

  return (
    <div style={styles.container}>

      {/* Extraction warning banner */}
      {warnings.length > 0 && (
        <div style={isScannedOrEmpty ? styles.warnBannerError : styles.warnBanner}>
          <strong>Extraction warning</strong>
          {warnings.map((w, i) => (
            <span key={i} style={styles.warnChip}>{w}</span>
          ))}
          {isScannedOrEmpty && (
            <p style={styles.warnHint}>
              No text was extracted. The PDF may be scanned (image-only).
              Try OCR pre-processing before re-uploading.
            </p>
          )}
          {extraction && (
            <p style={styles.warnHint}>
              Pages: {extraction.pages_processed} &nbsp;|&nbsp;
              Blocks: {extraction.text_blocks_found} &nbsp;|&nbsp;
              Spans: {extraction.text_spans_found}
            </p>
          )}
        </div>
      )}

      {/* ── Summary ── */}
      <div style={styles.summarySection}>
        <div style={styles.summaryTop}>
          <div>
            <h2 style={styles.sectionTitle}>
              {canonical.metadata?.original_filename as string ?? 'Document'}
            </h2>
            <div style={styles.metaRow}>
              <span style={styles.metaBadge}>{totalBlocks} blocks</span>
              <span style={styles.metaBadge}>source: {canonical.source_type?.toUpperCase()}</span>
              {totalBits > 0 && (
                <span style={{ ...styles.metaBadge, background: '#e0f7fa', color: '#006064' }}>
                  {totalBits} Bitmark bits
                </span>
              )}
              {llmCount > 0 && (
                <span style={{ ...styles.metaBadge, background: '#fff3e0', color: '#e65100' }}>
                  LLM: {llmCount} blocks
                </span>
              )}
            </div>
          </div>

          {/* ── Edit Bitmark CTA ── */}
          <button
            style={styles.editBitmarkBtn}
            onClick={() => onEditBitmark(job.job_id)}
          >
            <span style={styles.editBitmarkIcon}>✏️</span>
            Edit Bitmark
          </button>
        </div>

        <div style={styles.labelSummary}>
          {sortedLabels.map(([label, count]) => {
            const colors = LABEL_COLORS[label] ?? { bg: '#eee', text: '#333' };
            return (
              <span key={label} style={{ ...styles.summaryChip, background: colors.bg, color: colors.text }}>
                {label} ({count})
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Controls row ── */}
      <div style={styles.controlsRow}>

        {/* View mode toggle */}
        <div style={styles.modeToggle}>
          <span style={styles.rowLabel}>View:</span>
          {(['document', 'cards'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                ...styles.modeBtn,
                background: viewMode === mode ? '#1a237e' : '#e8eaf6',
                color:      viewMode === mode ? '#fff'    : '#1a237e',
                fontWeight: viewMode === mode ? 700       : 500,
              }}
            >
              {mode === 'document' ? '📄 Document' : '🗂 Cards'}
            </button>
          ))}
        </div>

        {/* Download buttons */}
        <div style={styles.downloadRow}>
          <span style={styles.rowLabel}>Download:</span>
          {(['canonical', 'classification', 'bitmark'] as const).map((artifact) => (
            <a key={artifact} href={getDownloadUrl(job.job_id, artifact)} download style={styles.downloadBtn}>
              {artifact}.json
            </a>
          ))}
        </div>

        {/* Raw JSON toggles */}
        <div style={styles.toggleRow}>
          <span style={styles.rowLabel}>Raw JSON:</span>
          {(['canonical', 'classification', 'bitmark'] as RawView[]).map((view) => (
            <button
              key={view}
              onClick={() => setRawView(rawView === view ? 'none' : view)}
              style={{
                ...styles.toggleBtn,
                background: rawView === view ? '#1565c0' : '#e8eaf6',
                color:      rawView === view ? '#fff'    : '#1a237e',
              }}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Raw JSON pane */}
      {rawView !== 'none' && (
        <pre style={styles.rawJson}>
          {JSON.stringify(
            rawView === 'canonical'      ? job.canonical :
            rawView === 'classification' ? job.classification :
            job.bitmark,
            null, 2,
          )}
        </pre>
      )}

      {/* ── Main content area ── */}
      <div style={styles.contentArea}>

        {totalBlocks === 0 && (
          <p style={styles.emptyNote}>No blocks were extracted. See the warning above.</p>
        )}

        {totalBlocks > 0 && viewMode === 'document' && (
          <DocumentView canonical={canonical} classification={classification} />
        )}

        {totalBlocks > 0 && viewMode === 'cards' && (
          <>
            <h3 style={styles.sectionTitle2}>
              Blocks in reading order ({totalBlocks})
            </h3>
            {(canonical.blocks ?? []).map((block: Block) => {
              const cb = cbById[block.block_id];
              if (!cb) return null;
              return (
                <BlockCard
                  key={block.block_id}
                  block={block}
                  classified={cb as any}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 16px 48px',
  },
  warnBanner: {
    background: '#fff8e1',
    border: '1px solid #ffe082',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 12,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  warnBannerError: {
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 12,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  warnChip: {
    fontSize: 11,
    background: '#ff8f00',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 10,
    fontFamily: 'monospace',
  },
  warnHint: {
    width: '100%',
    fontSize: 12,
    color: '#555',
    marginTop: 4,
  },
  summarySection: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  summaryTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: '#1a237e',
    marginBottom: 8,
    margin: 0,
  },
  sectionTitle2: {
    fontSize: 14,
    fontWeight: 700,
    color: '#333',
    marginBottom: 8,
  },
  metaRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  metaBadge: {
    fontSize: 12,
    background: '#e8eaf6',
    color: '#3949ab',
    padding: '3px 10px',
    borderRadius: 12,
  },
  labelSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
  },
  summaryChip: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 12,
    fontWeight: 600,
  },
  editBitmarkBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    background: 'linear-gradient(135deg, #3949ab 0%, #1a237e 100%)',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    boxShadow: '0 2px 10px rgba(57,73,171,0.35)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  editBitmarkIcon: {
    fontSize: 16,
  },
  controlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '10px 14px',
  },
  modeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  downloadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rowLabel: {
    fontSize: 12,
    color: '#555',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  modeBtn: {
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  downloadBtn: {
    fontSize: 12,
    background: '#1565c0',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: 5,
    textDecoration: 'none',
    fontWeight: 600,
  },
  toggleBtn: {
    fontSize: 12,
    padding: '5px 10px',
    borderRadius: 5,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  },
  rawJson: {
    background: '#1e1e1e',
    color: '#d4d4d4',
    fontSize: 12,
    padding: 16,
    borderRadius: 8,
    overflow: 'auto',
    maxHeight: 480,
    marginBottom: 12,
    fontFamily: "'Fira Mono', 'Consolas', monospace",
    lineHeight: 1.5,
  },
  contentArea: {
    marginTop: 4,
  },
  emptyNote: {
    color: '#c62828',
    background: '#ffebee',
    padding: '12px 16px',
    borderRadius: 8,
    fontSize: 14,
  },
};
