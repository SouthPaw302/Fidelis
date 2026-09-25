# Fidelis

**Performance-preserving decompilation and instrument reconstruction for AI-generated music.**

Fidelis treats generated audio as a musical system that can be recovered, described and rebuilt. A stem is useful when available, but the product target is broader:

```text
full song or stems
  -> project model
  -> recover parts + performance
  -> assign improved renderers
  -> reconstruct parts
  -> reassemble song
  -> compare / QC
```

## Current state — v0.2 pre-alpha

The current build is a tested **project/decompilation chassis**, not a finished restoration engine.

Working now:

- independent browser app suitable for Vercel, Netlify or static hosting;
- full-mix or isolated-stem primary source intake;
- optional multi-file supplied-stem attachment;
- versioned `fidelis.project.v0.2` whole-song project document;
- source assets, parts, timeline shell, renderer assignments, reconstruction state, reassembly manifest and QC state;
- deterministic browser analysis for isolated monophonic stems;
- pitch contour, note/performance events, dynamics, attack, slide and vibrato hints;
- versioned `fidelis.performance.v0.1` documents attached to project parts;
- Jev-compatible bounded route ranking;
- DeepSeek Harness handoff contract;
- project and performance JSON export;
- cyberpunk reconstruction-deck GUI;
- strict sandbox/browser quality gates.

Not implemented yet:

- automatic source separation from a full mix;
- polyphonic instrument recovery;
- executable RAVE / BRAVE / DDSP / STRAdi / Instrudio adapters;
- reconstructed audio output;
- final mix/reassembly rendering;
- objective A/B quality scoring.

Fidelis explicitly labels those capabilities as pending rather than simulating them.

## Why this architecture

Mastering cannot recover acoustic information that never existed in the generated waveform. Fidelis therefore separates:

1. **the song/project** — source, parts, timing, provenance, reconstruction and reassembly state;
2. **the performance** — pitch motion, note events, dynamics, articulation evidence and expression;
3. **the renderer** — replaceable timbre-transfer, DDSP, physical-model or sample-based engines.

A renderer never owns the project. Engines are adapters behind stable contracts.

## Run

No build step is required.

```bash
python -m http.server 4173
# open http://localhost:4173
```

Validation:

```bash
npm run check
npm test
```

UI/workflow changes additionally require the sandbox browser gate in [`docs/TESTING.md`](docs/TESTING.md).

## Deploy

### Vercel

Import `SouthPaw302/Fidelis`. The repository root is the site; there is no frontend build command.

### Netlify

Import the repository. `netlify.toml` publishes the repository root.

Heavy model workers may run elsewhere behind adapter/job contracts. The browser application remains the independent control surface.

## Engine families

| Family | Systems | Role |
| --- | --- | --- |
| Direct timbre transfer | RAVE / Scyclone, BRAVE, Sony Diffusion, WaveTransfer | Preserve source phrasing while replacing timbre. |
| Structured synthesis | Google DDSP / MIDI-DDSP concepts | Separate continuous performance controls from synthesis. |
| Transcription | Basic Pitch, STRAdi | Recover notes, pitch movement and performance evidence. |
| Physical/sample reconstruction | Instrudio, future sample/VST workers | Build a new waveform from recovered performance. |

Existing SouthPaw302 systems are **reuse sources**, not runtime requirements:

- **LibertyDJ** — model-worker and musical-analysis patterns;
- **LibertasDesktop** — PCM, aligned stems, DSP and routing patterns;
- **AIVideoEdit** — deterministic analysis/QC/orchestration patterns;
- **DeepSeek Harness** — optional planning/orchestration;
- **Jev** — bounded decision/judgement role.

## Repository map

```text
index.html
styles.css
src/
  app.js
  audio/
  core/
    project.js       whole-song project contract
    schema.js        performance contract
    engines.js
    jev.js
  orchestrator/
  ui/
tests/
docs/
```

Start with [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PROJECT_SCHEMA.md`](docs/PROJECT_SCHEMA.md) and [`AGENTS.md`](AGENTS.md).
