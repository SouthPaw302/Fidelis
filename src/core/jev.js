import { ROUTES } from './engines.js';

/**
 * Jev v0: bounded route judgement.
 * This deterministic fallback keeps the UI useful before an external Jev
 * service is configured.
 */
export function judgeRoutes({ instrument, analysis, notes }) {
  const voicedRatio = analysis.totalFrames ? analysis.voicedFrames / analysis.totalFrames : 0;
  const monophonicFriendly = ['fiddle', 'bass', 'vocals'].includes(instrument);
  const physicalBoost = instrument === 'fiddle' ? 4 : monophonicFriendly ? 2 : 0;
  const directBoost = ['guitar', 'piano', 'drums', 'unknown'].includes(instrument) ? 2 : 0;
  const transcriptionEvidence = notes.length >= 3 ? 2 : notes.length ? 1 : -2;
  const pitchEvidence = voicedRatio > 0.25 ? 2 : voicedRatio > 0.08 ? 1 : -1;

  const scored = [
    { ...ROUTES.physical, score: 7 + physicalBoost + transcriptionEvidence + pitchEvidence },
    { ...ROUTES.ddsp, score: 7 + (monophonicFriendly ? 2 : 0) + pitchEvidence },
    { ...ROUTES.direct, score: 7 + directBoost + (analysis.crestFactor < 4 ? 1 : 0) },
  ].sort((a, b) => b.score - a.score);

  return scored.map((route, index) => ({
    ...route,
    rank: index + 1,
    recommended: index === 0,
    reason: routeReason(route.id, { instrument, voicedRatio })
  }));
}

function routeReason(route, context) {
  if (route === 'physical' && context.instrument === 'fiddle') {
    return 'Violin-specific transcription plus a physical renderer matches this stem and can replace the generated waveform entirely.';
  }
  if (route === 'ddsp') {
    return context.voicedRatio > 0.2
      ? 'The stem exposes enough stable pitch evidence for continuous F0/dynamics reconstruction.'
      : 'Useful as a structured benchmark, but pitch evidence is currently limited.';
  }
  return 'Direct transfer preserves the source performance with the least interpretation and is a strong A/B baseline.';
}
