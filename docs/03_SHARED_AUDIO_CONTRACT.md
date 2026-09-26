# Shared Audio Contract

Schema: `libertas.audio-project.v0.1`

The shared contract is additive to `fidelis.project.v0.2` and does not replace it.

It carries:

- canonical project ID;
- tempo and beat-grid evidence;
- Google Drive media references;
- source/stem channels;
- mixer state: gain, pan, mute, solo, cue, EQ and future FX;
- clip state: start/end, loop and warp metadata;
- reconstruction selection;
- LibertasDJ handoff metadata.

Current implementation lives in `src/core/shared-audio.js` and is created lazily as `project.sharedAudio`.
