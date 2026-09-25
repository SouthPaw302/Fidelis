# Backend authority gate — sandbox checkpoint

Status: **PASS**

This checkpoint is sandbox-only and has not been pushed to the Fidelis GitHub repository.

## Gates passed

- `npm run check`
- `npm test`
- `backend/tests/backend_gate.py`
- `backend/tests/mcp_selftest.py` — 7 MCP tools
- `backend/tests/remote_worker_gate.py` — remote RAVE and Demucs worker transports
- `backend/tests/ui_backend_gate.py` — real FastAPI authority exercised from Chromium
- out-of-process Uvicorn health/API service
- desktop and 390px mobile visual/state gate

## Real stem path exercised

```text
WAV upload
  -> project/asset persistence
  -> native pYIN performance extraction
  -> Jev route = physical
  -> execution adapter = instrudio-native
  -> new 48 kHz candidate WAV (source waveform not reused)
  -> QC report
  -> reassembly
  -> downloadable RIFF/WAV master
```

The final UI gate showed `instrudio-native` as the executing adapter and completed Steps 1–5 with no browser/page errors or page-level horizontal overflow.

## Full-mix truth gate

Demucs 4 is installed. The expected HTDemucs checkpoint `955717e8-8726e21a.th` is not cached. The sandbox cannot resolve the official Meta/Hugging Face model hosts, so automatic hydration could not be completed here.

Expected checkpoint SHA-256:

`8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4`

Fidelis therefore reports Demucs as **blocked**, produces zero fabricated stems, and exposes a checkpoint import path in the deck/API.

## Instrudio integration

`instrudio-native` is a backend translation of the MIT-licensed Studio Violin physical-model contract from `GareBear99/Instrudio` v2. The vendored definition metadata and MIT license are under `backend/vendor/instrudio/`. Render artifacts record upstream/version/license provenance and `sourceWaveformReuse: false`.

## Capability truth in this sandbox

Ready:

- Fidelis Native Performance Analyzer
- Instrudio Studio Violin native backend adapter
- Fidelis Physical Violin comparator
- Fidelis Reference Synth (pipeline fallback only)
- Fidelis QC
- Jev bounded route judge

Experimental:

- DeepSeek Harness launcher/bridge unless a real external Harness endpoint/profile is configured

Blocked/unavailable until supplied locally or through worker URLs:

- HTDemucs checkpoint
- Basic Pitch
- STRAdi
- Google DDSP
- RAVE / Scyclone
- BRAVE
- Sony Diffusion Timbre Transfer
- WaveTransfer
- external Instrudio worker

All of those have provider-neutral worker slots; unavailable models are not presented as executable.
