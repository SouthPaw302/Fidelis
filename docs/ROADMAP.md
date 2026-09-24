# Roadmap

## v0.1 — product skeleton + real browser analysis

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
- [x] DeepSeek Harness HTTP adapter contract

## v0.2 — benchmark harness

- [ ] candidate render upload
- [ ] source/candidate alignment
- [ ] pitch-contour preservation score
- [ ] loudness-envelope preservation score
- [ ] transient/crest comparison
- [ ] spectral-detail comparison
- [ ] blind A/B interface
- [ ] run manifest export

## v0.3 — first external engines

- [ ] Basic Pitch adapter
- [ ] STRAdi adapter
- [ ] Google DDSP adapter
- [ ] RAVE/Scyclone adapter
- [ ] BRAVE adapter
- [ ] Instrudio renderer adapter

## v0.4 — worker orchestration

- [ ] provider-neutral job API
- [ ] artifact storage
- [ ] queue / retries
- [ ] Jev service adapter
- [ ] DeepSeek Harness planner
- [ ] reproducible experiment manifests

## v0.5 — reconstruction quality

- [ ] learned performance encoder
- [ ] per-note pitch/loudness envelopes
- [ ] articulation probabilities
- [ ] renderer-specific gesture translation
- [ ] instrument families beyond violin
