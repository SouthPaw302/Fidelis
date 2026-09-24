const A4 = 440;

export function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / A4);
}

export function midiToNoteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${names[((rounded % 12) + 12) % 12]}${octave}`;
}

/**
 * Compact normalized-autocorrelation F0 estimate for isolated monophonic stems.
 */
export function estimatePitch(frame, sampleRate, { minHz = 70, maxHz = 1400 } = {}) {
  let mean = 0;
  for (let i = 0; i < frame.length; i++) mean += frame[i];
  mean /= frame.length;

  let energy = 0;
  for (let i = 0; i < frame.length; i += 2) {
    const value = frame[i] - mean;
    energy += value * value;
  }
  if (energy / Math.ceil(frame.length / 2) < 1e-6) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(frame.length - 4, Math.ceil(sampleRate / minHz));
  let bestLag = 0;
  let best = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let left = 0;
    let right = 0;
    for (let i = 0; i + lag < frame.length; i += 2) {
      const a = frame[i] - mean;
      const b = frame[i + lag] - mean;
      sum += a * b;
      left += a * a;
      right += b * b;
    }
    const corr = sum / Math.sqrt(Math.max(1e-12, left * right));
    if (corr > best) {
      best = corr;
      bestLag = lag;
    }
  }

  if (!bestLag || best < 0.58) return null;
  const hz = sampleRate / bestLag;
  if (!Number.isFinite(hz) || hz < minHz || hz > maxHz) return null;
  return { hz, midi: hzToMidi(hz), confidence: Math.min(1, Math.max(0, best)) };
}
