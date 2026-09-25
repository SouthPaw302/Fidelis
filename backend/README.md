# Fidelis backend

The Fidelis backend is the authoritative production engine for projects, jobs, artifacts, model capability state, performance extraction, route decisions, rendering, QC and reassembly.

## Run

From the repository root:

```bash
pip install -r requirements.txt
PYTHONPATH=backend python -m fidelis_backend
```

Default endpoint: `http://127.0.0.1:8787`.

## Ready native capabilities

- `fidelis-native-performance` — pYIN/gesture performance analyzer.
- `instrudio-native` — MIT-licensed Instrudio Studio Violin model translated into an offline backend renderer.
- `fidelis-physical-violin` — independent physical-model comparison renderer.
- `fidelis-reference-synth` — pipeline-test fallback, explicitly not a fidelity target.
- `fidelis-qc` — source/candidate comparison metrics.
- `jev` — bounded route judge.

DeepSeek Harness is exposed through an MCP stdio bridge and an optional external planning endpoint. Without an external planner the backend uses deterministic planning while keeping the same contract.

## Full-mix decomposition

Demucs / HTDemucs is the first source-decomposer adapter. The executable may be installed while the model remains blocked. Fidelis requires the verified `955717e8` checkpoint before marking local HTDemucs ready. It can also use `FIDELIS_DEMUCS_URL` for a remote decomposition worker.

## External workers

The provider-neutral worker protocol supports Basic Pitch, STRAdi, DDSP, RAVE/Scyclone, BRAVE, Sony Diffusion Timbre Transfer, WaveTransfer, external Instrudio and Demucs. See `WORKER_PROTOCOL.md` and `ENVIRONMENT.md`.

## Authority rule

Model/harness code may observe, plan and return artifacts, but project state is changed only by Fidelis orchestration and storage code. Renderers do not own the project document.

## Tests

```bash
bash backend/tests/run_all.sh
PYTHONPATH=backend python backend/tests/ui_backend_gate.py
```

The browser gate exercises the real FastAPI backend through upload → analyze/decompose → Jev → render → QC → reassembly and checks capability truth plus mobile layout.
