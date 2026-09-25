# AGENTS.md — Fidelis agent contract

Fidelis is an independent audio project whose core mission is **performance-preserving instrument reconstruction**.

## Prime directive

Do not optimize merely for a prettier waveform. Preserve the musical performance while seeking a higher-fidelity renderer.

## Before changing code

1. Read `README.md`.\n2. Read `docs/DEVELOPMENT_PLAN.md`.\n3. Read `docs/TESTING.md`.\n4. Check `docs/QUALITY_GATE_PREALPHA.md` while the project is pre-pre-alpha.
2. Read `docs/ARCHITECTURE.md`.
3. Read `docs/PERFORMANCE_SCHEMA.md` if touching analysis or render adapters.
4. Read `docs/ENGINE_REGISTRY.md` if adding/changing engines.
5. Keep the static Vercel/Netlify deployment path working unless the task explicitly replaces it.

## Ownership boundaries

- **Analyzers** observe audio and emit evidence.
- **Jev** judges bounded alternatives. It does not perform DSP.
- **DeepSeek Harness** may plan multi-step experiments. It does not own sample-accurate execution.
- **Render adapters** translate stable performance data into an engine-specific control surface.
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
- Keep browser v0 functional without credentials.
- Do not develop features directly on `main`; use a task branch and a gate-backed PR.
- UI/workflow changes require sandbox browser validation and screenshot review before merge.
- Do not advance a milestone while its quality gate is open.

## Validation

At minimum, before committing:

```bash
node --check src/app.js
node --check src/audio/analyze.js
node --check src/audio/pitch.js
node --check src/core/engines.js
node --check src/core/jev.js
node --check src/core/schema.js
node --check src/orchestrator/deepseek.js
python -m http.server 4173
```

Then run the mandatory sandbox browser gate in `docs/TESTING.md`. If the sandbox blocks localhost navigation, use the documented in-browser injection workaround. A browser/runtime check is required for UI/workflow changes, not optional.
