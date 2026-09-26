import assert from 'node:assert/strict';
import { createProject, addPrimarySource, addSuppliedStem } from '../src/core/project.js';
import {
  SHARED_AUDIO_SCHEMA,
  ensureSharedAudio,
  setTempo,
  updateChannelMixer,
  setChannelLoop,
  setDriveMediaRef,
  buildLibertasHandoff,
  validateSharedAudio,
} from '../src/core/shared-audio.js';

const project = createProject({ name: 'Surgery Gate', sourceKind: 'full_mix', createdAt: '2026-09-25T00:00:00.000Z' });
const source = addPrimarySource(project, { fileName: 'song.wav', durationSec: 120, sampleRate: 48000, channels: 2 });
const stem = addSuppliedStem(project, { fileName: 'bass.wav', durationSec: 120, sampleRate: 48000, channels: 2 }, { instrument: 'bass', label: 'Bass' });

const shared = ensureSharedAudio(project);
assert.equal(shared.schema, SHARED_AUDIO_SCHEMA);
assert.equal(shared.channels.length, 2);
assert.equal(shared.channels[0].kind, 'source');
assert.equal(shared.channels[1].partId, stem.id);

setTempo(project, 128);
assert.equal(project.timeline.tempo.bpm, 128);
assert.equal(project.sharedAudio.tempo.bpm, 128);

const bass = shared.channels.find(channel => channel.partId === stem.id);
updateChannelMixer(project, bass.id, { gainDb: -3.5, pan: -.25, solo: true, eq: { lowDb: 2.5 } });
assert.equal(bass.mixer.gainDb, -3.5);
assert.equal(bass.mixer.pan, -.25);
assert.equal(bass.mixer.solo, true);
assert.equal(bass.mixer.eq.lowDb, 2.5);

setChannelLoop(project, bass.id, { enabled: true, bars: 8, snap: true });
assert.equal(bass.clip.loop.bars, 8);
assert.equal(bass.clip.loop.enabled, true);

setDriveMediaRef(project, source.id, { fileId: 'drive-file-1', name: 'song.wav', mimeType: 'audio/wav' });
const handoff = buildLibertasHandoff(project, bass.id, 'B');
assert.equal(handoff.schema, 'libertas.deck-handoff.v0.1');
assert.equal(handoff.deck, 'B');
assert.equal(handoff.tempo.bpm, 128);
assert.equal(handoff.channel.mixer.gainDb, -3.5);
assert.equal(validateSharedAudio(project).valid, true);

console.log('FIDELIS SHARED AUDIO CONTRACT: PASS');
