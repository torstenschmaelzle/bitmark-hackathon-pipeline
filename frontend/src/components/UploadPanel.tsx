/**
 * UploadPanel
 *
 * Drag-and-drop + file picker for PDF, HTML, DOCX uploads.
 * Shows upload progress, polls for job completion, then calls onJobDone.
 */

import React, { useCallback, useRef, useState } from 'react';
import { uploadFile, pollJobUntilDone } from '../api/client';
import type { JobStatus } from '../api/client';

interface Props {
  onJobDone: (job: JobStatus) => void;
}

type UploadPhase =
  | { type: 'idle' }
  | { type: 'uploading' }
  | { type: 'polling'; jobId: string; state: string }
  | { type: 'error'; message: string };

const ACCEPTED = '.pdf,.html,.htm,.docx';

const STEPS = [
  { num: '1', title: 'Upload document', desc: 'PDF, HTML or DOCX — drag & drop or browse' },
  { num: '2', title: 'Pipeline processes', desc: 'Extracts, classifies and maps structure to Bitmark types' },
  { num: '3', title: 'Export & style', desc: 'Download Bitmark JSON or open the visual editor' },
];

export function UploadPanel({ onJobDone }: Props) {
  const [phase, setPhase] = useState<UploadPhase>({ type: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setPhase({ type: 'uploading' });
      try {
        const { job_id } = await uploadFile(file);
        setPhase({ type: 'polling', jobId: job_id, state: 'pending' });

        const finalJob = await pollJobUntilDone(
          job_id,
          (status) => setPhase({ type: 'polling', jobId: job_id, state: status.state }),
        );

        if (finalJob.state === 'failed') {
          setPhase({ type: 'error', message: finalJob.error ?? 'Processing failed' });
        } else {
          onJobDone(finalJob);
          setPhase({ type: 'idle' });
        }
      } catch (err) {
        setPhase({ type: 'error', message: String(err) });
      }
    },
    [onJobDone],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const isProcessing = phase.type === 'uploading' || phase.type === 'polling';

  return (
    <div style={styles.wrapper}>
      <div style={styles.centerCol}>

        {/* ── Upload card ── */}
        <div style={styles.uploadCard}>
          <div
            style={{
              ...styles.dropZone,
              ...(dragOver ? styles.dropZoneActive : {}),
              ...(isProcessing ? styles.dropZoneDisabled : {}),
            }}
            onDrop={isProcessing ? undefined : handleDrop}
            onDragOver={isProcessing ? undefined : handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              style={{ display: 'none' }}
              onChange={handleInputChange}
            />

            {phase.type === 'idle' && (
              <>
                <div style={styles.uploadIcon}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="24" fill="#e8eaf6"/>
                    <path d="M24 14 L24 30 M16 22 L24 14 L32 22" stroke="#3949ab" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="14" y="32" width="20" height="3" rx="1.5" fill="#3949ab" opacity="0.4"/>
                  </svg>
                </div>
                <p style={styles.dropTitle}>Drop your document here</p>
                <p style={styles.dropSub}>PDF, HTML or DOCX</p>
                <button
                  style={styles.browseBtn}
                  onClick={() => inputRef.current?.click()}
                >
                  Browse files
                </button>
              </>
            )}

            {phase.type === 'uploading' && (
              <>
                <Spinner />
                <p style={styles.dropTitle}>Uploading…</p>
                <p style={styles.dropSub}>Sending file to pipeline</p>
              </>
            )}

            {phase.type === 'polling' && (
              <>
                <Spinner />
                <p style={styles.dropTitle}>Processing…</p>
                <p style={styles.dropSub}>
                  Job <code style={styles.code}>{phase.jobId}</code>
                </p>
                <StatusBar state={phase.state} />
              </>
            )}

            {phase.type === 'error' && (
              <>
                <div style={styles.errorIcon}>⚠️</div>
                <p style={{ ...styles.dropTitle, color: '#c62828' }}>Processing failed</p>
                <p style={styles.errorMsg}>{phase.message}</p>
                <button
                  style={styles.browseBtn}
                  onClick={() => setPhase({ type: 'idle' })}
                >
                  Try again
                </button>
              </>
            )}
          </div>

          <p style={styles.acceptedTypes}>
            Supported: <strong>PDF</strong>, <strong>HTML / HTM</strong>, <strong>DOCX</strong>
          </p>
        </div>

        {/* ── How it works ── */}
        {!isProcessing && (
          <div style={styles.stepsSection}>
            <p style={styles.stepsTitle}>How it works</p>
            <div style={styles.stepsRow}>
              {STEPS.map((step) => (
                <div key={step.num} style={styles.stepCard}>
                  <div style={styles.stepNum}>{step.num}</div>
                  <p style={styles.stepTitle}>{step.title}</p>
                  <p style={styles.stepDesc}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div style={spinnerStyles.wrapper}>
      <div style={spinnerStyles.ring} />
    </div>
  );
}

const spinnerStyles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', justifyContent: 'center', marginBottom: 12 },
  ring: {
    width: 40,
    height: 40,
    border: '4px solid #e8eaf6',
    borderTop: '4px solid #3949ab',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

function StatusBar({ state }: { state: string }) {
  const steps = ['pending', 'processing', 'done'];
  const idx = steps.indexOf(state);
  return (
    <div style={statusStyles.bar}>
      {steps.map((step, i) => (
        <div key={step} style={statusStyles.step}>
          <div style={{ ...statusStyles.dot, background: i <= idx ? '#3949ab' : '#e0e0e0' }} />
          <span style={{ ...statusStyles.label, fontWeight: i === idx ? 700 : 400 }}>{step}</span>
        </div>
      ))}
    </div>
  );
}

const statusStyles: Record<string, React.CSSProperties> = {
  bar:   { display: 'flex', gap: 24, marginTop: 16, justifyContent: 'center' },
  step:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot:   { width: 12, height: 12, borderRadius: '50%', transition: 'background 0.3s' },
  label: { fontSize: 11, color: '#555' },
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 16px 48px',
  },
  centerCol: {
    width: '100%',
    maxWidth: 580,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  uploadCard: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(26,35,126,0.10)',
    overflow: 'hidden',
  },
  dropZone: {
    minHeight: 240,
    border: '2px dashed #9fa8da',
    borderRadius: 12,
    margin: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    transition: 'border-color 0.2s, background 0.2s',
    textAlign: 'center',
    cursor: 'default',
    background: '#f5f7ff',
  },
  dropZoneActive: {
    borderColor: '#3949ab',
    background: '#e8eaf6',
  },
  dropZoneDisabled: {
    opacity: 0.85,
  },
  uploadIcon: {
    marginBottom: 12,
  },
  dropTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a237e',
    margin: '0 0 6px',
  },
  dropSub: {
    fontSize: 13,
    color: '#666',
    margin: '0 0 18px',
  },
  browseBtn: {
    background: '#3949ab',
    color: '#fff',
    border: 'none',
    padding: '10px 28px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.01em',
    boxShadow: '0 2px 8px rgba(57,73,171,0.25)',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 13,
    color: '#c62828',
    marginTop: 6,
    marginBottom: 16,
    maxWidth: 380,
    wordBreak: 'break-word',
  },
  acceptedTypes: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    padding: '10px 16px 14px',
    borderTop: '1px solid #f0f0f0',
    margin: 0,
  },
  code: {
    fontFamily: 'monospace',
    background: '#e8eaf6',
    padding: '1px 5px',
    borderRadius: 3,
  },
  stepsSection: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(26,35,126,0.08)',
    padding: '20px 24px 24px',
  },
  stepsTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: '0 0 16px',
  },
  stepsRow: {
    display: 'flex',
    gap: 12,
  },
  stepCard: {
    flex: 1,
    background: '#f5f7ff',
    borderRadius: 10,
    padding: '14px 16px',
    textAlign: 'center',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#1a237e',
    color: '#fff',
    fontSize: 14,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 10px',
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1a237e',
    margin: '0 0 4px',
  },
  stepDesc: {
    fontSize: 11,
    color: '#666',
    lineHeight: 1.4,
    margin: 0,
  },
};

// Inject spinner keyframe once
if (typeof document !== 'undefined' && !document.getElementById('spinner-style')) {
  const style = document.createElement('style');
  style.id = 'spinner-style';
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}
