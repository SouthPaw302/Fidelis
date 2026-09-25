export function renderReferencePerformance(performance, {
  sampleRate = 48000,
  gain = 0.72,
} = {}) {
  if (!performance?.performance?.length) throw new Error('Reference renderer requires performance events.');

  const sourceDuration = Number(performance?.source?.durationSec || 0);
  const lastEnd = performance.performance.reduce((max, note) => Math.max(max, Number(note.start || 0) + Number(note.duration || 0)), 0);
  const durationSec = Math.max(sourceDuration, lastEnd + 0.05);
  const length = Math.max(1, Math.ceil(durationSec * sampleRate));
  const pcm = new Float32Array(length);

  for (const note of performance.performance) {
    synthNote(pcm, sampleRate, note, gain);
  }

  normalizeInPlace(pcm, 0.86);
  const metrics = measure(pcm);
  const wavBytes = encodeMonoWav(pcm, sampleRate);
  const blob = new Blob([wavBytes], { type: 'audio/wav' });

  return {
    blob,
    sampleRate,
    durationSec: pcm.length / sampleRate,
    rms: metrics.rms,
    peak: metrics.peak,
    renderer: 'fidelis-reference-synth-v0',
    disclaimer: 'Pipeline reference only; not a fidelity renderer.'
  };
}

function synthNote(pcm, sampleRate, note, gain) {
  const start = Math.max(0, Math.floor(Number(note.start || 0) * sampleRate));
  const duration = Math.max(0.02, Number(note.duration || 0.1));
  const end = Math.min(pcm.length, start + Math.floor(duration * sampleRate));
  const baseHz = Number(note.hz || 440);
  const vibratoHz = Math.max(0, Number(note.vibratoHz || 0));
  const vibratoDepth = Math.max(0, Number(note.vibratoDepthCents || 0));
  const dynamics = clamp(Number(note.dynamics || 0.12) * 3.4, 0.08, 0.72);
  const amp = gain * dynamics;
  const attack = Math.min(duration * 0.3, note.attack === 'firm' ? 0.008 : note.attack === 'soft' ? 0.045 : 0.02);
  const release = Math.min(duration * 0.35, 0.06);

  let phase = 0;
  for (let i = start; i < end; i++) {
    const t = (i - start) / sampleRate;
    const local = t / duration;
    const vibCents = vibratoHz > 0 ? Math.sin(2 * Math.PI * vibratoHz * t) * vibratoDepth : 0;
    const slideCents = interpolateSlide(note, local);
    const hz = baseHz * Math.pow(2, (vibCents + slideCents) / 1200);
    phase += 2 * Math.PI * hz / sampleRate;

    const env = envelope(t, duration, attack, release);
    const tone = Math.sin(phase) + 0.28 * Math.sin(phase * 2.01) + 0.12 * Math.sin(phase * 3.0);
    pcm[i] += tone * amp * env / 1.4;
  }
}

function interpolateSlide(note, local) {
  const start = Number(note.pitchStartCents || 0);
  const end = Number(note.pitchEndCents || 0);
  return start + (end - start) * clamp(local, 0, 1);
}

function envelope(t, duration, attack, release) {
  const attackGain = attack > 0 ? clamp(t / attack, 0, 1) : 1;
  const releaseStart = Math.max(0, duration - release);
  const releaseGain = t >= releaseStart && release > 0 ? clamp((duration - t) / release, 0, 1) : 1;
  return attackGain * releaseGain;
}

function normalizeInPlace(pcm, targetPeak) {
  let peak = 0;
  for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  if (!peak || peak <= targetPeak) return;
  const scale = targetPeak / peak;
  for (let i = 0; i < pcm.length; i++) pcm[i] *= scale;
}

function measure(pcm) {
  let peak = 0;
  let sum = 0;
  for (const value of pcm) {
    peak = Math.max(peak, Math.abs(value));
    sum += value * value;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, pcm.length)) };
}

function encodeMonoWav(pcm, sampleRate) {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (const value of pcm) {
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
