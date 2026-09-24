/**
 * Provider-neutral DeepSeek Harness handoff.
 *
 * Fidelis keeps orchestration separate from DSP. The static client can build
 * this request document; an authenticated server/worker may submit it to the
 * actual harness. No credentials belong in the browser bundle.
 */
export const HARNESS_SCHEMA = 'fidelis.harness-request.v0.1';

export function buildHarnessRequest({ performance, instrument, availableEngines = [] }) {
  if (!performance?.schema) throw new Error('A performance document is required.');

  return {
    schema: HARNESS_SCHEMA,
    objective: 'preserve performance while improving instrument fidelity',
    instrument,
    source: performance.source,
    evidence: {
      analysis: performance.analysis,
      noteCount: performance.performance?.length ?? 0,
      pitchFrameCount: performance.pitchContour?.length ?? 0,
    },
    availableEngines,
    constraints: [
      'do not silently replace accepted source artifacts',
      'prefer reproducible adapter invocations',
      'record engine/model/version provenance',
      'Jev judges bounded route choices; deterministic DSP executes the chosen plan'
    ],
    requestedOutputs: [
      'route plan',
      'adapter sequence',
      'expected artifacts',
      'QC plan'
    ]
  };
}
