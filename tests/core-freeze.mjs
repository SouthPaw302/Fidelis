import assert from 'node:assert/strict';
import {
  PROJECT_SCHEMA,
  createProject,
  addPrimarySource,
  addSuppliedStem,
  attachRecoveredPart,
  attachPerformanceToPart,
  assignRenderer,
  buildReassemblyManifest,
  summarizeProject,
  validateProject,
} from '../src/core/project.js';
import { judgeRoutes } from '../src/core/jev.js';
import { ENGINES, ROUTES } from '../src/core/engines.js';
import { HARNESS_SCHEMA, buildHarnessRequest } from '../src/orchestrator/deepseek.js';

assert.equal(PROJECT_SCHEMA, 'fidelis.project.v0.2');

const project = createProject({ name: 'Core Freeze', sourceKind: 'full_mix', createdAt: '2026-09-25T00:00:00.000Z' });
const primary = addPrimarySource(project, { fileName: 'mix.wav', size: 100, durationSec: 8, sampleRate: 48000, channels: 2 });
const stem = addSuppliedStem(project, { fileName: 'fiddle.wav', size: 50, durationSec: 8, sampleRate: 48000, channels: 1 }, { instrument: 'fiddle' });
const perf = { schema: 'fidelis.performance.v0.1', source: { file: 'fiddle.wav' }, analysis: {}, performance: [{ start: 0, duration: 1, note: 'A4' }], pitchContour: [] };
attachPerformanceToPart(project, stem.id, perf);
const recovered = attachRecoveredPart(project, { instrument: 'fiddle', sourceAssetId: primary.id, performance: perf });
assignRenderer(project, recovered.id, { adapterId: 'instrudio' });
const manifest = buildReassemblyManifest(project);
const summary = summarizeProject(project);

assert.equal(validateProject(project).valid, true);
assert.equal(project.source.primaryAssetId, primary.id);
assert.equal(project.source.suppliedStemAssetIds.length, 1);
assert.equal(summary.performanceMaps, 2);
assert.equal(summary.rendererAssignments, 1);
assert.equal(manifest.status, 'planned');
assert.equal(manifest.tracks.length, 2);

assert.deepEqual(Object.keys(ROUTES).sort(), ['ddsp', 'direct', 'physical']);
const routes = judgeRoutes({ instrument: 'fiddle', analysis: { totalFrames: 100, voicedFrames: 60, crestFactor: 3 }, notes: [1, 2, 3] });
assert.equal(routes.length, 3);
assert.equal(routes[0].id, 'physical');
assert.equal(routes.filter(r => r.recommended).length, 1);

for (const id of ['rave','brave','sony-diffusion','wavetransfer','ddsp','basic-pitch','stradi','instrudio','libertydj','libertas']) {
  assert.ok(ENGINES.some(engine => engine.id === id), `missing protected engine slot: ${id}`);
}

assert.equal(HARNESS_SCHEMA, 'fidelis.harness-request.v0.1');
const harness = buildHarnessRequest({ performance: perf, instrument: 'fiddle', availableEngines: ['instrudio'] });
assert.equal(harness.schema, HARNESS_SCHEMA);
assert.ok(harness.constraints.some(x => x.includes('deterministic DSP executes')));
assert.deepEqual(harness.requestedOutputs, ['route plan', 'adapter sequence', 'expected artifacts', 'QC plan']);

console.log('FIDELIS CORE FREEZE JS: PASS');
