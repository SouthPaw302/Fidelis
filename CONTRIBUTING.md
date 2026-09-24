# Contributing

Fidelis welcomes work on analyzers, adapters, renderers, QC and usability.

## Development philosophy

Keep the product independent and the engines replaceable. A contribution that improves one engine should not make every other route harder to use.

## Before a pull request

1. Read `AGENTS.md` and the architecture docs.
2. Keep browser v0 usable without credentials.
3. Do not commit test music or model binaries unless redistribution is explicitly allowed.
4. Add provenance and license notes for third-party models/code.
5. Keep generated performance artifacts versioned.
6. Run the syntax checks in `AGENTS.md`.

## Adding an engine

Document:

- upstream project and license;
- exact version/revision tested;
- install/hydration steps;
- CPU/GPU/runtime requirements;
- accepted input types;
- emitted output/artifacts;
- failure modes and fallback behavior.
