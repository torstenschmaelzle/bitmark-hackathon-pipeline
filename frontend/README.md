# Bitmark Hackathon — Frontend

React + TypeScript + Vite UI for the document intelligence pipeline.

## Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## How it works

1. Drop or pick a PDF / HTML / DOCX file in the upload panel
2. The file is sent to `POST /api/upload` (proxied to the FastAPI backend at :8000)
3. The UI polls `GET /api/job/{job_id}` until processing completes
4. Results are displayed in reading order — each block shows its label, confidence, and evidence
5. Toggle raw JSON views for canonical, classification, and bitmark artifacts
6. Download any artifact as a JSON file

## API proxy

`vite.config.ts` proxies `/api/*` to `http://localhost:8000` during dev.
For production, set the backend URL directly in `src/api/client.ts`.

## Project structure

```
src/
  api/client.ts          API calls + polling logic
  components/
    UploadPanel.tsx      Drag-and-drop upload + progress
    ResultsView.tsx      Summary + block list + downloads
    BlockCard.tsx        Single block with spans, label, evidence
  types/
    canonical.ts         CanonicalDoc types
    classification.ts    ClassificationDoc types + label colors
    bitmark.ts           BitmarkDoc types
  App.tsx                Root component (idle → results state machine)
  main.tsx               React entry point
```
