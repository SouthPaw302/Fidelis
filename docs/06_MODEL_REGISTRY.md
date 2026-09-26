# Model Registry Direction

Every engine entry should record: purpose, source, license, model/revision, size, runtime, CPU/GPU needs, browser/native support, status and fallback.

Current protected slots include Demucs, Basic Pitch, STRAdi, DDSP, RAVE/Scyclone, BRAVE, Sony Diffusion Timbre Transfer, WaveTransfer and Instrudio.

Planned separation expansion includes RoFormer/MDX-class models behind the same source-decomposer role. Embedded execution should prefer ONNX/WebGPU/WASM or TFLite when practical. The UI should expose simple choices such as Fast / Balanced / Best Quality rather than forcing model jargon on normal users.
