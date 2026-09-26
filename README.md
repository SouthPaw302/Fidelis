# Fidelis

**A performance-preserving reconstruction core growing into a shared AI-assisted mixing deck for Fidelis and LibertasDJ.**

## Product direction

`LOAD → SPLIT/ATTACH STEMS → MIX → LOOP/EDIT → REBUILD INSTRUMENT → A/B → LIBERTASDJ → EXPORT`

Fidelis keeps the existing `fidelis.project.v0.2` reconstruction core and adds a backward-compatible shared audio contract for mixer, clip, tempo, Drive-media and LibertasDJ state. See `docs/CORE_FREEZE.md` before changing protected core behavior.

## Truth map

### Working in the current browser build

- local audio import and waveform decode;
- full-mix project registration;
- supplied-stem attachment;
- monophonic performance mapping;
- Jev route ranking;
- project/performance export;
- shared audio contract and stateful source/stem mixer controls.

### Backend exists but the rolled-back browser frontend does not currently drive it

- FastAPI project/job/artifact authority;
- Demucs decomposition seam;
- backend analysis/render/QC/reassembly;
- Instrudio/native violin renderers;
- external worker and DeepSeek/Jev integration paths.

### Not yet claimed as working

- audible multichannel mixer DSP routing;
- automatic separation from the deployed browser GUI;
- Google Drive media transfer;
- canonical beat/downbeat grid and looping engine;
- actual LibertasDJ Deck A/B handoff;
- general real-instrument reconstruction for every stem.

## Architecture

The frozen reconstruction core remains authoritative for project/performance/reconstruction semantics. `project.sharedAudio` (`libertas.audio-project.v0.1`) carries mixer/clip/tempo/media/handoff state without replacing the core project schema.

Read in order:

1. `docs/CORE_FREEZE.md`
2. `docs/00_VISION.md`
3. `docs/07_CURRENT_BUILD_STATUS.md`
4. `docs/03_SHARED_AUDIO_CONTRACT.md`
5. `docs/04_FIDELIS_LIBERTAS_SYNC.md`
6. `docs/08_SURGERY_ROADMAP.md`

## Validation

```bash
npm run check
npm test
bash backend/tests/run_all.sh
```

GitHub stores code/docs/manifests. Google Drive is the planned temporary durable media store for large source audio, stems, reconstructed parts and masters.
