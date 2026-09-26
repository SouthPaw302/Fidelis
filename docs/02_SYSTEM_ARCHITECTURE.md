# System Architecture

## Stable core

- `fidelis.project.v0.2`
- performance documents
- Jev bounded routing
- DeepSeek Harness planning seam
- worker protocol
- render/QC/reassembly backend

## Surgery layers

`Media → Shared Audio Contract → Mixer/Timeline → Reconstruction Core → LibertasDJ Handoff`

Deterministic audio code owns sample-accurate timing, gain, pan, looping, DSP and transport. AI/model workers analyze, separate, transcribe or create bounded reconstruction candidates.

The browser can remain the control surface. Heavy models may run in local/LAN/cloud workers. Google Drive is the temporary durable media store; GitHub stores code, docs and small manifests.
