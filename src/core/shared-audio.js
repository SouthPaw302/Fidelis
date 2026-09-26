export const SHARED_AUDIO_SCHEMA = 'libertas.audio-project.v0.1';

export function ensureSharedAudio(project) {
  assertProject(project);
  if (!project.sharedAudio || project.sharedAudio.schema !== SHARED_AUDIO_SCHEMA) {
    project.sharedAudio = {
      schema: SHARED_AUDIO_SCHEMA,
      projectId: project.project.id,
      tempo: {
        bpm: finiteOrNull(project.timeline?.tempo?.bpm),
        confidence: Number(project.timeline?.tempo?.confidence || 0),
        source: project.timeline?.tempo?.source || null,
        manualOverride: false,
        beats: [...(project.timeline?.beats || [])],
        downbeats: [],
      },
      media: {
        preferredStore: 'google-drive',
        refs: {},
      },
      channels: [],
      handoff: {
        target: 'LibertasDJ',
        schema: 'libertas.deck-handoff.v0.1',
      },
    };
  }
  syncChannels(project, project.sharedAudio);
  return project.sharedAudio;
}

export function setTempo(project, bpm, { confidence = 1, source = 'manual' } = {}) {
  const shared = ensureSharedAudio(project);
  const value = bpm == null || bpm === '' ? null : Number(bpm);
  if (value !== null && (!Number.isFinite(value) || value < 30 || value > 300)) {
    throw new Error('BPM must be between 30 and 300.');
  }
  shared.tempo.bpm = value;
  shared.tempo.confidence = value === null ? 0 : clamp(Number(confidence || 0), 0, 1);
  shared.tempo.source = value === null ? null : source;
  shared.tempo.manualOverride = source === 'manual' && value !== null;
  if (project.timeline?.tempo) {
    project.timeline.tempo.bpm = value;
    project.timeline.tempo.confidence = shared.tempo.confidence;
    project.timeline.tempo.source = shared.tempo.source;
  }
  return shared.tempo;
}

export function updateChannelMixer(project, channelId, patch = {}) {
  const channel = getChannel(project, channelId);
  const mixer = channel.mixer;
  if ('gainDb' in patch) mixer.gainDb = clamp(Number(patch.gainDb), -60, 12);
  if ('pan' in patch) mixer.pan = clamp(Number(patch.pan), -1, 1);
  for (const key of ['mute', 'solo', 'cue']) {
    if (key in patch) mixer[key] = Boolean(patch[key]);
  }
  if (patch.eq) {
    mixer.eq.lowDb = clamp(Number(patch.eq.lowDb ?? mixer.eq.lowDb), -18, 18);
    mixer.eq.midDb = clamp(Number(patch.eq.midDb ?? mixer.eq.midDb), -18, 18);
    mixer.eq.highDb = clamp(Number(patch.eq.highDb ?? mixer.eq.highDb), -18, 18);
  }
  return mixer;
}

export function setChannelLoop(project, channelId, patch = {}) {
  const channel = getChannel(project, channelId);
  if ('enabled' in patch) channel.clip.loop.enabled = Boolean(patch.enabled);
  if ('bars' in patch) {
    const bars = Number(patch.bars);
    if (![1, 2, 4, 8, 16, 32].includes(bars)) throw new Error('Unsupported loop bar count.');
    channel.clip.loop.bars = bars;
  }
  if ('snap' in patch) channel.clip.loop.snap = Boolean(patch.snap);
  return channel.clip.loop;
}

export function setDriveMediaRef(project, assetId, ref) {
  const shared = ensureSharedAudio(project);
  if (!assetId) throw new Error('assetId is required.');
  if (!ref?.fileId && !ref?.url) throw new Error('Drive media ref requires fileId or url.');
  shared.media.refs[assetId] = {
    provider: 'google-drive',
    fileId: ref.fileId || null,
    url: ref.url || null,
    name: ref.name || null,
    mimeType: ref.mimeType || null,
  };
  return shared.media.refs[assetId];
}

export function buildLibertasHandoff(project, channelId, deck = 'A') {
  const shared = ensureSharedAudio(project);
  const channel = shared.channels.find(item => item.id === channelId);
  if (!channel) throw new Error(`Unknown shared-audio channel: ${channelId}`);
  const normalizedDeck = String(deck).toUpperCase();
  if (!['A', 'B'].includes(normalizedDeck)) throw new Error('Libertas deck must be A or B.');
  return {
    schema: shared.handoff.schema,
    target: shared.handoff.target,
    deck: normalizedDeck,
    projectId: shared.projectId,
    channel: structuredClone(channel),
    tempo: structuredClone(shared.tempo),
    mediaRef: shared.media.refs[channel.assetId] || null,
  };
}

