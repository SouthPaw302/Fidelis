# AGENTS.md — Fidelis agent contract

Fidelis is an independent audio project whose core mission is **performance-preserving instrument reconstruction**.

## Prime directive

Do not optimize merely for a prettier waveform. Preserve the musical performance while seeking a higher-fidelity renderer.

## Before changing code

1. Read `README.md`.
2. Read `docs/DEVELOPMENT_PLAN.md`.
3. Read `docs/TESTING.md`.
4. Read the current milestone quality-gate document.
5. Read `docs/ARCHITECTURE.md`.
6. Read `docs/PROJECT_SCHEMA.md` when touching project, part, asset, timeline, reconstruction, reassembly or QC state.
7. Read `docs/PERFORMANCE_SCHEMA.md` when touching analysis or render adapters.
8. Read `docs/ENGINE_REGISTRY.md` when adding or changing engines.
9. Keep the static Vercel/Netlify deployment path working unless the task explicitly replaces it.

## Ownership boundaries

- **Project model** owns source assets, supplied/recovered parts, timeline, reconstruction state, reassembly and QC.
- **Analyzers** observe audio and emit evidence.
- **Jev** judges bounded alternatives. It does not perform DSP.
- **DeepSeek Harness** may plan multi-step experiments. It does not own sample-accurate execution.
- **Render adapters** translate stable project/performance data into an engine-specific control surface.
- **QC** compares outputs and records evidence. It does not silently rewrite accepted artifacts.

## Rules

- Never hard-wire Fidelis to one model family.
- Never require LibertyDJ, LibertasDesktop or AIVideoEdit to run Fidelis.
- Reuse their code/patterns only through clean, documented modules or adapters.
- Keep source stems and rendered outputs out of Git by default.
- Do not commit model binaries unless their license and repository policy explicitly allow it.
- Record model/revision/adapter identity in generated manifests.
- Do not label heuristic articulation estimates as factual bowing/fingering data.
- Prefer versioned JSON contracts between stages.
- Never bypass `fidelis.project.*` for renderer or reassembly work.
- Keep the browser control surface functional without credentials.
- Do not develop features directly on `main`; use a task branch and a gate-backed PR.
- UI/workflow changes require sandbox browser validation and screenshot review before merge.
- The sandbox mirror used for testing must match Git blob hashes for all tested source files.
- Do not advance a milestone while its quality gate is open.

## Validation

At minimum, before a PR:

```bash
npm run check
npm test
```

Then run the mandatory sandbox browser gate in `docs/TESTING.md`. If the sandbox blocks localhost navigation, use the documented exact-source in-memory module workaround. A browser/runtime check is required for UI/workflow changes, not optional.
