# Fidelis Development Plan

Fidelis is currently **pre-pre-alpha**. The project does not advance to the next milestone until the current quality gate passes.

## Product target

Fidelis is not a stem analyzer. The target system is:

```text
full song or stems
  -> decompile musical system
  -> recover instrument/performance parts
  -> reconstruct each part with improved samples/models/renderers
  -> reassemble song
  -> compare against source
```

Stems are an optimization when available, not an architectural requirement.

## Branch discipline

1. `main` is the last accepted gate.
2. Every change starts on a task branch.
3. One coherent objective per branch.
4. No direct feature work on `main`.
5. A branch must pass the required gate before merge.
6. Experimental engine work stays isolated behind adapters.
7. Failed experiments may remain documented but must not be promoted as working capability.

Branch naming:

- `dev/<milestone>`
- `feature/<capability>`
- `fix/<defect>`
- `experiment/<engine>`

## Required development sequence

Every agent or developer must follow this order:

1. Read `AGENTS.md`, this file, architecture and relevant schemas.
2. Inspect the current branch and repository before proposing changes.
3. State the exact scope and what is explicitly out of scope.
4. Create/use a task branch.
5. Implement the smallest coherent change.
6. Run static checks.
7. Run deterministic tests.
8. Run the sandbox UI gate when UI/workflow code changed.
9. Record defects discovered during testing.
10. Fix gate-blocking defects only; do not expand scope.
11. Re-run the full gate from the beginning.
12. Open a PR with test evidence.
13. Merge only after the gate passes.

## Pre-pre-alpha gate

The current milestone must prove that the reconstruction deck is a truthful and functional chassis.

### Required functional checks

- App shell renders.
- No JavaScript/page errors.
- Engine registry renders.
- Audio file can be selected.
- Audio decodes.
- Waveform renders.
- Decompile control becomes available.
- Decompile creates pitch/performance events.
- Telemetry updates.
- Rebuild routes render.
- Export map becomes available.
- Empty state is removed when results exist.
- Workflow indicator advances correctly.
- Layout has no horizontal page overflow at desktop or 390 px mobile width.

### Required visual checks

Review screenshots at:

- 1440 x 1000 before source load.
- 1440 x 1000 after decompile.
- 390 x 844 after decompile.

Reject the gate for:

- overlapping UI;
- unreadable text;
- fake controls;
- stale empty/loading states;
- clipped primary actions;
- misleading capability labels;
- horizontal page overflow;
- console/page errors.

## Capability truth rule

The interface must distinguish:

- **working now**;
- **adapter registered**;
- **planned**;
- **experimental**.

Do not make a route look executable if it is only registered.

## Next milestone

Only after this gate is accepted:

**Decompile Project Model v0.2**

The next architecture must represent a whole musical project rather than a single monophonic note stream:

- source mix;
- optional supplied stems;
- detected/recovered parts;
- timeline;
- tempo/beat/phrase map;
- performance documents per part;
- renderer assignment per part;
- reconstructed assets;
- mix/reassembly manifest;
- provenance and QC.

No renderer integration should bypass that project model.
