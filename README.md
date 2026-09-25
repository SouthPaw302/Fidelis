# Fidelis

**Performance-preserving decompilation and instrument reconstruction for generated music.**

Fidelis treats generated audio as a musical system that can be recovered, described, rerendered and reassembled. Stems are useful when available, but they are not required by the architecture.

```text
full mix or stems
  -> authoritative project model
  -> source decomposition / supplied parts
  -> performance extraction
  -> Jev route decision
  -> renderer / timbre-transfer worker
  -> QC
  -> reassembly
```

## Current checkpoint — backend pre-alpha

The sandbox build now has a real FastAPI backend and a cyberpunk deck that uses it as project authority.

Working and tested:

- whole-song projects, assets, parts, jobs and artifacts;
- SQLite development persistence and SHA-256 artifact provenance;
- full-mix or isolated-stem intake;
- supplied-stem attachment;
- native monophonic performance extraction using librosa pYIN plus deterministic gesture analysis;
- Jev bounded route selection;
- **Instrudio Studio Violin native backend adapter**, translated from the MIT-licensed upstream physical-model contract;
- Fidelis native physical-violin comparator;
- explicit reference synth fallback for pipeline testing;
- objective QC reports;
- reconstructed/original part selection and stereo reassembly;
- DeepSeek Harness planning seam plus MCP stdio bridge;
- external worker protocol for Demucs, Basic Pitch, STRAdi, DDSP, RAVE/Scyclone, BRAVE, Sony Diffusion, WaveTransfer and Instrudio;
- browser deck wired to backend authority through Steps 1–5;
- desktop and 390px mobile browser gates.

Current sandbox blocker:

- Demucs 4 is installed, but the verified HTDemucs checkpoint is not cached and this sandbox cannot download it. Fidelis reports the capability as `blocked` and can import the official checkpoint through the UI/API rather than fabricating stems.

## Run locally

Install Python dependencies, then run the backend:

```bash
pip install -r requirements.txt
PYTHONPATH=backend python -m fidelis_backend
```

Open `http://127.0.0.1:8787/` when running from a normal local environment. The backend serves both API and static deck.

Validation:

```bash
npm run check
npm test
bash backend/tests/run_all.sh
```

The browser/backend authority gate is:

```bash
PYTHONPATH=backend python backend/tests/ui_backend_gate.py
```

## Vercel / Netlify

The deck can be hosted independently from model workers. Same-origin API is the default. For a separate backend, set one of:

```js
window.FIDELIS_CONFIG = { apiBaseUrl: 'https://your-fidelis-api.example' };
```

or visit the deck once with:

```text
?api=https://your-fidelis-api.example
```

The value is stored locally in the browser for later sessions.

Vercel/Netlify should be treated as the control surface unless durable database/object storage is configured. Heavy GPU/model engines belong behind the Fidelis worker protocol and can run anywhere.

## Engine policy

Every engine reports one of `ready`, `blocked`, `experimental`, or `unavailable`. The UI must not make an engine look executable unless its preflight is actually green.

The selected route and the executing adapter are recorded separately. This lets Jev preserve the desired reconstruction strategy even when Fidelis has to use an explicit fallback.

## Repository map

```text
index.html                         cyberpunk reconstruction deck
styles.css
src/
  app.js                           backend-authority UI workflow
  backend-client.js                REST client
  core/                            browser-side contracts / compatibility
  audio/                           lightweight browser analysis utilities
backend/
  fidelis_backend/
    api.py                         FastAPI control plane
    storage.py                     project/job/artifact persistence
    jobs.py                        asynchronous job runner
    orchestrator.py                deterministic production workflow
    registry.py                    adapter registry
    adapters/                      models/renderers/workers
    harness/                       Jev + DeepSeek planning seam
    mcp_server.py                  agent/MCP bridge
  vendor/instrudio/                MIT definition + license metadata
  tests/                           backend / worker / MCP / browser gates
  ARCHITECTURE.md
  DEPLOYMENT.md
  WORKER_PROTOCOL.md
```

Read `AGENTS.md` before modifying the project. No stage is considered implemented until its sandbox gate passes.
