# Bitmark Hackathon — Backend

FastAPI service that ingests PDF, HTML, and DOCX files, extracts structure through a
three-layer architecture (adapters → canonical model → classification), and outputs
canonical JSON, classification JSON, and Bitmark JSON.

## Requirements

- Python 3.11+
- (Optional) Anthropic API key for LLM-assisted classification

## Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# (Optional) create .env for LLM support
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY, USE_LLM=true
```

## .env.example

```
USE_LLM=false
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=sk-ant-...
```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at http://localhost:8000/docs

## Sample curl upload

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@/path/to/document.pdf"
```

Response:
```json
{"job_id": "abc123"}
```

Poll for results:
```bash
curl http://localhost:8000/api/job/abc123
```

Download artifact:
```bash
curl -O http://localhost:8000/api/download/abc123/bitmark
```

## Architecture

```
adapters/        Layer A — format-specific ingestion (PDF, HTML, DOCX)
pipeline/
  canonical_model.py   Layer B — unified CanonicalDoc Pydantic schemas
  heuristics.py        Layer C step 1 — high-precision rule-based labels
  llm_classifier.py    Layer C step 2 — optional Anthropic LLM for ambiguous blocks
  classification.py    Layer C orchestration — calls heuristics then LLM
  postprocess.py       Layer C step 3 — deterministic grouping and consistency
  bitmark_export.py    Export to Bitmark-like JSON
  orchestrator.py      Top-level pipeline runner
api/routes.py    FastAPI endpoints
util/            Logging, file storage, shared schemas
data/
  uploads/       Saved uploaded files
  outputs/       Persisted job outputs (canonical, classification, bitmark JSON)
```
