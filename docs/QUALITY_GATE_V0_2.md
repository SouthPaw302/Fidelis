# v0.2 Decompile Project Model Quality Gate

Branch: `dev/decompile-project-model-v0.2`

## Scope

This milestone adds the whole-song project contract and deck workflow only.

Included:

- primary full mix or isolated stem;
- optional supplied stems;
- project assets and provenance;
- part records;
- performance-document attachment;
- renderer-assignment slots;
- reconstruction state;
- reassembly manifest;
- whole-project export;
- truthful full-mix boundary behavior.

Explicitly excluded:

- source separation;
- polyphonic transcription;
- real external-engine execution;
- reconstructed WAV generation;
- final mix rendering;
- A/B quality scoring.

## Defects caught during the gate

1. Main contained literal `\\n` text in `AGENTS.md`.
2. CSS contained a literal `\\n` before the `[hidden]` rule; an earlier sandbox mirror had accidentally normalized it.
3. Initial v0.2 capability text still described v0.1.
4. Full-mix router status was too long for the mobile header.
5. Ecosystem cards used `AVAILABLE`, which could imply executable integration rather than code/pattern reuse.

All five were corrected before the final run.

## Exact-source parity

Before the final browser test, Git blob hashes matched the sandbox mirror for the tested HTML, CSS, application modules, audio analyzers, project/schema/engine/Jev modules, UI helper, harness adapter, package manifest and project test.

## Static / deterministic gate

- `npm run check`: PASS
- `npm test`: PASS
- synthetic fiddle analyzer: PASS
- project-model contract test: PASS
- invalid asset-reference rejection: PASS

Project-model test summary:

```text
assets: 3
suppliedStems: 2
parts: 3
performanceMaps: 1
rendererAssignments: 1
reconstructedParts: 0
reassemblyStatus: planned
```

## Browser gate

Chromium sandbox policy blocked direct localhost navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`.

The documented fallback was used: exact repository HTML/CSS plus exact repository ES modules were loaded in Chromium as in-memory `data:` modules. The test still used actual browser file inputs, Web Audio decoding, DOM events, download behavior and screenshots.

Final result:

```text
FIDELIS V0.2 UI GATE: PASS

engine cards: 12

isolated stem:
  pitch frames: 128
  performance events: 23
  project parts: 1
  performance maps: 1
  rebuild candidates: 3

full mix + supplied stems:
  assets: 3
  supplied stems: 2
  parts: 2
  fabricated performance maps: 0
  boundary route cards: 1

mobile:
  viewport: 390 x 844
  scrollWidth: 390
  clientWidth: 390
  page errors: 0
```

Project export was exercised for both stem and full-mix workflows. Exported documents validated as `fidelis.project.v0.2`; the full-mix export preserved both supplied stems and contained zero fabricated performance documents.

## Visual review

Reviewed:

- 1440 x 1000 initial deck;
- isolated-stem decompile state;
- full-mix + supplied-stem state;
- Project Core / lower deck;
- 390 x 844 mobile state.

No blocking overlap, stale empty state, clipped primary action or page-level horizontal overflow remained after fixes.

## Gate state

**PASS — v0.2 Decompile Project Model is ready for PR/merge.**

This does not promote Fidelis to alpha. It closes only the project-model milestone.
