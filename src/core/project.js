export const PROJECT_SCHEMA = 'fidelis.project.v0.2';

export function createProject({ name, sourceKind = 'full_mix', createdAt = new Date().toISOString() } = {}) {
  return {
    schema: PROJECT_SCHEMA,
    project: {
      id: makeId('project', name || 'untitled'),
      name: name || 'Untitled Fidelis Project',
      createdAt,
      status: 'decompile-ready',
    },
    source: {
      kind: sourceKind,
      primaryAssetId: null,
      suppliedStemAssetIds: [],
    },
    assets: [],
    timeline: {
      durationSec: 0,
      sampleRate: null,
      tempo: { bpm: null, confidence: 0, source: null },
      beats: [],
      phrases: [],
    },
    parts: [],
    reassembly: {
      status: 'not-started',
      targetSampleRate: null,
      tracks: [],
      masterAssetId: null,
    },
    qc: {
      status: 'not-run',
      checks: [],
    },
    provenance: {
      application: 'Fidelis',
      applicationVersion: '0.2-prealpha',
      contract: PROJECT_SCHEMA,
    },
  };
}

export function addPrimarySource(project, asset) {
  assertProject(project);
  const normalized = normalizeAsset(asset, 'source-mix');
  upsertAsset(project, normalized);
  project.source.primaryAssetId = normalized.id;
  project.timeline.durationSec = normalized.durationSec || project.timeline.durationSec;
  project.timeline.sampleRate = normalized.sampleRate || project.timeline.sampleRate;
  project.reassembly.targetSampleRate = normalized.sampleRate || project.reassembly.targetSampleRate;
  return normalized;
}

export function addSuppliedStem(project, asset, { instrument = 'unknown', label } = {}) {
  assertProject(project);
  const normalized = normalizeAsset(asset, 'supplied-stem');
  upsertAsset(project, normalized);
  if (!project.source.suppliedStemAssetIds.includes(normalized.id)) {
    project.source.suppliedStemAssetIds.push(normalized.id);
  }
  return upsertPartForAsset(project, normalized, {
    instrument,
    label,
    origin: 'supplied-stem',
    status: 'available',
  });
}

export function addDecomposedStem(project, asset, {
  instrument = 'unknown',
  label,
  decompositionRunId = null,
  confidence = null,
  adapterId = null,
} = {}) {
  assertProject(project);
  const normalized = normalizeAsset({
    ...asset,
    origin: asset.origin || 'source-decomposer',
  }, 'decomposed-stem');
  normalized.provenance.decompositionRunId = decompositionRunId;
  normalized.provenance.adapterId = adapterId;
  if (confidence !== null && confidence !== undefined) {
    normalized.provenance.confidence = round(confidence, 4);
  }
  upsertAsset(project, normalized);

  return upsertPartForAsset(project, normalized, {
    instrument,
    label,
    origin: 'decomposed',
    status: 'recovered-audio',
    decompositionRunId,
    confidence,
  });
}

export function attachRecoveredPart(project, {
  instrument = 'unknown',
  label,
  sourceAssetId,
  performance,
  origin = 'recovered',
} = {}) {
  assertProject(project);
  if (!performance?.schema) throw new Error('Recovered parts require a performance document.');
  const part = {
    id: makeId('part', `${sourceAssetId || 'source'}-${instrument}-${project.parts.length}`),
    label: label || titleCase(instrument),
    instrument,
    origin,
    sourceAssetId: sourceAssetId || project.source.primaryAssetId,
    status: 'performance-mapped',
    performance,
    renderer: { status: 'unassigned', adapterId: null, preset: null },
    reconstruction: { status: 'not-started', assetId: null },
  };
  project.parts.push(part);
  return part;
}

export function attachPerformanceToPart(project, partId, performance) {
  assertProject(project);
  const part = project.parts.find(item => item.id === partId);
  if (!part) throw new Error(`Unknown part: ${partId}`);
  if (!performance?.schema) throw new Error('A performance document is required.');
  part.performance = performance;
  part.status = 'performance-mapped';
  return part;
}

export function assignRenderer(project, partId, { adapterId, preset = null } = {}) {
  assertProject(project);
  if (!adapterId) throw new Error('Renderer adapterId is required.');
  const part = project.parts.find(item => item.id === partId);
  if (!part) throw new Error(`Unknown part: ${partId}`);
  part.renderer = { status: 'assigned', adapterId, preset };
  return part;
}

