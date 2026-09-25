# Testing

Testing is a release gate, not a suggestion.

## Static gate

```bash
npm run check
```

All JavaScript modules must parse.

## Deterministic DSP gate

```bash
npm test
```

The deterministic test suite must confirm both the monophonic analyzer and whole-song project model.

The synthetic fiddle test must confirm that:

- signal analysis produces plausible RMS;
- voiced pitch frames are recovered;
- performance events are produced;
- fiddle evidence routes to the physical reconstruction path;
- a valid `performance.json` document is created.

The project-model test must confirm:

- a primary source becomes a canonical project asset;
- supplied stems become assets and parts;
- performance documents can attach to parts;
- renderer assignments are recorded without implying execution;
- the reassembly manifest is deterministic;
- invalid asset references fail validation.

## Sandbox browser gate

For every UI or workflow change, launch the current repository build in an isolated browser and test the real DOM.

Required assertions:

```text
initial engine cards == 12
browser/page errors == 0
desktop scrollWidth == clientWidth

upload test WAV
source badge == selected filename
wave state == SOURCE LOCKED
decompile button enabled
duration/sample rate populated

run decompile
project state == PROJECT VALID
project parts == 1
performance maps == 1
route cards == 3
pitch frame count > 0
event count > 0
export button enabled
results table visible
empty state hidden
active workflow stage == REBUILD
browser/page errors == 0

full-mix path:
  primary source kind == FULL MIX
  attach >= 2 supplied stems
  supplied stems become project parts
  performance maps remain 0 until real decomposition exists
  full-mix action does not fabricate note data
  project export preserves supplied parts

switch viewport to 390 x 844
scrollWidth == clientWidth
visual review passes
```

## Visual evidence

Capture before/after screenshots and inspect them. Passing DOM assertions without visual inspection is insufficient.

## Current sandbox limitation

The execution sandbox may block Chromium navigation to localhost/file URLs (the v0.2 gate observed `ERR_BLOCKED_BY_ADMINISTRATOR`). When that occurs, mirror the exact repository HTML/CSS/JS into the sandbox browser with `page.set_content`, injected CSS, and an in-browser bundle of the same modules. The test must still interact with the actual controls and decode a real test WAV.

This workaround is for sandbox transport restrictions only; it does not waive UI testing.

## Merge rule

A PR that modifies UI, audio workflow, schemas, routing, or rendering cannot be merged based only on code review. The corresponding gate must pass and the PR must state the evidence.


## Exact-source parity

Before a browser gate counts, compare Git blob hashes for the branch against the sandbox mirror for all source files involved in the test. Do not allow a manually normalized or stale sandbox copy to pass in place of repository bytes.
