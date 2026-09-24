# Architecture

## Product boundary

Fidelis is a standalone application. Vercel or Netlify may host the control surface while heavyweight model workers can run anywhere appropriate: browser, serverless function, container, GPU worker, local workstation or external service.

The UI does not care where a model runs. It cares about **adapter contracts**.

## Pipeline

```text
Source stem
   │
   ├── deterministic signal analysis
   ├── transcription adapters
   └── continuous performance analyzers
             │
             ▼
       performance.json
             │
      ┌──────┴─────────┐
      │                │
    Jev judge    DeepSeek Harness
      │          (optional planner)
      └──────┬─────────┘
             ▼
        route manifest
             │
   ┌─────────┼───────────┐
   ▼         ▼           ▼
 direct     DDSP      physical/sample
 transfer   render       renderer
   │         │           │
   └─────────┴───────────┘
             ▼
      candidate stem(s)
             │
             ▼
       objective QC + A/B
```

## v0 browser analyzer

The initial browser analyzer is intentionally dependency-free. It provides:

- PCM decode via Web Audio.
- mono mixdown for analysis.
- RMS / peak / crest factor.
- normalized-autocorrelation pitch estimates on isolated monophonic stems.
- octave-jump suppression.
- note segmentation.
- heuristic attack, slide and vibrato descriptors.

It exists to validate the **data flow and product contract**, not to replace specialized models.

## Adapters

Every heavyweight external system should implement one of these conceptual interfaces:

### `Transcriber`

Input: stem audio. Output: notes / continuous pitch / confidence.

Examples: Basic Pitch, STRAdi.

### `PerformanceAnalyzer`

Input: stem audio plus optional transcription. Output: dynamics, pitch curves, vibrato, articulation evidence and timing.

Examples: Fidelis native analyzers, future learned encoders, DDSP-derived controls.

### `TimbreTransfer`

Input: source audio + target model. Output: candidate audio.

Examples: RAVE, BRAVE, Sony Diffusion, WaveTransfer.

### `Renderer`

Input: `performance.json` or translated controls. Output: new audio.

Examples: Instrudio, DDSP, sample-library worker, future VST/CLAP host.

### `Judge`

Input: evidence + available routes. Output: bounded choice and rationale.

Examples: Jev; deterministic fallback in `src/core/jev.js`.

### `Planner`

Input: project goal + evidence + adapters. Output: multi-step experiment plan.

Examples: DeepSeek Harness.

## Heavy model execution

Do not assume "web app" means "all inference runs inside Vercel". The supported topology is:

```text
Vercel / Netlify UI
        │
        ▼
 job API / queue
        │
        ├── CPU worker
        ├── GPU worker
        ├── browser WebGPU adapter
        └── local/private worker
```

Fidelis remains independent because these are providers, not product owners.

## Ecosystem reuse

Code may be ported from SouthPaw302 projects when it is cleanly separable:

- LibertyDJ: model registry, worker lifecycle, confidence fusion, ONNX/WebGPU/WASM patterns.
- LibertasDesktop: native PCM/stem engine and real-time DSP patterns.
- AIVideoEdit: deterministic analysis, canonical timing/QC maps and harness conventions.

Do not introduce runtime coupling between repositories merely to save a small amount of duplicated utility code.
