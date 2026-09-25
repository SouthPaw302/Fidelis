# Fidelis worker protocol v0.1

Fidelis core does not embed every research repository. Heavy or specialized engines can run as local, LAN, GPU-cloud, or hosted workers behind one adapter contract.

Configure an exact execute endpoint with one of:

- `FIDELIS_DEMUCS_URL`
- `FIDELIS_BASIC_PITCH_URL`
- `FIDELIS_STRADI_URL`
- `FIDELIS_DDSP_URL`
- `FIDELIS_RAVE_URL`
- `FIDELIS_BRAVE_URL`
- `FIDELIS_SONY_DTT_URL`
- `FIDELIS_WAVETRANSFER_URL`
- `FIDELIS_INSTRUDIO_URL`

The core sends `multipart/form-data`:

- `request`: `application/json`
- `source`: optional input audio
- `performance`: optional `fidelis.performance.*` JSON

`request.json`:

```json
{
  "schema": "fidelis.worker-request.v0.1",
  "engineId": "instrudio",
  "operation": "render",
  "projectId": "project_...",
  "partId": "part_...",
  "options": {}
}
```

Operations:

- `decompose`: Demucs/source-separation worker. Return JSON `fidelis.decomposition.v0.1` with `status=complete` and a `stems` array. Each stem must contain `name`, `fileName`, and one materialization source: `downloadUrl`, `audioBase64`, or a path visible to the Fidelis backend.
- `analyze`: Basic Pitch / STRAdi style performance extraction. Return JSON containing `performance` or a top-level `fidelis.performance.*` document.
- `render`: DDSP / Instrudio style performance-driven rendering. Return audio bytes.
- `timbre_transfer`: RAVE / BRAVE / Sony / WaveTransfer source-audio transformation. Return audio bytes.

Example decomposition result:

```json
{
  "schema": "fidelis.decomposition.v0.1",
  "status": "complete",
  "adapter": {"id": "demucs", "model": "htdemucs"},
  "stems": [
    {"name": "vocals", "fileName": "vocals.wav", "downloadUrl": "https://worker.example/jobs/123/vocals.wav"},
    {"name": "drums", "fileName": "drums.wav", "downloadUrl": "https://worker.example/jobs/123/drums.wav"},
    {"name": "bass", "fileName": "bass.wav", "downloadUrl": "https://worker.example/jobs/123/bass.wav"},
    {"name": "other", "fileName": "other.wav", "downloadUrl": "https://worker.example/jobs/123/other.wav"}
  ]
}
```

Audio render/transfer responses should use `audio/wav` where possible. JSON responses use `application/json`.

The worker is not project authority. It performs one bounded operation and returns artifacts/evidence. Fidelis downloads/registers returned audio, records SHA-256 provenance, and mutates project state itself.