export function validateSharedAudio(project) {
  const errors = [];
  const shared = project?.sharedAudio;
  if (!shared) return { valid: false, errors: ['missing sharedAudio contract'] };
  if (shared.schema !== SHARED_AUDIO_SCHEMA) errors.push('sharedAudio schema mismatch');
  if (shared.projectId !== project?.project?.id) errors.push('sharedAudio project id mismatch');
  if (!Array.isArray(shared.channels)) errors.push('sharedAudio channels must be an array');
  for (const channel of shared.channels || []) {
    if (!channel.id || !channel.assetId) errors.push('channel requires id and assetId');
    if (!channel.mixer || !channel.clip) errors.push(`channel ${channel.id || '?'} missing mixer or clip state`);
  }
  return { valid: errors.length === 0, errors };
}

function syncChannels(project, shared) {
  const existing = new Map((shared.channels || []).map(channel => [channelKey(channel), channel]));
  const next = [];
  const assets = new Map((project.assets || []).map(asset => [asset.id, asset]));
  const sourceAssetId = project.source?.primaryAssetId;
  if (sourceAssetId) {
    const asset = assets.get(sourceAssetId);
    next.push(preserveOrCreate(existing, {
      id: `channel_source_${sourceAssetId}`,
      kind: 'source',
      partId: null,
      assetId: sourceAssetId,
      label: project.project?.name || asset?.fileName || 'Source Mix',
      instrument: project.source?.kind === 'stem' ? 'unknown' : 'full-mix',
      durationSec: Number(asset?.durationSec || project.timeline?.durationSec || 0),
    }));
  }
  for (const part of project.parts || []) {
    const asset = assets.get(part.sourceAssetId);
    next.push(preserveOrCreate(existing, {
      id: `channel_part_${part.id}`,
      kind: 'stem',
      partId: part.id,
      assetId: part.sourceAssetId,
      label: part.label || part.instrument || 'Stem',
      instrument: part.instrument || 'unknown',
      durationSec: Number(asset?.durationSec || project.timeline?.durationSec || 0),
      rebuild: {
        selected: part.reconstruction?.assetId ? 'reconstruction' : 'original',
        sourceAssetId: part.sourceAssetId,
        reconstructedAssetId: part.reconstruction?.assetId || null,
        rendererAdapterId: part.renderer?.adapterId || null,
      },
    }));
  }
  shared.channels = dedupeChannels(next);
}

function preserveOrCreate(existing, seed) {
  const old = existing.get(seed.id) || existing.get(`${seed.partId || ''}|${seed.assetId}`);
  if (old) {
    return {
      ...old,
      ...seed,
      mixer: old.mixer || defaultMixer(),
      clip: old.clip || defaultClip(seed.durationSec),
      rebuild: { ...(old.rebuild || defaultRebuild(seed.assetId)), ...(seed.rebuild || {}) },
    };
  }
  return {
    ...seed,
    mixer: defaultMixer(),
    clip: defaultClip(seed.durationSec),
    rebuild: { ...defaultRebuild(seed.assetId), ...(seed.rebuild || {}) },
    libertas: { ready: true, preferredDeck: null },
  };
}

function defaultMixer() {
  return {
    gainDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    cue: false,
    eq: { lowDb: 0, midDb: 0, highDb: 0 },
    fx: [],
  };
}

function defaultClip(durationSec) {
  return {
    startSec: 0,
    endSec: Number(durationSec || 0),
    loop: { enabled: false, bars: 4, snap: true },
    warp: { enabled: false, preservePitch: true, targetBpm: null },
  };
}

function defaultRebuild(assetId) {
  return { selected: 'original', sourceAssetId: assetId, reconstructedAssetId: null, rendererAdapterId: null };
}

function getChannel(project, channelId) {
  const shared = ensureSharedAudio(project);
  const channel = shared.channels.find(item => item.id === channelId);
  if (!channel) throw new Error(`Unknown shared-audio channel: ${channelId}`);
  return channel;
}

function channelKey(channel) {
  return `${channel.partId || ''}|${channel.assetId || ''}`;
}

function dedupeChannels(channels) {
  const seen = new Set();
  return channels.filter(channel => {
    const key = channel.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertProject(project) {
  if (!project?.project?.id || !project?.source || !Array.isArray(project?.assets) || !Array.isArray(project?.parts)) {
    throw new Error('A valid Fidelis project is required.');
  }
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
