# Roadmap

## v0.1 — reconstruction deck + monophonic performance analysis

- [x] independent Vercel/Netlify-ready GUI
- [x] audio upload/decode/preview
- [x] waveform
- [x] RMS, peak and crest analysis
- [x] monophonic pitch contour
- [x] note segmentation
- [x] initial dynamics / slide / vibrato hints
- [x] `performance.json`
- [x] Jev-compatible deterministic route judgement
- [x] engine registry
- [x] DeepSeek Harness handoff contract
- [x] mandatory sandbox UI gate

## v0.2 — Decompile Project Model

- [x] `fidelis.project.v0.2` contract
- [x] primary full-mix or stem source
- [x] supplied-stem intake
- [x] assets and provenance
- [x] project parts
- [x] performance documents attached per part
- [x] renderer-assignment state
- [x] reconstruction state
- [x] reassembly manifest
- [x] whole-project export
- [x] truthful full-mix boundary (no fake monophonic decomposition)
- [x] desktop/mobile sandbox gate

## v0.3 — Source Decomposition

- [ ] source-decomposer adapter contract implementation
- [ ] evaluate/open adapters for full-mix stem separation
- [ ] recover instrument candidates with confidence/provenance
- [ ] align recovered assets to project timeline
- [ ] let users accept/reject/rename recovered parts
- [ ] attach existing supplied stems as higher-confidence replacements
- [ ] gate decomposition quality on real mixed audio

## v0.4 — Performance Extraction Engines

- [ ] Basic Pitch adapter
- [ ] STRAdi adapter
- [ ] Google DDSP control extraction
- [ ] continuous pitch/loudness fusion
- [ ] per-part analyzer selection
- [ ] analyzer provenance and confidence fusion

## v0.5 — First Real Reconstruction

- [ ] Instrudio renderer adapter
- [ ] RAVE / Scyclone adapter
- [ ] BRAVE adapter
- [ ] Google DDSP renderer adapter
- [ ] Sony/WaveTransfer experiments where practical
- [ ] produce reconstructed audio assets
- [ ] preserve original and candidate assets side by side

## v0.6 — Reassembly + QC

- [ ] timeline/sample alignment
- [ ] reconstructed/original per-part switching
- [ ] gain/pan/offset controls
- [ ] candidate render upload
- [ ] pitch-contour preservation score
- [ ] loudness-envelope preservation score
- [ ] transient/crest comparison
- [ ] spectral-detail comparison
- [ ] blind A/B interface
- [ ] final reassembly render
- [ ] reproducible run/QC manifest

## Later

- learned performance encoder
- per-note pitch/loudness envelopes
- articulation probability vectors
- renderer-specific gesture translation
- wider instrument families
- optional worker/job infrastructure
- Jev service adapter
- DeepSeek Harness multi-route experiment planning
