import assert from 'node:assert/strict';
import { analyzeSignal } from '../src/audio/analyze.js';
import { judgeRoutes } from '../src/core/jev.js';
import { buildPerformanceDocument, PERFORMANCE_SCHEMA } from '../src/core/schema.js';

const sampleRate = 44100;
const seconds = 2;
const pcm = new Float32Array(sampleRate * seconds);
let phase = 0;
for (let i = 0; i < pcm.length; i++) {
  const t = i / sampleRate;
  const cents = 12 * Math.sin(2 * Math.PI * 5 * t);
  const hz = 440 * Math.pow(2, cents / 1200);
  phase += 2 * Math.PI * hz / sampleRate;
  pcm[i] = 0.2 * Math.sin(phase);
}
const buffer = { length: pcm.length, sampleRate, duration: seconds, numberOfChannels: 1, getChannelData(){ return pcm; } };
const result = analyzeSignal(buffer, 'full');
assert.ok(result.summary.rms > .1 && result.summary.rms < .2);
assert.ok(result.pitchFrames.length > 20);
assert.ok(result.notes.length > 0);
const routes = judgeRoutes({ instrument:'fiddle', analysis:result.summary, notes:result.notes });
assert.equal(routes[0].id, 'physical');
const doc = buildPerformanceDocument({ fileName:'fixture.wav', instrument:'fiddle', analysis:result.summary, notes:result.notes, pitchFrames:result.pitchFrames });
assert.equal(doc.schema, PERFORMANCE_SCHEMA);
console.log('FIDELIS FRONTEND DSP SMOKE: PASS');
