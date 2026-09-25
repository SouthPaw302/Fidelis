import { addDecomposedStem, buildReassemblyManifest, validateProject } from './project.js';

export const DECOMPOSITION_SCHEMA = 'fidelis.decomposition.v0.1';

export function buildDecompositionRequest(project, {
  adapterId = 'demucs',
  model = 'htdemucs',
  device = 'cpu',
  shifts = 0,
} = {}) {
  const validation = validateProject(project);
  if (!validation.valid) {
    throw new Error(`Invalid project: ${validation.errors.join('; ')}`);
  }
  if (project.source.kind !== 'full_mix') {
    throw new Error('Source decomposition requires a full_mix project source.');
  }
  if (!project.source.primaryAssetId) {
    throw new Error('Project has no primary source asset.');
  }

  const sourceAsset = project.assets.find(asset => asset.id === project.source.primaryAssetId);
  if (!sourceAsset) throw new Error('Primary source asset is missing.');

  return {
    schema: 'fidelis.decomposition-request.v0.1',
    projectId: project.project.id,
    sourceAssetId: sourceAsset.id,
    sourceFileName: sourceAsset.fileName,
    adapter: { id: adapterId, model, device, shifts },
    requestedOutputs: ['vocals', 'drums', 'bass', 'other'],
  };
}

export function validateDecompositionResult(result) {
  const errors = [];
  if (result?.schema !== DECOMPOSITION_SCHEMA) errors.push('schema mismatch');
  if (!result?.run?.id) errors.push('missing run id');
  if (!result?.adapter?.id) errors.push('missing adapter id');
  if (!['complete', 'blocked', 'failed'].includes(result?.status)) errors.push('invalid status');
  if (!Array.isArray(result?.stems)) errors.push('stems must be an array');

  if (result?.status === 'complete') {
    if (!result.stems.length) errors.push('complete result contains no stems');
    for (const stem of result.stems) {
      if (!stem.name) errors.push('stem missing name');
      if (!stem.fileName) errors.push('stem missing fileName');
      if (!Number.isFinite(Number(stem.durationSec))) errors.push(`stem ${stem.name || '?'} missing durationSec`);
      if (!Number.isFinite(Number(stem.sampleRate))) errors.push(`stem ${stem.name || '?'} missing sampleRate`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function applyDecompositionResult(project, result) {
  const resultValidation = validateDecompositionResult(result);
  if (!resultValidation.valid) {
    throw new Error(`Invalid decomposition result: ${resultValidation.errors.join('; ')}`);
  }
  if (result.status !== 'complete') {
    throw new Error(`Cannot apply decomposition with status ${result.status}.`);
  }

  const added = result.stems.map(stem => addDecomposedStem(project, {
    fileName: stem.fileName,
    mimeType: stem.mimeType || 'audio/wav',
    size: stem.size || 0,
    durationSec: stem.durationSec,
    sampleRate: stem.sampleRate,
    channels: stem.channels,
    origin: 'source-decomposer',
    checksum: stem.checksum || null,
  }, {
    instrument: mapStemToInstrument(stem.name),
    label: stem.label || titleCase(stem.name),
    decompositionRunId: result.run.id,
    confidence: stem.confidence ?? null,
    adapterId: result.adapter.id,
  }));

  project.provenance.lastDecomposition = {
    runId: result.run.id,
    adapterId: result.adapter.id,
    model: result.adapter.model || null,
    completedAt: result.run.completedAt || null,
  };
  buildReassemblyManifest(project);
  return added;
}

export function mapStemToInstrument(stemName = '') {
  const normalized = String(stemName).toLowerCase();
  if (normalized === 'vocals' || normalized === 'voice') return 'vocals';
  if (normalized === 'drums' || normalized === 'percussion') return 'drums';
  if (normalized === 'bass') return 'bass';
  return normalized === 'other' ? 'unknown' : normalized || 'unknown';
}

function titleCase(value) {
  return String(value || 'unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}
