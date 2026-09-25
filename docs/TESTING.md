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

The synthetic fiddle test must confirm that:

- signal analysis produces plausible RMS;
- voiced pitch frames are recovered;
- performance events are produced;
- fiddle evidence routes to the physical reconstruction path;
- a valid `performance.json` document is created.

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
route cards == 3
pitch frame count > 0
event count > 0
export button enabled
results table visible
empty state hidden
active workflow stage == REBUILD
browser/page errors == 0

switch viewport to 390 x 844
scrollWidth == clientWidth
visual review passes
```

## Visual evidence

Capture before/after screenshots and inspect them. Passing DOM assertions without visual inspection is insufficient.

## Current sandbox limitation

The execution sandbox may block Chromium navigation to localhost/file URLs. When that occurs, mirror the exact repository HTML/CSS/JS into the sandbox browser with `page.set_content`, injected CSS, and an in-browser bundle of the same modules. The test must still interact with the actual controls and decode a real test WAV.

This workaround is for sandbox transport restrictions only; it does not waive UI testing.

## Merge rule

A PR that modifies UI, audio workflow, schemas, routing, or rendering cannot be merged based only on code review. The corresponding gate must pass and the PR must state the evidence.
