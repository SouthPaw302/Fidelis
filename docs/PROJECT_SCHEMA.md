# Project schema

Current schema: `fidelis.project.v0.2`

The project document is the canonical whole-song state. It lets source decomposition, performance extraction, rendering, reassembly and QC evolve independently without losing provenance.

## Top-level shape

```json
{
  "schema": "fidelis.project.v0.2",
  "project": {},
  "source": {},
  "assets": [],
  "timeline": {},
  "parts": [],
  "reassembly": {},
  "qc": {},
  "provenance": {}
}
```

## Source

`source.kind` is either:

- `full_mix` — a polyphonic master that still requires decomposition; or
- `stem` — an isolated or mostly isolated source suitable for a part analyzer.

The source stores the canonical primary asset plus optional user-supplied stem asset IDs.

## Assets

Every audio file is an asset with a deterministic ID, role, original file name, MIME type, byte size when known, duration, sample rate, channels and provenance. A checksum slot is reserved for production storage.

Git is not the audio store. Project manifests reference assets while production storage will hold the bytes.

## Timeline

The timeline currently carries project duration, canonical sample rate, tempo placeholder, beat list and phrase list. Beat/phrase recovery is intentionally a stable empty contract in v0.2 so existing LibertyDJ/AIVideoEdit-style analyzers can attach evidence later without restructuring the project.

## Parts

A part represents an instrument/performance lane, supplied or recovered.

Each part owns:

- ID and label;
- instrument class;
- origin;
- source asset;
- state;
- optional `fidelis.performance.*` document;
- renderer assignment;
- reconstruction output state.

A supplied stem becomes a part immediately. A full mix does **not** become fake parts merely because a monophonic pitch detector finds a periodic signal.

## Renderer assignment

Renderer state is recorded per part:

```json
{
  "status": "assigned",
  "adapterId": "instrudio",
  "preset": "studio-violin"
}
```

Assignment does not imply rendering has occurred.

## Reconstruction

Each part tracks whether a reconstructed asset exists. Until then:

```json
{
  "status": "not-started",
  "assetId": null
}
```

## Reassembly

`buildReassemblyManifest()` creates one track entry per project part. It selects a reconstructed asset only when one exists; otherwise it points at the part source asset.

That permits incremental replacement: one instrument can be reconstructed while every other part remains original.

## QC

QC state is part of the project contract before objective comparison is implemented. Future checks attach here instead of living only in logs.

## Validation

`validateProject()` currently verifies schema identity, project ID, asset/part collections, reassembly presence, primary-source references and part-to-asset references. Validation grows additively as the contract matures.
