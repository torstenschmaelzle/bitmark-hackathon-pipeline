/**
 * EditBitmarkPage
 *
 * Two-column layout:
 *  Left  — style controls per Bitmark type
 *  Right — live preview using those styles
 *
 * Storage: localStorage key "bitmark_style_overrides_v1"
 * Data:    GET /api/job/{jobId}  +  GET /api/bitmark/mapping
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getJobStatus } from '../api/client';
import type { JobStatus } from '../api/client';
import type { BitmarkBit } from '../types/bitmark';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BitmarkStyle {
  fontSize: number;
  fontWeight: number;
  textColor: string;
  backgroundColor: string | null;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
  fontFamily: string;
}

type StyleMap = Record<string, BitmarkStyle>;

const STORAGE_KEY = 'bitmark_style_overrides_v1';

const FONT_FAMILIES = ['system-ui', 'Inter', 'Georgia', 'serif', 'monospace'];
const FONT_WEIGHTS  = [300, 400, 500, 600, 700, 800];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: StyleMap = {
  article:     { fontSize: 14, fontWeight: 400, textColor: '#212121', backgroundColor: null, lineHeight: 1.65, marginTop: 0,  marginBottom: 10, fontFamily: 'system-ui' },
  chapter:     { fontSize: 26, fontWeight: 700, textColor: '#1a237e', backgroundColor: null, lineHeight: 1.25, marginTop: 24, marginBottom: 8,  fontFamily: 'system-ui' },
  'cloze-list':{ fontSize: 14, fontWeight: 400, textColor: '#212121', backgroundColor: null, lineHeight: 1.55, marginTop: 2,  marginBottom: 2,  fontFamily: 'system-ui' },
  table:       { fontSize: 13, fontWeight: 400, textColor: '#212121', backgroundColor: '#f5f5f5', lineHeight: 1.4, marginTop: 0, marginBottom: 0, fontFamily: 'system-ui' },
  image:       { fontSize: 12, fontWeight: 400, textColor: '#546e7a', backgroundColor: '#f5f5f5', lineHeight: 1.4, marginTop: 8, marginBottom: 8, fontFamily: 'system-ui' },
};

function defaultFor(type: string): BitmarkStyle {
  return DEFAULTS[type] ?? DEFAULTS['article'];
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadOverrides(): StyleMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOverrides(overrides: StyleMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function mergedStyle(type: string, overrides: StyleMap): BitmarkStyle {
  return { ...defaultFor(type), ...(overrides[type] ?? {}) };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  jobId: string;
  onBack: () => void;
}

export function EditBitmarkPage({ jobId, onBack }: Props) {
  const [job,        setJob]        = useState<JobStatus | null>(null);
  const [loadError,  setLoadError]  = useState<string | null>(null);
  const [overrides,  setOverrides]  = useState<StyleMap>(() => loadOverrides());
  const [activeType, setActiveType] = useState<string>('article');
  const [saved,      setSaved]      = useState(false);

  // Fetch job data
  useEffect(() => {
    if (!jobId) { setLoadError('No job ID provided.'); return; }
    getJobStatus(jobId)
      .then(setJob)
      .catch(err => setLoadError(String(err)));
  }, [jobId]);

  // All unique bitmark types present in bits
  const bitmarkTypes = useMemo(() => {
    const bits: BitmarkBit[] = job?.bitmark?.bitmark?.book?.bits ?? [];
    const types = new Set<string>(bits.map(b => b.type));
    Object.keys(DEFAULTS).forEach(t => types.add(t));
    return Array.from(types).sort();
  }, [job]);

  // Ensure activeType is valid
  useEffect(() => {
    if (bitmarkTypes.length > 0 && !bitmarkTypes.includes(activeType)) {
      setActiveType(bitmarkTypes[0]);
    }
  }, [bitmarkTypes]);

  // Current style being edited
  const current = mergedStyle(activeType, overrides);

  function setField<K extends keyof BitmarkStyle>(field: K, value: BitmarkStyle[K]) {
    setOverrides(prev => ({
      ...prev,
      [activeType]: { ...mergedStyle(activeType, prev), [field]: value },
    }));
  }

  function handleSave() {
    saveOverrides(overrides);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setOverrides({});
    localStorage.removeItem(STORAGE_KEY);
  }

  function hasOverride(type: string): boolean {
    return type in overrides && Object.keys(overrides[type]).length > 0;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div style={pg.page}>
        <div style={pg.errBox}>
          <strong>Could not load job</strong><br />
          {loadError}<br />
          Job ID: <code>{jobId}</code>
        </div>
        <button style={pg.backBtn} onClick={onBack}>← Back</button>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={pg.page}>
        <div style={pg.loading}>Loading job data…</div>
      </div>
    );
  }

  const bits: BitmarkBit[] = job.bitmark?.bitmark?.book?.bits ?? [];
  const docTitle = (job.bitmark?.bitmark?.book?.title as string) ||
                   (job.canonical?.metadata?.original_filename as string) ||
                   'Document';

  return (
    <div style={pg.page}>

      {/* ── Page header ── */}
      <div style={pg.pageHeader}>
        <div style={pg.headerLeft}>
          <button style={pg.backBtn} onClick={onBack}>← Back</button>
          <div>
            <h1 style={pg.pageTitle}>Edit Bitmark</h1>
            <p style={pg.pageSubtitle}>{docTitle} &nbsp;·&nbsp; job <code style={pg.code}>{jobId}</code></p>
          </div>
        </div>
        <div style={pg.headerActions}>
          <button style={pg.resetBtn} onClick={handleReset}>Reset all</button>
          <button
            style={saved ? { ...pg.saveBtn, background: '#2e7d32' } : pg.saveBtn}
            onClick={handleSave}
          >
            {saved ? 'Saved!' : 'Save styles'}
          </button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div style={pg.columns}>

        {/* ── LEFT: Controls ── */}
        <div style={pg.leftCol}>

          {/* Type picker */}
          <div style={pg.panel}>
            <p style={pg.panelTitle}>Bitmark type</p>
            <select
              style={pg.select}
              value={activeType}
              onChange={e => setActiveType(e.target.value)}
            >
              {bitmarkTypes.map(t => (
                <option key={t} value={t}>
                  {t}{hasOverride(t) ? ' *' : ''}
                </option>
              ))}
            </select>
            {hasOverride(activeType) && (
              <button
                style={pg.clearTypeBtn}
                onClick={() => {
                  const next = { ...overrides };
                  delete next[activeType];
                  setOverrides(next);
                }}
              >
                Clear overrides for "{activeType}"
              </button>
            )}
          </div>

          {/* Style controls */}
          <div style={pg.panel}>
            <p style={pg.panelTitle}>Style — <span style={{ color: '#3949ab' }}>{activeType}</span></p>

            {/* Font size slider */}
            <SliderRow
              label="Font size"
              value={current.fontSize}
              min={10} max={48} unit="px"
              onChange={v => setField('fontSize', v)}
            />

            {/* Font weight */}
            <ControlRow label="Font weight">
              <select
                style={pg.select}
                value={current.fontWeight}
                onChange={e => setField('fontWeight', Number(e.target.value))}
              >
                {FONT_WEIGHTS.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </ControlRow>

            {/* Font family */}
            <ControlRow label="Font family">
              <select
                style={pg.select}
                value={current.fontFamily}
                onChange={e => setField('fontFamily', e.target.value)}
              >
                {FONT_FAMILIES.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </ControlRow>

            {/* Text color */}
            <ControlRow label="Text color">
              <div style={pg.colorRow}>
                <input type="color" value={current.textColor} style={pg.colorPicker}
                  onChange={e => setField('textColor', e.target.value)} />
                <input type="text" value={current.textColor} style={pg.colorText}
                  onChange={e => setField('textColor', e.target.value)} />
              </div>
            </ControlRow>

            {/* Background color */}
            <ControlRow label="Background color">
              <div style={pg.colorRow}>
                <input
                  type="checkbox"
                  checked={current.backgroundColor !== null}
                  onChange={e => setField('backgroundColor', e.target.checked ? '#ffffff' : null)}
                  style={{ marginRight: 6 }}
                />
                {current.backgroundColor !== null && (
                  <>
                    <input type="color" value={current.backgroundColor ?? '#ffffff'} style={pg.colorPicker}
                      onChange={e => setField('backgroundColor', e.target.value)} />
                    <input type="text"  value={current.backgroundColor ?? ''} style={pg.colorText}
                      onChange={e => setField('backgroundColor', e.target.value)} />
                  </>
                )}
                {current.backgroundColor === null && (
                  <span style={{ fontSize: 12, color: '#888' }}>none</span>
                )}
              </div>
            </ControlRow>

            {/* Line height */}
            <SliderRow
              label="Line height"
              value={current.lineHeight}
              min={1} max={3} step={0.05} unit="×"
              onChange={v => setField('lineHeight', v)}
            />

            {/* Spacing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <NumberRow label="Margin top (px)" value={current.marginTop}
                onChange={v => setField('marginTop', v)} />
              <NumberRow label="Margin bottom (px)" value={current.marginBottom}
                onChange={v => setField('marginBottom', v)} />
            </div>
          </div>

          {/* Quick-edit table */}
          <div style={pg.panel}>
            <p style={pg.panelTitle}>All types — quick overview</p>
            <table style={pg.table}>
              <thead>
                <tr>
                  <th style={pg.th}>Type</th>
                  <th style={pg.th}>Size</th>
                  <th style={pg.th}>Color</th>
                  <th style={pg.th}></th>
                </tr>
              </thead>
              <tbody>
                {bitmarkTypes.map(t => {
                  const s = mergedStyle(t, overrides);
                  const isActive = t === activeType;
                  return (
                    <tr
                      key={t}
                      style={{ background: isActive ? '#e8eaf6' : 'transparent', cursor: 'pointer' }}
                      onClick={() => setActiveType(t)}
                    >
                      <td style={pg.td}>
                        <span style={{ fontWeight: isActive ? 700 : 400 }}>{t}</span>
                        {hasOverride(t) && <span style={pg.ovdDot}>●</span>}
                      </td>
                      <td style={pg.td}>{s.fontSize}px</td>
                      <td style={pg.td}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: s.textColor, verticalAlign: 'middle', border: '1px solid #ccc', marginRight: 4 }} />
                        {s.textColor}
                      </td>
                      <td style={pg.td}>
                        <button style={pg.editSmallBtn} onClick={e => { e.stopPropagation(); setActiveType(t); }}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT: Preview ── */}
        <div style={pg.rightCol}>
          <div style={pg.previewHeader}>
            <span style={pg.previewLabel}>Live preview</span>
            <span style={pg.previewCount}>{bits.length} bits</span>
          </div>
          <div style={pg.previewBody}>
            {bits.length === 0 ? (
              <p style={{ color: '#888', fontSize: 14 }}>No bits to preview.</p>
            ) : (
              <BitmarkPreview bits={bits} overrides={overrides} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview renderer
// ---------------------------------------------------------------------------

function BitmarkPreview({ bits, overrides }: { bits: BitmarkBit[]; overrides: StyleMap }) {
  // Group consecutive list items
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < bits.length) {
    const bit = bits[i];
    const style = mergedStyle(bit.type, overrides);
    const css = bitStyle(style);

    if (bit.type === 'cloze-list') {
      // Collect a run of list items
      const run: BitmarkBit[] = [];
      let isOrdered = !!bit.ordered;
      while (i < bits.length && bits[i].type === 'cloze-list') {
        isOrdered = !!bits[i].ordered;
        run.push(bits[i++]);
      }
      const Tag = isOrdered ? 'ol' : 'ul';
      elements.push(
        <Tag key={`list-${i}`} style={{ ...css, paddingLeft: 24, margin: `${style.marginTop}px 0 ${style.marginBottom}px` }}>
          {run.map((item, j) => (
            <li key={j} style={{ marginBottom: 2 }}>
              {item.item ?? item.body ?? ''}
            </li>
          ))}
        </Tag>
      );
      continue;
    }

    if (bit.type === 'table') {
      // Collect table rows
      const rows: BitmarkBit[] = [];
      while (i < bits.length && bits[i].type === 'table') {
        rows.push(bits[i++]);
      }
      const tableStyle = mergedStyle('table', overrides);
      const tableCss = bitStyle(tableStyle);
      elements.push(
        <div key={`table-${i}`} style={{ overflowX: 'auto', marginTop: tableStyle.marginTop, marginBottom: tableStyle.marginBottom }}>
          <table style={{ ...tableCss, width: '100%', borderCollapse: 'collapse', margin: 0 }}>
            <tbody>
              {rows.map((row, j) => {
                const cells = (row.item ?? row.body ?? '').split('\t');
                const Cell = row.is_header ? 'th' : 'td';
                return (
                  <tr key={j} style={{ background: row.is_header ? (tableStyle.backgroundColor ?? '#f0f0f0') : 'transparent' }}>
                    {cells.map((cell, k) => (
                      <Cell key={k} style={{ border: '1px solid #e0e0e0', padding: '5px 10px', textAlign: 'left', fontWeight: row.is_header ? 700 : 400 }}>
                        {cell}
                      </Cell>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (bit.type === 'chapter') {
      const level = bit.level ?? 1;
      const scaledSize = level === 1 ? style.fontSize : level === 2 ? Math.round(style.fontSize * 0.78) : Math.round(style.fontSize * 0.63);
      elements.push(
        <div key={`${bit.block_id}-${i}`} style={{ ...css, fontSize: scaledSize }}>
          {bit.item ?? bit.body ?? ''}
        </div>
      );
      i++;
      continue;
    }

    if (bit.type === 'image') {
      elements.push(
        <div key={`${bit.block_id}-${i}`} style={{ ...css, fontStyle: 'italic', borderLeft: '3px solid #e0e0e0', paddingLeft: 10 }}>
          [Image: {bit.alt ?? bit.item ?? bit.body ?? 'figure'}]
        </div>
      );
      i++;
      continue;
    }

    // Default: article (body text)
    const text = bit.body ?? bit.item ?? '';
    if (text.trim()) {
      elements.push(
        <div key={`${bit.block_id}-${i}`} style={css}>
          <RichText text={text} />
        </div>
      );
    }
    i++;
  }

  return <>{elements}</>;
}

/** Convert BitmarkStyle to inline CSS object */
function bitStyle(s: BitmarkStyle): React.CSSProperties {
  return {
    fontSize:        s.fontSize,
    fontWeight:      s.fontWeight,
    color:           s.textColor,
    backgroundColor: s.backgroundColor ?? undefined,
    lineHeight:      s.lineHeight,
    marginTop:       s.marginTop,
    marginBottom:    s.marginBottom,
    fontFamily:      s.fontFamily,
  };
}

/** Render markdown-lite bold/italic from bitmark body strings */
function RichText({ text }: { text: string }) {
  // Simple regex split for **bold** and _italic_
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('_') && part.endsWith('_')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Small control components
// ---------------------------------------------------------------------------

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={ctrl.row}>
      <label style={ctrl.label}>{label}</label>
      <div style={ctrl.input}>{children}</div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={ctrl.row}>
      <label style={ctrl.label}>{label}</label>
      <div style={{ ...ctrl.input, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          style={{ flex: 1 }}
          onChange={e => onChange(parseFloat(e.target.value))}
        />
        <span style={ctrl.val}>{value.toFixed(step < 1 ? 2 : 0)}{unit}</span>
      </div>
    </div>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label style={{ ...ctrl.label, display: 'block', marginBottom: 3 }}>{label}</label>
      <input
        type="number" value={value} style={{ ...pg.select, width: '100%' }}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}

const ctrl: Record<string, React.CSSProperties> = {
  row:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: 600, color: '#555', minWidth: 120, flexShrink: 0 },
  input: { flex: 1, minWidth: 0 },
  val:   { fontSize: 12, color: '#333', minWidth: 40, textAlign: 'right' },
};

// ---------------------------------------------------------------------------
// Page styles
// ---------------------------------------------------------------------------

const pg: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '16px 16px 64px',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    padding: '12px 16px',
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #e0e0e0',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  pageTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: '#1a237e',
  },
  pageSubtitle: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#666',
  },
  headerActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  backBtn: {
    background: 'none',
    border: '1px solid #9fa8da',
    color: '#3949ab',
    padding: '7px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  saveBtn: {
    background: '#3949ab',
    color: '#fff',
    border: 'none',
    padding: '8px 20px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
  resetBtn: {
    background: 'none',
    border: '1px solid #bdbdbd',
    color: '#555',
    padding: '8px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  columns: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
  },
  leftCol: {
    width: 380,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    position: 'sticky',
    top: 16,
    maxHeight: 'calc(100vh - 100px)',
    display: 'flex',
    flexDirection: 'column',
  },
  previewHeader: {
    padding: '10px 16px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#fafafa',
    flexShrink: 0,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  previewCount: {
    fontSize: 12,
    color: '#888',
    background: '#e8eaf6',
    padding: '2px 8px',
    borderRadius: 8,
  },
  previewBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
  },
  panel: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    padding: '14px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#888',
    margin: '0 0 12px',
  },
  select: {
    width: '100%',
    fontSize: 13,
    padding: '6px 8px',
    border: '1px solid #ccc',
    borderRadius: 5,
    background: '#fff',
  },
  clearTypeBtn: {
    marginTop: 8,
    width: '100%',
    background: 'none',
    border: '1px solid #ef9a9a',
    color: '#c62828',
    padding: '5px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 11,
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  colorPicker: {
    width: 32,
    height: 28,
    border: '1px solid #ccc',
    borderRadius: 4,
    padding: 1,
    cursor: 'pointer',
    flexShrink: 0,
  },
  colorText: {
    flex: 1,
    fontSize: 12,
    padding: '4px 6px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    textAlign: 'left',
    padding: '5px 8px',
    borderBottom: '2px solid #e0e0e0',
    fontWeight: 700,
    color: '#555',
    fontSize: 11,
  },
  td: {
    padding: '5px 8px',
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'middle',
  },
  ovdDot: {
    color: '#3949ab',
    fontSize: 8,
    marginLeft: 4,
    verticalAlign: 'middle',
  },
  editSmallBtn: {
    background: '#e8eaf6',
    border: 'none',
    color: '#3949ab',
    padding: '3px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
  },
  code: {
    fontFamily: 'monospace',
    background: '#e8eaf6',
    padding: '1px 4px',
    borderRadius: 3,
    fontSize: 11,
  },
  loading: {
    padding: 48,
    textAlign: 'center',
    color: '#888',
    fontSize: 14,
  },
  errBox: {
    padding: 20,
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 8,
    color: '#c62828',
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 16,
  },
};
