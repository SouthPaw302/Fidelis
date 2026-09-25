import assert from 'node:assert/strict';
import {
  PROJECT_SCHEMA,
  createProject,
  addPrimarySource,
  addSuppliedStem,
  attachRecoveredPart,
  assignRenderer,
  buildReassemblyManifest,
  summarizeProject,
  validateProject,
  inferInstrumentFromFileName,
} from '../src/core/project.js';

const project = createProject({
  name: 'El Viento trae tu nombre',
  sourceKind: 'full_mix',
  createdAt: '2026-09-25T00:00:00.000Z',
});

assert.equal(project.schema, PROJECT_SCHEMA);
assert.equal(project.source.kind, 'full_mix');

const source = addPrimarySource(project, {
  fileName: 'master.wav',
  size: 123456,
  durationSec: 182.25,
  sampleRate: 48000,
  channels: 2,
});
assert.equal(project.source.primaryAssetId, source.id);
assert.equal(project.timeline.durationSec, 182.25);

const fiddlePart = addSuppliedStem(project, {
  fileName: 'Fiddle Stem.wav',
  durationSec: 182.25,
  sampleRate: 48000,
  channels: 2,
}, { instrument: inferInstrumentFromFileName('Fiddle Stem.wav') });

const drumsPart = addSuppliedStem(project, {
  fileName: 'drums.wav',
  durationSec: 182.25,
  sampleRate: 48000,
  channels: 2,
}, { instrument: inferInstrumentFromFileName('drums.wav') });

assert.equal(fiddlePart.instrument, 'fiddle');
assert.equal(drumsPart.instrument, 'drums');
assert.equal(project.parts.length, 2);

const recovered = attachRecoveredPart(project, {
  instrument: 'fiddle',
  sourceAssetId: fiddlePart.sourceAssetId,
  performance: {
    schema: 'fidelis.performance.v0.1',
    source: { file: 'Fiddle Stem.wav' },
    performance: [{ start: 0, duration: 1, note: 'A4' }],
    pitchContour: [],
  },
});
assignRenderer(project, recovered.id, { adapterId: 'instrudio', preset: 'studio-violin' });

const reassembly = buildReassemblyManifest(project);
assert.equal(reassembly.status, 'planned');
assert.equal(reassembly.tracks.length, 3);

const summary = summarizeProject(project);
assert.equal(summary.assets, 3);
assert.equal(summary.suppliedStems, 2);
assert.equal(summary.parts, 3);
assert.equal(summary.performanceMaps, 1);
assert.equal(summary.rendererAssignments, 1);

const validation = validateProject(project);
assert.equal(validation.valid, true, validation.errors.join(', '));

const broken = structuredClone(project);
broken.parts[0].sourceAssetId = 'asset_missing';
assert.equal(validateProject(broken).valid, false);

console.log('FIDELIS PROJECT MODEL: PASS');
console.log(JSON.stringify(summary, null, 2));
