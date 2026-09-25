# Fidelis backend architecture

## Authority model

```text
Web deck / agent / Harness
          |
          v
      FastAPI / MCP
          |
          v
   Project + job store       <- authoritative state
          |
   +------+-------+
   |              |
  Jev       DeepSeek Harness <- judgement/planning only
   |              |
   +------+-------+
          v
 deterministic adapter execution
          |
   artifacts + provenance
          |
  QC + reassembly
```

The backend project document is authoritative. Model services never own the project.

## Persistence

- SQLite: projects, jobs, artifact metadata.
- Filesystem/object-store seam: audio, performance maps, QC reports, reconstructed candidates, masters.
- SHA-256 is recorded for every registered artifact.

The current implementation uses local filesystem artifacts. The storage class is intentionally isolated so S3/R2/Blob storage can replace it without changing audio adapters.

## Execution

Jobs use a bounded thread pool in pre-alpha. Each job records queued/running/complete/failed state. A distributed queue can later replace the runner without changing API contracts.

## Engine roles

- Demucs / HTDemucs: source decomposition, either verified local checkpoint or remote worker.
- Fidelis native (Librosa pYIN): executable monophonic performance extraction in the sandbox.
- Basic Pitch / STRAdi: preferred transcription adapters when configured.
- RAVE / BRAVE / Sony / WaveTransfer: direct timbre-transfer workers.
- DDSP: structured synthesis worker.
- Instrudio Native: MIT-licensed offline adaptation of the Studio Violin physical-model contract, pinned to an upstream commit/license path.
- Fidelis Physical Violin: independent secondary violin/fiddle renderer; produces a new waveform without source-waveform reuse.
- Instrudio: optional external violin renderer worker.
- Fidelis reference synth: pipeline test only, never represented as the target fidelity solution.
- Fidelis QC: amplitude-envelope, onset-envelope, and spectral evidence.

## Orchestration

Jev records both:

1. desired reconstruction family; and
2. currently executable adapter.

This prevents a missing model from silently changing the intended production route.

DeepSeek Harness is optional. Fidelis exposes an MCP stdio server following the same provider-neutral pattern used by AIVideoEdit. Harness can read context, plan, route, and request autopilot; deterministic backend code still executes audio work.
