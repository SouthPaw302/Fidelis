import { estimatePitch, midiToNoteName } from './pitch.js';

export function mixToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const channel = audioBuffer.getChannelData(c);
    for (let i = 0; i < channel.length; i++) mono[i] += channel[i] / audioBuffer.numberOfChannels;
  }
  return mono;
}

export function analyzeSignal(audioBuffer, depth = 'full') {
  const mono = mixToMono(audioBuffer);
  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    const value = mono[i];
    sumSquares += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, mono.length));
  const crestFactor = peak / Math.max(1e-9, rms);

  const pitchResult = analyzePitchFrames(mono, audioBuffer.sampleRate, depth);
  const notes = segmentNotes(pitchResult.frames, pitchResult.hopSeconds);

  return {
    summary: {
      durationSec: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      rms,
      peak,
      crestFactor,
      voicedFrames: pitchResult.frames.length,
      totalFrames: pitchResult.totalFrames,
    },
    pitchFrames: pitchResult.frames,
    notes,
  };
}

function analyzePitchFrames(mono, sourceRate, depth) {
  const targetRate = depth === 'fast' ? 8000 : 11025;
  const stride = Math.max(1, Math.round(sourceRate / targetRate));
  const effectiveRate = sourceRate / stride;
  const decimatedLength = Math.ceil(mono.length / stride);
  const signal = new Float32Array(decimatedLength);
  for (let i = 0, j = 0; i < mono.length; i += stride, j++) signal[j] = mono[i];

  const frameSize = depth === 'fast' ? 384 : 512;
  const hop = depth === 'fast' ? 384 : 256;
  const maxSeconds = depth === 'fast' ? 90 : 180;
  const maxSamples = Math.min(signal.length, Math.floor(effectiveRate * maxSeconds));
  const frames = [];
  let totalFrames = 0;

  for (let start = 0; start + frameSize <= maxSamples; start += hop) {
    totalFrames++;
    const frame = signal.subarray(start, start + frameSize);
    const rms = frameRms(frame);
    if (rms < 0.008) continue;
    const pitch = estimatePitch(frame, effectiveRate);
    if (!pitch) continue;
    frames.push({ time: start / effectiveRate, rms, ...pitch });
  }

  return { frames: suppressOctaveJumps(frames), totalFrames, hopSeconds: hop / effectiveRate };
}

function suppressOctaveJumps(frames) {
  if (frames.length < 3) return frames;
  const out = frames.map(frame => ({ ...frame }));
  for (let i = 1; i < out.length; i++) {
    const previous = out[i - 1];
    const current = out[i];
    const diff = current.midi - previous.midi;
    if (Math.abs(diff) > 7 && Math.abs(Math.abs(diff) - 12) < 2.5) {
      current.midi += diff > 0 ? -12 : 12;
      current.hz = 440 * Math.pow(2, (current.midi - 69) / 12);
      current.confidence *= 0.88;
    }
  }
  return out;
}

function segmentNotes(frames, hopSeconds) {
  if (!frames.length) return [];
  const groups = [];
  let current = [frames[0]];

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const frame = frames[i];
    const gap = frame.time - prev.time;
    const pitchDelta = Math.abs(frame.midi - median(current.map(x => x.midi)));
    if (gap > hopSeconds * 2.6 || pitchDelta > 0.72) {
      if (current.length >= 2) groups.push(current);
      current = [frame];
    } else {
      current.push(frame);
    }
  }
  if (current.length >= 2) groups.push(current);
  return groups.map(group => describeNote(group, hopSeconds)).filter(note => note.duration >= 0.045);
}

function describeNote(group, hopSeconds) {
  const midiValues = group.map(frame => frame.midi);
  const rmsValues = group.map(frame => frame.rms);
  const centerMidi = median(midiValues);
  const centerHz = 440 * Math.pow(2, (centerMidi - 69) / 12);
  const cents = midiValues.map(value => (value - centerMidi) * 100);
  const start = group[0].time;
  const end = group[group.length - 1].time + hopSeconds;
  const duration = end - start;
  const vib = estimateVibrato(cents, duration);
  const startCents = mean(cents.slice(0, Math.min(3, cents.length)));
  const endCents = mean(cents.slice(Math.max(0, cents.length - 3)));
  const slideDelta = endCents - startCents;
  const peakRms = Math.max(...rmsValues);
  const attackRms = mean(rmsValues.slice(0, Math.min(3, rmsValues.length)));

  return {
    start: round(start, 4),
    duration: round(duration, 4),
    note: midiToNoteName(centerMidi),
    midi: round(centerMidi, 3),
    hz: round(centerHz, 2),
    dynamics: round(mean(rmsValues), 5),
    attack: attackRms < peakRms * 0.55 ? 'soft' : attackRms > peakRms * 0.85 ? 'firm' : 'medium',
    transition: Math.abs(slideDelta) > 22 ? (slideDelta > 0 ? 'slide-up' : 'slide-down') : 'stable',
    pitchStartCents: round(startCents, 1),
    pitchEndCents: round(endCents, 1),
    vibratoHz: vib ? round(vib.rate, 2) : 0,
    vibratoDepthCents: vib ? round(vib.depth, 1) : 0,
    confidence: round(mean(group.map(frame => frame.confidence)), 3),
  };
}

function estimateVibrato(cents, duration) {
  if (cents.length < 8 || duration < 0.22) return null;
  const smooth = cents.map((_, i) => mean(cents.slice(Math.max(0, i - 2), Math.min(cents.length, i + 3))));
  const residual = cents.map((value, i) => value - smooth[i]);
  const depth = standardDeviation(residual) * Math.SQRT2;
  if (depth < 4 || depth > 90) return null;
  let crossings = 0;
  for (let i = 1; i < residual.length; i++) {
    if ((residual[i - 1] <= 0 && residual[i] > 0) || (residual[i - 1] >= 0 && residual[i] < 0)) crossings++;
  }
  const rate = crossings / Math.max(0.001, duration * 2);
  if (rate < 2.5 || rate > 10) return null;
  return { rate, depth };
}

function frameRms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map(value => (value - avg) ** 2)));
}