export function buildReassemblyManifest(project) {
  assertProject(project);
  project.reassembly.tracks = project.parts.map(part => ({
    partId: part.id,
    sourceAssetId: part.sourceAssetId,
    reconstructedAssetId: part.reconstruction.assetId,
    rendererAdapterId: part.renderer.adapterId,
    use: part.reconstruction.assetId ? 'reconstruction' : 'source',
    gainDb: 0,
    pan: 0,
    offsetSec: 0,
  }));
  project.reassembly.status = project.parts.length ? 'planned' : 'not-started';
  return project.reassembly;
}

export function summarizeProject(project) {
  assertProject(project);
  return {
    assets: project.assets.length,
    suppliedStems: project.source.suppliedStemAssetIds.length,
    parts: project.parts.length,
    performanceMaps: project.parts.filter(part => part.performance).length,
    rendererAssignments: project.parts.filter(part => part.renderer?.adapterId).length,
    reconstructedParts: project.parts.filter(part => part.reconstruction?.assetId).length,
    reassemblyStatus: project.reassembly.status,
  };
}

export function validateProject(project) {
  const errors = [];
  if (project?.schema !== PROJECT_SCHEMA) errors.push('schema mismatch');
  if (!project?.project?.id) errors.push('missing project id');
  if (!Array.isArray(project?.assets)) errors.push('assets must be an array');
  if (!Array.isArray(project?.parts)) errors.push('parts must be an array');
  if (!project?.reassembly) errors.push('missing reassembly manifest');

  const assetIds = new Set((project?.assets || []).map(asset => asset.id));
  if (project?.source?.primaryAssetId && !assetIds.has(project.source.primaryAssetId)) {
    errors.push('primary source asset is missing');
  }
  for (const part of project?.parts || []) {
    if (part.sourceAssetId && !assetIds.has(part.sourceAssetId)) {
      errors.push(`part ${part.id} references missing source asset`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function inferInstrumentFromFileName(fileName = '') {
  const name = fileName.toLowerCase();
  const tests = [
    ['vocals', /vocal|vox|voice|lead[-_ ]?vox/],
    ['drums', /drum|perc|kick|snare/],
    ['bass', /bass/],
    ['fiddle', /fiddle|violin|strings?/],
    ['guitar', /guitar|gtr/],
    ['piano', /piano|keys?|rhodes/],
  ];
  return tests.find(([, regex]) => regex.test(name))?.[0] || 'unknown';
}

function normalizeAsset(asset, role) {
  if (!asset?.fileName) throw new Error('Asset fileName is required.');
  return {
    id: asset.id || makeId('asset', `${asset.fileName}-${asset.size || 0}-${asset.durationSec || 0}`),
    type: 'audio',
    role,
    fileName: asset.fileName,
    mimeType: asset.mimeType || null,
    size: Number(asset.size || 0),
    durationSec: round(asset.durationSec || 0, 4),
    sampleRate: asset.sampleRate || null,
    channels: asset.channels || null,
    provenance: {
      origin: asset.origin || 'user-supplied',
      checksum: asset.checksum || null,
    },
  };
}

function upsertAsset(project, asset) {
  const index = project.assets.findIndex(item => item.id === asset.id);
  if (index >= 0) project.assets[index] = asset;
  else project.assets.push(asset);
}

function upsertPartForAsset(project, asset, {
  instrument = 'unknown',
  label,
  origin,
  status,
  decompositionRunId = null,
  confidence = null,
} = {}) {
  const part = {
    id: makeId('part', asset.id),
    label: label || asset.fileName || instrument,
    instrument,
    origin,
    sourceAssetId: asset.id,
    status,
    decomposition: decompositionRunId ? {
      runId: decompositionRunId,
      confidence: confidence === null || confidence === undefined ? null : round(confidence, 4),
    } : null,
    performance: null,
    renderer: { status: 'unassigned', adapterId: null, preset: null },
    reconstruction: { status: 'not-started', assetId: null },
  };
  const existing = project.parts.findIndex(item => item.sourceAssetId === asset.id);
  if (existing >= 0) project.parts[existing] = part;
  else project.parts.push(part);
  return part;
}

function assertProject(project) {
  if (!project || project.schema !== PROJECT_SCHEMA) throw new Error('Invalid Fidelis project document.');
}

function makeId(prefix, seed = '') {
  const clean = String(seed).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'item';
  let hash = 2166136261;
  for (let i = 0; i < String(seed).length; i++) {
    hash ^= String(seed).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${clean}_${(hash >>> 0).toString(36)}`;
}

function titleCase(value) {
  return String(value || 'unknown').replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

const round = (value, digits = 3) => Number(Number(value).toFixed(digits));
