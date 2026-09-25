# Architecture

## Product boundary

Fidelis is a standalone application. Vercel or Netlify may host the control surface while heavyweight workers can run in browser, serverless compute, containers, GPU infrastructure, local/private workers or external services.

The product owns the **project contracts and workflow**. Engines are replaceable providers.

## Canonical pipeline

```text
full mix or supplied stems
          │
          ▼
   fidelis.project.v0.2
          │
   ┌──────┴──────────────────────────────┐
   │                                     │
source decomposition              supplied parts
(polyphonic/separation)                │
   │                                     │
   └──────────────┬──────────────────────┘
                  ▼
            project parts
                  │
        performance extraction
                  │
                  ▼
      fidelis.performance.v0.1
                  │
        ┌─────────┴─────────┐
        │                   │
      Jev judge      DeepSeek Harness
        │             optional planner
        └─────────┬─────────┘
                  ▼
          renderer assignment
                  │
    ┌─────────────┼──────────────┐
    ▼             ▼              ▼
 direct         DDSP       physical/sample
 transfer       render          render
    │             │              │
    └─────────────┴──────────────┘
                  ▼
          reconstructed assets
                  │
                  ▼
           reassembly manifest
                  │
                  ▼
             mix + QC
```

No renderer may bypass the project model.

## Project model

`src/core/project.js` owns the whole-song state:

- canonical primary source;
- optional supplied stems;
- audio assets and provenance;
- supplied and recovered parts;
- timeline shell;
- performance documents per part;
- renderer assignment;
- reconstruction state;
- reassembly tracks;
- QC state.

See `docs/PROJECT_SCHEMA.md`.

## Browser analyzer

The dependency-free browser analyzer remains a **monophonic stem analyzer**. It provides:

- PCM decode via Web Audio;
- mono mixdown for analysis;
- RMS / peak / crest factor;
- normalized-autocorrelation pitch estimates;
- octave-jump suppression;
- note segmentation;
- heuristic attack, slide and vibrato descriptors.

It does not perform source separation or general polyphonic transcription.

When the primary source is marked as a full mix, Fidelis registers the project but refuses to fabricate monophonic note data. Supplied stems can be attached immediately while a future decomposition adapter supplies recovered parts.

## Adapter contracts

### `SourceDecomposer`

Input: full-mix asset plus project context. Output: recovered audio assets/parts with confidence and provenance.

Expected future implementations: source-separation and polyphonic-recovery systems.

### `Transcriber`

Input: part/stem audio. Output: notes, continuous pitch and confidence.

Examples: Basic Pitch, STRAdi.

### `PerformanceAnalyzer`

Input: part audio plus optional transcription. Output: dynamics, pitch curves, vibrato and articulation evidence.

Examples: Fidelis native analyzers, future learned encoders, DDSP-derived controls.

### `TimbreTransfer`

Input: source part audio plus target model. Output: reconstructed candidate audio.

Examples: RAVE, BRAVE, Sony Diffusion, WaveTransfer.

### `Renderer`

Input: project part plus `performance.json` or translated controls. Output: reconstructed audio asset.

Examples: Instrudio, DDSP, sample-library workers, future VST/CLAP host.

### `Judge`

Input: evidence + bounded choices. Output: choice and rationale.

Examples: Jev; deterministic fallback in `src/core/jev.js`.

### `Planner`

Input: project goal + evidence + adapters. Output: multi-step experiment plan.

Examples: DeepSeek Harness.

## Worker topology

```text
Vercel / Netlify deck
        │
        ▼
 project/job API
        │
   ┌────┼─────────────┐
   ▼    ▼             ▼
 CPU   GPU       browser WebGPU
 worker worker       / WASM
   │
   └─────── optional local/private worker
```

Provider location does not define the product. Project and adapter contracts do.

## Ecosystem reuse

Code/patterns may be ported cleanly from:

- LibertyDJ: model registry, worker lifecycle, confidence fusion, ONNX/WebGPU/WASM;
- LibertasDesktop: native PCM/stem engine and real-time DSP;
- AIVideoEdit: deterministic analysis, timing/QC maps and harness conventions.

These repositories are reuse sources, not required runtime dependencies.
