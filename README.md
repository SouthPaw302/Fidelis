# Fidelis

**Performance-preserving instrument reconstruction for AI-generated music.**

Fidelis treats an AI-generated instrument stem as a **performance blueprint**, not necessarily as the final waveform. The goal is to preserve musical intent — notes, pitch movement, dynamics, vibrato, slides, timing, articulation — and let interchangeable renderers rebuild the instrument at higher fidelity.

## What v0.1 does today

- Runs as a dependency-free browser app suitable for **Vercel, Netlify, GitHub Pages, or any static host**.
- Accepts an isolated audio stem (WAV preferred).
- Decodes and analyzes the audio locally in the browser.
- Extracts a first-pass monophonic pitch contour and note gestures.
- Estimates dynamics, attack character, slide direction, vibrato rate/depth, RMS and crest factor.
- Produces a versioned `performance.json` handoff document.
- Uses a deterministic **Jev-compatible route judge** to recommend reconstruction families.
- Documents adapters for RAVE, BRAVE, Sony Diffusion Timbre Transfer, WaveTransfer, Google DDSP, MIDI-DDSP, Basic Pitch, STRAdi and Instrudio.
- Reuses architecture patterns from the broader SouthPaw302 ecosystem without coupling Fidelis to those projects.

> v0.1 is a proof-of-concept analyzer and orchestration shell. It does **not** pretend the heuristic browser analyzer replaces STRAdi, Basic Pitch, DDSP, RAVE, BRAVE or a production physical renderer. Those are deliberately adapter slots.

## Why this architecture

The fidelity problem is not always solved by mastering. A generated fiddle can have the right melody and expression while the waveform itself has smeared transients, simplified harmonics or synthetic high-frequency texture. Fidelis separates two questions:

1. **What was the performance?**
2. **What should render that performance?**

That makes this possible:

```text
AI stem
  ↓
performance extraction
  ↓
performance.json
  ↓
route / renderer adapter
  ↓
new high-fidelity stem
  ↓
A/B + QC
```

## Run locally

No build system is required.

```bash
python -m http.server 4173
# open http://localhost:4173
```

You can also use any static web server.

## Deploy

### Vercel

Import `SouthPaw302/Fidelis`. There is no build command; the repository root is the published site.

### Netlify

Import the repository. `netlify.toml` publishes the repository root directly.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the worker architecture used when heavyweight models are attached.

## Core reconstruction routes

| Route | Systems | Purpose |
| --- | --- | --- |
| Direct timbre transfer | RAVE / Scyclone, BRAVE, Sony Diffusion, WaveTransfer | Preserve source timing and phrasing with minimal symbolic interpretation. |
| Structured synthesis | Google DDSP | Extract continuous controls and rebuild timbre through a structured synthesizer. |
| Performance reconstruction | STRAdi / Basic Pitch → Fidelis → Instrudio / other renderer | Discard the source waveform and preserve the musical gesture instead. |

## Existing ecosystem we reuse

Fidelis stays independent, but proven patterns/code can be adapted from:

- **LibertyDJ** — local model workers, ONNX/WebGPU/WASM execution, model health/fallbacks, audio intelligence.
- **LibertasDesktop** — native PCM, 48 kHz audio, aligned stem playback, DSP/routing.
- **AIVideoEdit** — deterministic FFT/onset/energy/phrase analysis and QC patterns.
- **DeepSeek Harness** — optional planning/orchestration layer.
- **Jev** — bounded judgement/routing role; Fidelis v0 includes a deterministic contract-compatible fallback.

## Repository map

```text
index.html                    GUI / application shell
styles.css                    Fidelis visual system
src/audio/                    deterministic browser audio analysis
src/core/schema.js            performance.json contract
src/core/jev.js               bounded route judgement
src/core/engines.js           engine and route registry
src/orchestrator/             external harness adapters
src/ui/                       waveform/UI helpers
docs/                         architecture, agents, deployment, schemas
```

## Project principles

1. **Independent product, interoperable ecosystem.**
2. **Adapter-first.** No single research repository becomes the architecture.
3. **Deterministic execution below model judgement.**
4. **Performance data is a stable artifact.** Renderers are replaceable.
5. **Never silently claim a heuristic estimate is ground truth.** Confidence and limitations travel with the artifact.
6. **Browser UI stays usable even when heavyweight workers are unavailable.**

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`AGENTS.md`](AGENTS.md).
