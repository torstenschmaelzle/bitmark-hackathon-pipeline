/**
 * App root — hash-based routing
 *
 * #/               → upload / results
 * #/settings       → Bitmark Settings (style overrides per label)
 * #/edit-bitmark?job=<id>  → Edit Bitmark page (style per bitmark type + live preview)
 */

import React, { useState, useEffect } from 'react';
import { UploadPanel } from './components/UploadPanel';
import { ResultsView } from './components/ResultsView';
import { BitmarkSettingsPage } from './pages/BitmarkSettingsPage';
import { EditBitmarkPage } from './pages/EditBitmarkPage';
import type { JobStatus } from './api/client';

import bitmarkLogo from './assets/bitmark-logo.svg';
import getmorebrainLogo from './assets/getmorebrain-logo.svg';
import remeersLogo from './assets/remeers-logo.svg';

// ---------------------------------------------------------------------------
// Hash routing helpers
// ---------------------------------------------------------------------------

interface ParsedRoute {
  pathname: string;
  params: URLSearchParams;
}

function parseHash(raw: string): ParsedRoute {
  const withoutHash = (raw || '#/').replace(/^#/, '');
  const [pathname, search] = withoutHash.split('?');
  return { pathname: pathname || '/', params: new URLSearchParams(search || '') };
}

function useRoute(): ParsedRoute {
  const [route, setRoute] = useState<ParsedRoute>(() => parseHash(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [completedJob, setCompletedJob] = useState<JobStatus | null>(null);
  const route = useRoute();

  const { pathname, params } = route;
  const onSettings    = pathname === '/settings';
  const onEditBitmark = pathname === '/edit-bitmark';
  const onHome        = !onSettings && !onEditBitmark;

  // When a job finishes, auto-navigate to results (stay on #/)
  const handleJobDone = (job: JobStatus) => {
    setCompletedJob(job);
    window.location.hash = '#/';
  };

  const handleEditBitmark = (jobId: string) => {
    window.location.hash = `#/edit-bitmark?job=${jobId}`;
  };

  const isUploadView = onHome && completedJob == null;

  return (
    <div style={styles.appShell}>

      {/* ── Header ── */}
      <header style={styles.header}>

        {/* Left: app title */}
        <a href="#/" style={styles.logoLink}>
          <span style={styles.appTitle}>Bitmark Document Pipeline</span>
        </a>

        {/* Center: partner logos (shown on all pages) */}
        <div style={styles.partnerLogos}>
          <img src={bitmarkLogo}      alt="Bitmark Association" style={styles.partnerLogo} />
          <div style={styles.logoDivider} />
          <img src={getmorebrainLogo} alt="Get More Brain"      style={styles.partnerLogo} />
          <div style={styles.logoDivider} />
          <img src={remeersLogo}      alt="Remeers"             style={styles.partnerLogo} />
        </div>

        {/* Right: nav */}
        <nav style={styles.nav}>
          <a href="#/" style={{ ...styles.navLink, ...(onHome ? styles.navLinkActive : {}) }}>
            Documents
          </a>
          <a href="#/settings" style={{ ...styles.navLink, ...(onSettings ? styles.navLinkActive : {}) }}>
            Settings
          </a>
        </nav>
      </header>

      {/* ── Hero tagline (upload page only) ── */}
      {isUploadView && (
        <div style={styles.hero}>
          <p style={styles.heroTagline}>PDF · HTML · DOCX → Canonical JSON + Bitmark</p>
          <p style={styles.heroSub}>Upload a document and watch the pipeline extract, classify, and export structured Bitmark content.</p>
        </div>
      )}

      {/* ── Main ── */}
      <main style={styles.main}>

        {onSettings && <BitmarkSettingsPage />}

        {onEditBitmark && (
          <EditBitmarkPage
            jobId={params.get('job') ?? ''}
            onBack={() => window.history.back()}
          />
        )}

        {onHome && completedJob == null && (
          <UploadPanel onJobDone={handleJobDone} />
        )}

        {onHome && completedJob != null && (
          <>
            <div style={styles.newDocRow}>
              <button style={styles.newDocBtn} onClick={() => setCompletedJob(null)}>
                ← Process another document
              </button>
            </div>
            <ResultsView job={completedJob} onEditBitmark={handleEditBitmark} />
          </>
        )}
      </main>

      {/* ── Footer (upload page only) ── */}
      {isUploadView && (
        <footer style={styles.footer}>
          <span>Bitmark Hackathon Demo &nbsp;·&nbsp; PDF · HTML · DOCX pipeline</span>
        </footer>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  appShell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f8f9ff',
  },
  header: {
    background: '#1a237e',
    color: '#fff',
    padding: '0 24px',
    height: 60,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
    flexShrink: 0,
  },
  logoLink: {
    textDecoration: 'none',
    color: 'inherit',
    flexShrink: 0,
  },
  appTitle: {
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
  },
  partnerLogos: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  partnerLogo: {
    height: 36,
    width: 'auto',
    borderRadius: 6,
    objectFit: 'contain',
  },
  logoDivider: {
    width: 1,
    height: 24,
    background: 'rgba(255,255,255,0.2)',
  },
  nav: {
    display: 'flex',
    gap: 4,
    flexShrink: 0,
  },
  navLink: {
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  },
  navLinkActive: {
    color: '#fff',
    background: 'rgba(255,255,255,0.15)',
  },
  hero: {
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 60%, #3949ab 100%)',
    padding: '32px 24px 28px',
    textAlign: 'center',
    color: '#fff',
  },
  heroTagline: {
    margin: '0 0 8px',
    fontSize: 13,
    fontFamily: 'monospace',
    opacity: 0.8,
    letterSpacing: '0.05em',
  },
  heroSub: {
    margin: 0,
    fontSize: 15,
    opacity: 0.9,
    maxWidth: 560,
    marginLeft: 'auto',
    marginRight: 'auto',
    lineHeight: 1.5,
  },
  main: {
    flex: 1,
    paddingTop: 8,
  },
  newDocRow: {
    padding: '16px 24px 8px',
    maxWidth: 960,
    margin: '0 auto',
  },
  newDocBtn: {
    background: 'none',
    border: '1px solid #9fa8da',
    color: '#3949ab',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  footer: {
    padding: '12px 24px',
    textAlign: 'center',
    fontSize: 12,
    color: '#9e9e9e',
    borderTop: '1px solid #e0e0e0',
  },
};
