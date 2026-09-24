# Engine registry

Fidelis treats external systems as replaceable engines, not architectural dependencies.

| Engine | Class | Intended role |
| --- | --- | --- |
| Scyclone / RAVE | TimbreTransfer | Direct performance-preserving audio-to-audio baseline. |
| BRAVE | TimbreTransfer | Low-latency instrumental timbre-transfer route. |
| Sony Diffusion Timbre Transfer | TimbreTransfer | Diffusion-based direct transfer benchmark. |
| WaveTransfer | TimbreTransfer | Multi-instrument diffusion transfer benchmark. |
| Google DDSP | PerformanceAnalyzer / Renderer | Structured F0/loudness/timbre reconstruction. |
| MIDI-DDSP | Architecture reference | Score → performance → synthesis separation. |
| Basic Pitch | Transcriber | General audio-to-notes/pitch-bend evidence. |
| STRAdi | Transcriber | Violin-specific note/pitch evidence. |
| Instrudio Studio Violin | Renderer | Open physical-model violin target. |
| LibertyDJ intelligence | Ecosystem source | Embedded-model runtime patterns and musical perception. |
| LibertasDesktop | Ecosystem source | PCM, stems, native audio and DSP patterns. |
| AIVideoEdit | Ecosystem source | Deterministic analysis/QC and orchestration patterns. |

## Adapter rule

An adapter owns engine-specific installation, process invocation, model identity, input conversion and output parsing. The rest of Fidelis should see a stable request/response contract.

## Model assets

Large model files should be hydrated at deploy/runtime or stored in model/object storage. They should not be casually committed to Git.
