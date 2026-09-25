import { analyzeSignal } from './audio/analyze.js';
import { buildPerformanceDocument } from './core/schema.js';
import { ENGINES } from './core/engines.js';
import { judgeRoutes } from './core/jev.js';
import {
  addPrimarySource,
  addSuppliedStem,
  attachPerformanceToPart,
  attachRecoveredPart,
  buildReassemblyManifest,
  createProject,
  inferInstrumentFromFileName,
  summarizeProject,
  validateProject,
} from './core/project.js';
import { drawWaveform } from './ui/waveform.js';

const $ = selector => document.querySelector(selector);
const els = {
  file: $('#audioFile'),
  stemFiles: $('#stemFiles'),
  stemState: $('#stemState'),
  dropzone: $('#dropzone'),
  fileState: $('#fileState'),
  instrument: $('#instrumentType'),
  depth: $('#analysisDepth'),
  waveform: $('#waveform'),
  play: $('#playBtn'),
  analyze: $('#analyzeBtn'),
  preview: $('#audioPreview'),
  export: $('#exportBtn'),
  exportProject: $('#exportProjectBtn'),
  projectState: $('#projectState'),
  projectSource: $('#projectSource'),
  projectAssets: $('#projectAssets'),
  projectStems: $('#projectStems'),
  projectParts: $('#projectParts'),
  projectMaps: $('#projectMaps'),
  projectReassembly: $('#projectReassembly'),
  projectPartList: $('#projectPartList'),
  routeCards: $('#routeCards'),
  routeState: $('#routeState'),
  performanceRows: $('#performanceRows'),
  performanceEmpty: $('#performanceEmpty'),
  performanceWrap: $('#performanceTableWrap'),
  runLog: $('#runLog'),
  engineGrid: $('#engineGrid'),
  metrics: {
    duration: $('#metricDuration'),
    rate: $('#metricRate'),
    rms: $('#metricRms'),
    crest: $('#metricCrest'),
    pitch: $('#metricPitch'),
    notes: $('#metricNotes')
  }
};

const state = {
  file: null,
  buffer: null,
  analysis: null,
  document: null,
  project: null,
  primaryAssetId: null,
  objectUrl: null,
};

renderEngineRegistry();
drawWaveform(els.waveform, null);
syncPrimaryActionLabel();

els.file.addEventListener('change', () => els.file.files?.[0] && loadPrimaryFile(els.file.files[0]));
els.stemFiles.addEventListener('change', () => els.stemFiles.files?.length && loadSuppliedStems([...els.stemFiles.files]));
els.instrument.addEventListener('change', onSourceTypeChange);

