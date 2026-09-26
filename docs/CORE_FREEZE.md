# Fidelis Core Freeze — Surgery Baseline

Status: **FROZEN CONTRACT**

This freeze establishes the current Fidelis reconstruction core as the baseline for the mixing-deck surgery. New mixer, timeline, Drive, stem, loop, DSP, embedded-model, and LibertasDJ work must extend this core rather than silently replace it.

## Protected contracts

1. `fidelis.project.v0.2` project model and its core operations:
   - primary source registration;
   - supplied stems;
   - recovered parts and performance maps;
   - renderer assignment;
   - reassembly manifest;
   - project validation.
2. Jev remains a bounded route judge. It does not execute DSP.
3. DeepSeek Harness remains a planner/orchestrator seam. It does not own sample-accurate execution.
4. The worker protocol retains the bounded operations `decompose`, `analyze`, `render`, and `timbre_transfer`.
5. Existing worker slots remain available for Demucs, Basic Pitch, STRAdi, DDSP, RAVE, BRAVE, Sony DTT, WaveTransfer, and Instrudio.
6. Existing backend project/decomposition/analysis/routing/render/QC/reassembly/artifact/harness endpoints remain available until intentionally versioned or migrated.

## Allowed surgery

The freeze does **not** prohibit improvements. The following may be added without breaking the freeze:

- mixer channels and DSP;
- editable waveforms and timeline clips;
- BPM, beat-grid and loop contracts;
- Drive media references;
- improved stem engines and model registry entries;
- instrument rebuild engines;
- LibertasDJ shared contracts and deck handoff;
- browser/native/WebGPU/WASM execution paths;
- new versioned project fields with backward-compatible defaults.

## Breaking-change rule

A protected contract may change only when all of the following are true:

1. the replacement is documented;
2. a migration path exists for current project state;
3. the relevant schema/protocol version is bumped when compatibility changes;
4. the core-freeze gates are updated intentionally in the same change;
5. existing accepted media is never silently replaced.

## Mandatory gate

Run before merging surgery work:

```bash
npm test
bash backend/tests/run_all.sh
```

The tests include explicit core-freeze checks. A failure means the surgery crossed a protected boundary and must either be corrected or handled as an intentional versioned migration.
