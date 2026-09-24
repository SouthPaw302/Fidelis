export const PERFORMANCE_SCHEMA = 'fidelis.performance.v0.1';

export function buildPerformanceDocument({ fileName, instrument, analysis, notes, pitchFrames }) {
  return {
    schema: PERFORMANCE_SCHEMA,
    source: {
      file: fileName,
      instrument,
      durationSec: round(analysis.durationSec, 4),
      sampleRate: analysis.sampleRate,
      channels: analysis.channels,
    },
    analysis: {
      engine: 'fidelis-browser-analyzer-v0.1',
      rms: round(analysis.rms, 6),
      peak: round(analysis.peak, 6),
      crestFactor: round(analysis.crestFactor, 4),
      pitchFrameCount: pitchFrames.length,
      noteCount: notes.length,
      limitations: [
        'v0 uses deterministic browser-side monophonic pitch analysis',
        'articulation labels are heuristic hints, not ground truth',
        'polyphonic stems require a specialized transcription adapter'
      ]
    },
    performance: notes,
    pitchContour: pitchFrames.map(frame => ({
      time: round(frame.time, 4),
      hz: round(frame.hz, 3),
      midi: round(frame.midi, 3),
      confidence: round(frame.confidence, 3),
      rms: round(frame.rms, 6)
    }))
  };
}

const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