['dragenter', 'dragover'].forEach(type => els.dropzone.addEventListener(type, event => {
  event.preventDefault();
  els.dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(type => els.dropzone.addEventListener(type, event => {
  event.preventDefault();
  els.dropzone.classList.remove('drag');
}));
els.dropzone.addEventListener('drop', event => event.dataTransfer?.files?.[0] && loadPrimaryFile(event.dataTransfer.files[0]));
els.play.addEventListener('click', () => {
  els.preview.hidden = false;
  els.preview.paused ? els.preview.play() : els.preview.pause();
});
els.analyze.addEventListener('click', runDecompile);
els.export.addEventListener('click', exportPerformance);
els.exportProject.addEventListener('click', exportProject);

async function loadPrimaryFile(file) {
  cleanupUrl();
  resetForNewSource();
  state.file = file;
  state.objectUrl = URL.createObjectURL(file);
  els.preview.src = state.objectUrl;
  els.fileState.textContent = file.name;
  els.fileState.className = 'deck-badge';
  log('INPUT', `${file.name} loaded (${formatBytes(file.size)}). Decoding primary source…`);

  try {
    const buffer = await decodeAudioFile(file);
    state.buffer = buffer;

    const sourceKind = currentSourceKind();
    state.project = createProject({
      name: stripExtension(file.name),
      sourceKind,
    });

    const sourceAsset = addPrimarySource(state.project, {
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      durationSec: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    });
    state.primaryAssetId = sourceAsset.id;

    drawWaveform(els.waveform, buffer);
    els.play.disabled = false;
    els.analyze.disabled = false;
    els.exportProject.disabled = false;
    els.metrics.duration.textContent = buffer.duration.toFixed(2);
    els.metrics.rate.textContent = (buffer.sampleRate / 1000).toFixed(1);
    $('#waveState').textContent = 'SOURCE LOCKED';

    buildReassemblyManifest(state.project);
    renderProject();
    syncPrimaryActionLabel();
    log('PROJECT', `${sourceKind === 'full_mix' ? 'Full mix' : 'Stem'} project initialized with canonical source asset.`);
    setStage('input', 'analyze');
  } catch (error) {
    log('ERROR', `Could not decode this audio file: ${error.message}`);
    els.fileState.textContent = 'DECODE FAILED';
    els.fileState.className = 'deck-badge';
  }
}

async function loadSuppliedStems(files) {
  if (!state.project) {
    log('STEMS', 'Load a primary source before attaching stems.');
    return;
  }

  els.stemState.textContent = 'DECODING STEMS…';
  let added = 0;

  for (const file of files) {
    try {
      const buffer = await decodeAudioFile(file);
      const instrument = inferInstrumentFromFileName(file.name);
      addSuppliedStem(state.project, {
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        durationSec: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
      }, {
        instrument,
        label: stripExtension(file.name),
      });
      added++;
      log('STEM', `${file.name} attached as ${instrument}.`);
    } catch (error) {
      log('ERROR', `Stem ${file.name} could not be decoded: ${error.message}`);
    }
  }

  buildReassemblyManifest(state.project);
  renderProject();
  els.stemState.textContent = `${state.project.source.suppliedStemAssetIds.length} STEM(S) ATTACHED`;
  if (added) log('PROJECT', `${added} supplied stem(s) added to the project model.`);
  els.stemFiles.value = '';
}

function onSourceTypeChange() {
  syncPrimaryActionLabel();
  if (!state.project) return;

  const newKind = currentSourceKind();
  if (state.project.source.kind === newKind) return;
  state.project.source.kind = newKind;

  if (state.document) {
    state.project.parts = state.project.parts.filter(part =>
      !(part.origin === 'recovered' && part.sourceAssetId === state.primaryAssetId)
    );
    state.document = null;
    state.analysis = null;
    resetPerformanceSurface();
    buildReassemblyManifest(state.project);
    log('PROJECT', 'Primary source type changed; previous primary performance map was cleared.');
  }

  renderProject();
}

async function runDecompile() {
  if (!state.buffer || !state.file || !state.project) return;

  if (currentSourceKind() === 'full_mix') {
    prepareFullMixProject();
    return;
  }

  els.analyze.disabled = true;
  els.analyze.textContent = 'DECOMPILING…';
  log('DECOMP', `Running ${els.depth.value} monophonic performance pass for ${els.instrument.value}.`);
  setStage('analyze');

  await new Promise(resolve => setTimeout(resolve, 35));

  try {
    const result = analyzeSignal(state.buffer, els.depth.value);
    state.analysis = result;
    state.document = buildPerformanceDocument({
      fileName: state.file.name,
      instrument: els.instrument.value,
      analysis: result.summary,
      notes: result.notes,
      pitchFrames: result.pitchFrames,
    });

    let part = state.project.parts.find(item =>
      item.origin === 'recovered' && item.sourceAssetId === state.primaryAssetId
    );

    if (part) {
      part.instrument = els.instrument.value;
      part.label = `Recovered ${els.instrument.options[els.instrument.selectedIndex].text}`;
      attachPerformanceToPart(state.project, part.id, state.document);
    } else {
      part = attachRecoveredPart(state.project, {
        instrument: els.instrument.value,
        label: `Recovered ${els.instrument.options[els.instrument.selectedIndex].text}`,
        sourceAssetId: state.primaryAssetId,
        performance: state.document,
      });
    }

    buildReassemblyManifest(state.project);
    updateMetrics(result);
    renderPerformance(result.notes);
    renderRoutes(judgeRoutes({
      instrument: els.instrument.value,
      analysis: result.summary,
      notes: result.notes
    }));
    renderProject();

    els.export.disabled = false;
    log('PARTS', `${result.notes.length} performance event(s) mapped into project part ${part.id}.`);
    log('JEV', 'Reconstruction candidates ranked from current stem evidence. They are not executable renderers yet.');
    setStage('route');
  } catch (error) {
    log('ERROR', `Decompile failed: ${error.message}`);
  } finally {
    els.analyze.disabled = false;
    syncPrimaryActionLabel();
  }
}

function prepareFullMixProject() {
  state.analysis = null;
  state.document = null;
  resetPerformanceSurface();
  buildReassemblyManifest(state.project);
  renderProject();

  els.performanceEmpty.innerHTML = '<span class="empty-glyph">⌁</span><strong>FULL-MIX PROJECT REGISTERED</strong><small>Automatic source separation / polyphonic part recovery requires a real decomposition adapter. Supplied stems can be attached now.</small>';
  els.performanceEmpty.hidden = false;
  els.performanceWrap.hidden = true;
  els.routeState.textContent = 'DECOMPOSITION ADAPTER REQUIRED';
  els.routeState.className = 'deck-badge muted';
  els.routeCards.innerHTML = `
    <article class="route-card">
      <div class="route-rank">PROJECT BOUNDARY</div>
      <h3>Whole-song decomposition pending</h3>
      <p>Fidelis has registered the full mix, timeline, assets and reassembly contract. It will not fabricate monophonic parts from a polyphonic master.</p>
      <div class="route-stack">NEXT ADAPTER CLASS: source separation / polyphonic transcription</div>
    </article>`;

  log('PROJECT', 'Full mix registered without false note extraction. Awaiting decomposition adapter or supplied stems.');
  setStage('analyze');
}

function updateMetrics(result) {
  const { summary } = result;
  els.metrics.duration.textContent = summary.durationSec.toFixed(2);
  els.metrics.rate.textContent = (summary.sampleRate / 1000).toFixed(1);
  els.metrics.rms.textContent = summary.rms.toFixed(4);
  els.metrics.crest.textContent = `${summary.crestFactor.toFixed(2)}×`;
  els.metrics.pitch.textContent = String(result.pitchFrames.length);
  els.metrics.notes.textContent = String(result.notes.length);
}

function renderRoutes(routes) {
  els.routeCards.innerHTML = routes.map(route => `
    <article class="route-card ${route.recommended ? 'recommended' : ''}">
      <div class="route-rank">${route.recommended ? 'JEV CANDIDATE' : `ROUTE ${route.rank}`}</div>
      <h3>${escapeHtml(route.name)}</h3>
      <p>${escapeHtml(route.reason)}</p>
      <div class="route-stack">${escapeHtml(route.stack)} // REGISTERED, NOT EXECUTING</div>
    </article>`).join('');

  els.routeState.textContent = routes[0] ? `CANDIDATE: ${routes[0].name}` : 'NO ROUTE';
  els.routeState.className = 'deck-badge';
}

function renderPerformance(notes) {
  if (!notes.length) {
    els.performanceEmpty.innerHTML = '<span class="empty-glyph">⌁</span><strong>NO STABLE PERFORMANCE EVENTS</strong><small>Try a cleaner monophonic stem or a specialized transcription adapter.</small>';
    els.performanceEmpty.hidden = false;
    els.performanceWrap.hidden = true;
    return;
  }

  els.performanceRows.innerHTML = notes.slice(0, 160).map(note => `
    <tr>
      <td>${note.start.toFixed(2)}s</td>
      <td class="note-name">${escapeHtml(note.note)}</td>
      <td>${note.duration.toFixed(2)}s</td>
      <td>${note.dynamics.toFixed(3)} · ${escapeHtml(note.attack)}</td>
      <td>${note.vibratoHz ? `${note.vibratoHz.toFixed(1)}Hz / ${note.vibratoDepthCents.toFixed(0)}¢` : '—'}</td>
      <td>${escapeHtml(note.transition)}</td>
    </tr>`).join('');

  els.performanceEmpty.hidden = true;
  els.performanceWrap.hidden = false;
}

function renderProject() {
  if (!state.project) {
    els.projectState.textContent = 'NO PROJECT';
    els.projectState.className = 'deck-badge muted';
    els.projectSource.textContent = '--';
    els.projectAssets.textContent = '0';
    els.projectStems.textContent = '0';
    els.projectParts.textContent = '0';
    els.projectMaps.textContent = '0';
    els.projectReassembly.textContent = '--';
    els.projectPartList.innerHTML = '<div class="project-empty">Project structure appears here after source/stems are loaded.</div>';
    return;
  }

  const summary = summarizeProject(state.project);
  const validation = validateProject(state.project);
  els.projectState.textContent = validation.valid ? 'PROJECT VALID' : 'PROJECT INVALID';
  els.projectState.className = validation.valid ? 'deck-badge' : 'deck-badge muted';
  els.projectSource.textContent = state.project.source.kind === 'full_mix' ? 'FULL MIX' : 'ISOLATED STEM';
  els.projectAssets.textContent = String(summary.assets);
  els.projectStems.textContent = String(summary.suppliedStems);
  els.projectParts.textContent = String(summary.parts);
  els.projectMaps.textContent = String(summary.performanceMaps);
  els.projectReassembly.textContent = summary.reassemblyStatus.toUpperCase();
  els.exportProject.disabled = !validation.valid;

  if (!state.project.parts.length) {
    els.projectPartList.innerHTML = state.project.source.kind === 'full_mix'
      ? '<div class="project-warning">Full mix is registered, but no parts are recovered yet. Attach supplied stems or connect a decomposition adapter.</div>'
      : '<div class="project-empty">Source stem registered. Run DECOMPILE SOURCE to attach its performance map.</div>';
    return;
  }

  els.projectPartList.innerHTML = state.project.parts.map(part => `
    <div class="project-part">
      <strong>${escapeHtml(part.label)}</strong>
      <span>${escapeHtml(part.instrument)}</span>
      <span>${escapeHtml(part.origin)}</span>
      <span class="${part.performance ? 'mapped' : 'pending'}">${part.performance ? 'PERFORMANCE MAPPED' : 'MAP PENDING'}</span>
      <span class="${part.renderer?.adapterId ? 'mapped' : 'pending'}">${part.renderer?.adapterId ? escapeHtml(part.renderer.adapterId) : 'RENDERER UNASSIGNED'}</span>
    </div>`).join('');
}

function renderEngineRegistry() {
  els.engineGrid.innerHTML = ENGINES.map(engine => `
    <article class="engine">
      <div class="engine-top">
        <strong>${escapeHtml(engine.name)}</strong>
        <span class="engine-type">${escapeHtml(engine.mode)}</span>
      </div>
      <small><b>${escapeHtml(engine.type)}</b><br>${escapeHtml(engine.description)}</small>
    </article>`).join('');
}

function exportPerformance() {
  if (!state.document) return;
  downloadJson(
    `${stripExtension(state.file?.name || 'stem')}.performance.json`,
    state.document
  );
  log('EXPORT', 'Performance map exported for a specific project part.');
}

function exportProject() {
  if (!state.project) return;
  buildReassemblyManifest(state.project);
  const validation = validateProject(state.project);
  if (!validation.valid) {
    log('ERROR', `Project export blocked: ${validation.errors.join('; ')}`);
    return;
  }
  downloadJson(
    `${stripExtension(state.file?.name || 'project')}.fidelis.json`,
    state.project
  );
  log('EXPORT', 'Whole-song Fidelis project exported with assets, parts and reassembly manifest.');
}

function resetForNewSource() {
  state.buffer = null;
  state.analysis = null;
  state.document = null;
  state.project = null;
  state.primaryAssetId = null;

  els.play.disabled = true;
  els.analyze.disabled = true;
  els.export.disabled = true;
  els.exportProject.disabled = true;
  els.stemFiles.value = '';
  els.stemState.textContent = '0 STEMS ATTACHED';
  els.fileState.textContent = 'NO SOURCE';
  els.fileState.className = 'deck-badge muted';
  $('#waveState').textContent = 'STANDBY';

  resetPerformanceSurface();
  renderProject();

  els.metrics.duration.textContent = '--';
  els.metrics.rate.textContent = '--';
  els.metrics.rms.textContent = '—';
  els.metrics.crest.textContent = '—';
  els.metrics.pitch.textContent = '—';
  els.metrics.notes.textContent = '—';
}

function resetPerformanceSurface() {
  state.analysis = null;
  state.document = null;
  els.export.disabled = true;
  els.performanceEmpty.innerHTML = '<span class="empty-glyph">⌁</span><strong>NO PERFORMANCE EVENTS</strong><small>Run DECOMPILE SOURCE to recover performance events from a monophonic stem.</small>';
  els.performanceEmpty.hidden = false;
  els.performanceWrap.hidden = true;
  els.performanceRows.innerHTML = '';
  els.routeCards.innerHTML = '';
  els.routeState.textContent = 'WAITING';
  els.routeState.className = 'deck-badge muted';
  els.metrics.rms.textContent = '—';
  els.metrics.crest.textContent = '—';
  els.metrics.pitch.textContent = '—';
  els.metrics.notes.textContent = '—';
}

function syncPrimaryActionLabel() {
  if (!els.analyze) return;
  els.analyze.textContent = currentSourceKind() === 'full_mix'
    ? 'PREPARE FULL-MIX PROJECT'
    : 'DECOMPILE SOURCE';
}

function currentSourceKind() {
  return els.instrument.value === 'unknown' ? 'full_mix' : 'stem';
}

async function decodeAudioFile(file) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');
  const context = new AudioContextCtor();
  try {
    const bytes = await file.arrayBuffer();
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    await context.close();
  }
}

function setStage(active, doneThrough) {
  const order = ['input', 'analyze', 'route', 'render', 'compare'];
  document.querySelectorAll('.stage').forEach(stage => {
    const id = stage.dataset.stage;
    stage.classList.toggle('active', id === active);
    if (id === active) stage.setAttribute('aria-current', 'step');
    else stage.removeAttribute('aria-current');

    if (doneThrough) stage.classList.toggle('done', order.indexOf(id) < order.indexOf(doneThrough));
    else stage.classList.toggle('done', order.indexOf(id) < order.indexOf(active));
  });
}

function log(label, message) {
  const row = document.createElement('div');
  row.innerHTML = `<time>${escapeHtml(label)}</time><span>${escapeHtml(message)}</span>`;
  els.runLog.prepend(row);
}

function downloadJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function cleanupUrl() {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, '');
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}
