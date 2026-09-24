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

const buffer = {
  length: pcm.length,
  sampleRate,
  duration: seconds,
  numberOfChannels: 1,
  getChannelData() { return pcm; }
};

const result = analyzeSignal(buffer, 'full');
assert.ok(result.summary.rms > 0.1 && result.summary.rms < 0.2, 'RMS should be plausible');
assert.ok(result.pitchFrames.length > 20, 'pitch tracker should find voiced frames');
assert.ok(result.notes.length > 0, 'note segmenter should produce gestures');
assert.match(result.notes[0].note, /^A4$|^G#4$|^A#4$/, 'first note should be near A4');

const routes = judgeRoutes({ instrument: 'fiddle', analysis: result.summary, notes: result.notes });
assert.equal(routes.length, 3);
assert.equal(routes[0].id, 'physical', 'fiddle should favor physical reconstruction when evidence exists');

const doc = buildPerformanceDocument({
  fileName: 'synthetic-fiddle.wav',
  instrument: 'fiddle',
  analysis: result.summary,
  notes: result.notes,
  pitchFrames: result.pitchFrames,
});

assert.equal(doc.schema, PERFORMANCE_SCHEMA);
assert.equal(doc.source.instrument, 'fiddle');
assert.ok(doc.performance.length > 0);

console.log('FIDELIS SMOKE: PASS');
console.log(JSON.stringify({
  rms: result.summary.rms,
  crestFactor: result.summary.crestFactor,
  pitchFrames: result.pitchFrames.length,
  notes: result.notes.length,
  firstNote: result.notes[0].note,
  topRoute: routes[0].name
}, null, 2));
