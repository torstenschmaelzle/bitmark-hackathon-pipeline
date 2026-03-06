/**
 * API Client
 *
 * All backend calls go through these typed functions.
 * The Vite proxy (vite.config.ts) forwards /api/* to http://localhost:8000/api/*
 * in development, so we can use relative URLs.
 */

import type { CanonicalDoc } from '../types/canonical';
import type { ClassificationDoc } from '../types/classification';
import type { BitmarkDoc } from '../types/bitmark';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobState = 'pending' | 'processing' | 'done' | 'failed';

export interface JobStatus {
  job_id: string;
  state: JobState;
  filename: string;
  created_at: number;
  error?: string | null;
  canonical?: CanonicalDoc | null;
  classification?: ClassificationDoc | null;
  bitmark?: BitmarkDoc | null;
}

export interface UploadResponse {
  job_id: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Upload a document file and get back a job_id immediately. */
export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<UploadResponse>(res);
}

/** Poll a job for its current state. Includes results when state === 'done'. */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/job/${jobId}`);
  return handleResponse<JobStatus>(res);
}

/** Get the download URL for a specific artifact. */
export function getDownloadUrl(jobId: string, artifact: 'canonical' | 'classification' | 'bitmark'): string {
  return `${API_BASE}/download/${jobId}/${artifact}`;
}

/**
 * Poll a job until it reaches 'done' or 'failed'.
 * Calls onUpdate with each intermediate status.
 * Resolves with the final JobStatus.
 */
export async function pollJobUntilDone(
  jobId: string,
  onUpdate: (status: JobStatus) => void,
  intervalMs = 1000,
  maxAttempts = 120,
): Promise<JobStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getJobStatus(jobId);
    onUpdate(status);

    if (status.state === 'done' || status.state === 'failed') {
      return status;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Job polling timed out after 2 minutes');
}
