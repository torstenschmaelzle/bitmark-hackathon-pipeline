/**
 * Bitmark Settings Page
 *
 * - Fetches label→Bitmark type mapping from GET /api/bitmark/mapping
 * - Renders a form with per-label style overrides (7 fields each)
 * - Persists to localStorage via saveStyleSettings()
 * - Applied live in DocumentView via loadStyleSettings()
 */

import React, { useEffect, useState } from 'react';
import type { ElementLabel, LabelStyleOverride, StyleSettings } from '../types/classification';
import {
  LABEL_COLORS,
  loadStyleSettings,
  saveStyleSettings,
  clearStyleSettings,
} from '../types/classification';

interface MappingEntry {
  bitmark_type: string;
  description: string;
  level?: number;
  ordered?: boolean;
  nested?: boolean;
  extension_note?: string;
}

interface BitmarkMapping {
  mapping: Record<string, MappingEntry>;
  version: string;
  label_count: number;
}

const FIELD_LABELS: Record<keyof LabelStyleOverride, string> = {
  fontSize: 'Font Size (px)',
  fontWeight: 'Font Weight',
  textColor: 'Text Color',
  backgroundColor: 'Background Color',
  lineHeight: 'Line Height',
  marginTop: 'Margin Top (px)',
  marginBottom: 'Margin Bottom (px)',
};

const FIELD_TYPES: Record<keyof LabelStyleOverride, 'number' | 'text' | 'color'> = {
  fontSize: 'number',
  fontWeight: 'number',
  textColor: 'color',
  backgroundColor: 'color',
  lineHeight: 'number',
  marginTop: 'number',
  marginBottom: 'number',
};

const FIELD_PLACEHOLDERS: Record<keyof LabelStyleOverride, string> = {
  fontSize: 'e.g. 14',
  fontWeight: 'e.g. 400, 700',
  textColor: '',
  backgroundColor: '',
  lineHeight: 'e.g. 1.5',
  marginTop: 'e.g. 0',
  marginBottom: 'e.g. 8',
};

export function BitmarkSettingsPage() {
  const [mappingData, setMappingData] = useState<BitmarkMapping | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<StyleSettings>(() => loadStyleSettings());
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bitmark/mapping')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: BitmarkMapping) => setMappingData(data))
      .catch(err => setLoadError(String(err)));
  }, []);

  function getOverride(label: string): LabelStyleOverride {
    return settings[label as ElementLabel] ?? {};
  }

  function setField(label: string, field: keyof LabelStyleOverride, raw: string) {
    const prev = getOverride(label);
    let updated: LabelStyleOverride;
    if (raw === '' || raw === null) {
      // Remove the field
      const { [field]: _removed, ...rest } = prev as Record<string, unknown>;
      updated = rest as LabelStyleOverride;
    } else if (FIELD_TYPES[field] === 'number') {
      const n = parseFloat(raw);
      updated = isNaN(n) ? prev : { ...prev, [field]: n };
    } else {
      updated = { ...prev, [field]: raw };
    }
    setSettings(prev => ({ ...prev, [label]: updated }));
  }

  function handleSave() {
    saveStyleSettings(settings);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  }

  function handleReset() {
    clearStyleSettings();
    setSettings({});
  }

  function hasOverrides(label: string): boolean {
    const o = getOverride(label);
    return Object.keys(o).length > 0;
  }

  if (loadError) {
    return (
      <div style={styles.page}>
        <div style={styles.error}>
          Failed to load Bitmark mapping: {loadError}
          <br />
          Make sure the backend is running at <code>http://localhost:8000</code>.
        </div>
      </div>
    );
  }

  if (!mappingData) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>Loading Bitmark type mapping...</div>
      </div>
    );
  }

  const labels = Object.keys(mappingData.mapping) as ElementLabel[];

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Bitmark Settings</h1>
          <p style={styles.subtitle}>
            Customize how each label renders in the Document view.
            Settings are stored in your browser and applied immediately.
          </p>
        </div>
        <div style={styles.actionGroup}>
          <button style={styles.resetBtn} onClick={handleReset}>
            Reset all
          </button>
          <button
            style={savedFeedback ? { ...styles.saveBtn, ...styles.saveBtnSuccess } : styles.saveBtn}
            onClick={handleSave}
          >
            {savedFeedback ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      <div style={styles.metaBar}>
        <span style={styles.metaText}>
          Mapping version: <code style={styles.code}>{mappingData.version}</code>
          &nbsp;&middot;&nbsp;{mappingData.label_count} labels
        </span>
      </div>

      <div style={styles.cardGrid}>
        {labels.map(label => {
          const entry = mappingData.mapping[label];
          const colors = LABEL_COLORS[label as ElementLabel];
          const isExpanded = expandedLabel === label;
          const hasOvr = hasOverrides(label);

          return (
            <div key={label} style={{ ...styles.card, borderColor: hasOvr ? '#3949ab' : '#e0e0e0' }}>
              {/* Card header */}
              <div
                style={{
                  ...styles.cardHeader,
                  backgroundColor: colors?.bg ?? '#f5f5f5',
                  borderBottom: `2px solid ${hasOvr ? '#3949ab' : '#e0e0e0'}`,
                }}
                onClick={() => setExpandedLabel(isExpanded ? null : label)}
              >
                <div style={styles.cardHeaderLeft}>
                  <span style={{ ...styles.labelBadge, color: colors?.text ?? '#333' }}>
                    {label}
                  </span>
                  <span style={styles.bitmarkType}>{entry.bitmark_type}</span>
                </div>
                <div style={styles.cardHeaderRight}>
                  {hasOvr && <span style={styles.ovdBadge}>overridden</span>}
                  <span style={styles.chevron}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Description */}
              <div style={styles.descRow}>{entry.description}</div>
              {entry.extension_note && (
                <div style={styles.noteRow}>{entry.extension_note}</div>
              )}

              {/* Expanded override fields */}
              {isExpanded && (
                <div style={styles.fieldsGrid}>
                  {(Object.keys(FIELD_LABELS) as (keyof LabelStyleOverride)[]).map(field => {
                    const override = getOverride(label);
                    const val = override[field];
                    const inputType = FIELD_TYPES[field];

                    return (
                      <div key={field} style={styles.fieldRow}>
                        <label style={styles.fieldLabel}>{FIELD_LABELS[field]}</label>
                        {inputType === 'color' ? (
                          <div style={styles.colorInputWrap}>
                            <input
                              type="color"
                              value={typeof val === 'string' && val ? val : (field === 'textColor' ? (colors?.text ?? '#333333') : (colors?.bg ?? '#ffffff'))}
                              onChange={e => setField(label, field, e.target.value)}
                              style={styles.colorInput}
                            />
                            <input
                              type="text"
                              value={typeof val === 'string' ? val : ''}
                              placeholder={field === 'textColor' ? colors?.text ?? '' : colors?.bg ?? ''}
                              onChange={e => setField(label, field, e.target.value)}
                              style={styles.colorText}
                            />
                            {val !== undefined && (
                              <button
                                style={styles.clearBtn}
                                onClick={() => setField(label, field, '')}
                                title="Clear override"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={styles.numInputWrap}>
                            <input
                              type="number"
                              value={typeof val === 'number' ? val : ''}
                              placeholder={FIELD_PLACEHOLDERS[field]}
                              onChange={e => setField(label, field, e.target.value)}
                              style={styles.numInput}
                            />
                            {val !== undefined && (
                              <button
                                style={styles.clearBtn}
                                onClick={() => setField(label, field, '')}
                                title="Clear override"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {hasOvr && (
                    <button
                      style={styles.clearLabelBtn}
                      onClick={() => {
                        const next = { ...settings };
                        delete next[label as ElementLabel];
                        setSettings(next);
                      }}
                    >
                      Clear all overrides for this label
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.bottomBar}>
        <button style={styles.resetBtn} onClick={handleReset}>Reset all</button>
        <button
          style={savedFeedback ? { ...styles.saveBtn, ...styles.saveBtnSuccess } : styles.saveBtn}
          onClick={handleSave}
        >
          {savedFeedback ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '24px 24px 64px',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: '#1a237e',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: '#555',
    maxWidth: 560,
  },
  actionGroup: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
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
    transition: 'background 0.2s',
  },
  saveBtnSuccess: {
    background: '#2e7d32',
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
  metaBar: {
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    padding: '6px 12px',
    marginBottom: 20,
    fontSize: 12,
  },
  metaText: {
    color: '#666',
  },
  code: {
    fontFamily: 'monospace',
    background: '#e8e8e8',
    padding: '1px 4px',
    borderRadius: 3,
  },
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  card: {
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
    background: '#fff',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  cardHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  labelBadge: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 700,
  },
  bitmarkType: {
    fontSize: 11,
    background: '#1a237e',
    color: '#fff',
    padding: '2px 7px',
    borderRadius: 10,
    fontWeight: 600,
  },
  ovdBadge: {
    fontSize: 10,
    background: '#e8eaf6',
    color: '#3949ab',
    padding: '2px 6px',
    borderRadius: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  chevron: {
    fontSize: 11,
    color: '#9e9e9e',
  },
  descRow: {
    padding: '4px 12px 4px',
    fontSize: 12,
    color: '#666',
  },
  noteRow: {
    padding: '2px 12px 6px',
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  fieldsGrid: {
    padding: '8px 12px 12px',
    borderTop: '1px solid #f0f0f0',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 8,
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
  },
  colorInputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  colorInput: {
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
    minWidth: 0,
  },
  numInputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  numInput: {
    flex: 1,
    fontSize: 12,
    padding: '4px 6px',
    border: '1px solid #ccc',
    borderRadius: 4,
    minWidth: 0,
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  clearLabelBtn: {
    gridColumn: '1 / -1',
    background: 'none',
    border: '1px solid #ef9a9a',
    color: '#c62828',
    padding: '5px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 11,
    marginTop: 4,
  },
  loading: {
    padding: 48,
    textAlign: 'center' as const,
    color: '#888',
    fontSize: 14,
  },
  error: {
    padding: 24,
    background: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: 8,
    color: '#c62828',
    fontSize: 13,
    lineHeight: 1.6,
  },
  bottomBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 24,
    paddingTop: 16,
    borderTop: '1px solid #e0e0e0',
  },
};
