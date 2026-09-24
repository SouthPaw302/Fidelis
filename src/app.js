import { analyzeSignal } from './audio/analyze.js';
import { buildPerformanceDocument } from './core/schema.js';
import { ENGINES } from './core/engines.js';
import { judgeRoutes } from './core/jev.js';
import { drawWaveform } from './ui/waveform.js';

const $ = selector => document.querySelector(selector);
const els = {
  file: $('#audioFile'),
  dropzone: $('#dropzone'),
  fileState: $('#fileState'),
  instrument: $('#instrumentType'),
  depth: $('#analysisDepth'),
  waveform: $('#waveform'),
  play: $('#playBtn'),
  analyze: $('#analyzeBtn'),
  preview: $('#audioPreview'),
  export: $('#exportBtn'),
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

const state = { file: null, buffer: null, analysis: null, document: null, objectUrl: null };
renderEngineRegistry();
drawWaveform(els.waveform, null);

els.file.addEventListener('change', () => els.file.files?.[0] && loadFile(els.file.files[0]));
['dragenter', 'dragover'].forEach(type => els.dropzone.addEventListener(type, event => {
  event.preventDefault();
  els.dropzone.classList.add('drag');
}));
['dragleave', 'drop'].forEach(type => els.dropzone.addEventListener(type, event => {
  event.preventDefault();
  els.dropzone.classList.remove('drag');
}));
els.dropzone.addEventListener('drop', event => event.dataTransfer?.files?.[0] && loadFile(event.dataTransfer.files[0]));
els.play.addEventListener('click', () => {
  els.preview.hidden = false;
  els.preview.paused ? els.preview.play() : els.preview.pause();
});
els.analyze.addEventListener('click', runAnalysis);
els.export.addEventListener('click', exportPerformance);

async function loadFile(file) {
  cleanupUrl();
  resetAnalysis();
  state.file = file;
  state.objectUrl = URL.createObjectURL(file);
  els.preview.src = state.objectUrl;
  els.fileState.textContent = file.name;
  els.fileState.className = 'badge';
  log('INPUT', `${file.name} loaded (${formatBytes(file.size)}). Decoding audio…`);

  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const bytes = await file.arrayBuffer();
    state.buffer = await context.decodeAudioData(bytes.slice(0));
    await context.close();
    drawWaveform(els.waveform, state.buffer);
    els.play.disabled = false;
    els.analyze.disabled = false;
    els.metrics.duration.textContent = `${state.buffer.duration.toFixed(2)} s`;
    els.metrics.rate.textContent = `${(state.buffer.sampleRate / 1000).toFixed(1)} kHz`;
    log('DECODE', `${state.buffer.numberOfChannels} channel(s) at ${state.buffer.sampleRate} Hz. Ready for performance analysis.`);
    setStage('input', 'analyze');
  } catch (error) {
    log('ERROR', `Could not decode this audio file: ${error.message}`);
    els.fileState.textContent = 'Decode failed';
    els.fileState.className = 'badge';
  }
}

async function runAnalysis() {
  if (!state.buffer || !state.file) return;
  els.analyze.disabled = true;
  els.analyze.textContent = 'Analyzing…';
  log('ANALYZE', `Running ${els.depth.value} performance analysis for ${els.instrument.value}.`);
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

    updateMetrics(result);
    renderPerformance(result.notes);
    renderRoutes(judgeRoutes({
      instrument: els.instrument.value,
      analysis: result.summary,
      notes: result.notes
    }));

    els.export.disabled = false;
    log('PERF', `${result.notes.length} note gesture(s) and ${result.pitchFrames.length} voiced pitch frame(s) extracted.`);
    log('JEV', 'Reconstruction routes ranked from current evidence. External engine adapters can replace the deterministic v0 router later.');
    setStage('route');
  } catch (error) {
    log('ERROR', `Analysis failed: ${error.message}`);
  } finally {
    els.analyze.disabled = false;
    els.analyze.textContent = 'Analyze performance';
  }
}

function updateMetrics(result) {
  const { summary } = result;
  els.metrics.duration.textContent = `${summary.durationSec.toFixed(2)} s`;
  els.metrics.rate.textContent = `${(summary.sampleRate / 1000).toFixed(1)} kHz`;
  els.metrics.rms.textContent = summary.rms.toFixed(4);
  els.metrics.crest.textContent = `${summary.crestFactor.toFixed(2)}×`;
  els.metrics.pitch.textContent = String(result.pitchFrames.length);
  els.metrics.notes.textContent = String(result.notes.length);
}

function renderRoutes(routes) {
  els.routeCards.innerHTML = routes.map(route => `
    <article class="route-card ${route.recommended ? 'recommended' : ''}">
      <div class="route-rank">${route.recommended ? 'JEV PICK' : `ROUTE ${route.rank}`}</div>
      <h3>${escapeHtml(route.name)}</h3>
      <p>${escapeHtml(route.reason)}</p>
      <div class="route-stack">${escapeHtml(route.stack)}</div>
    </article>`).join('');

  els.routeState.textContent = routes[0] ? `Primary: ${routes[0].name}` : 'No route';
  els.routeState.className = 'badge';
}

function renderPerformance(notes) {
  if (!notes.length) {
    els.performanceEmpty.textContent = 'No stable monophonic notes were detected. Try a cleaner stem or a specialized transcription adapter.';
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
  const blob = new Blob([JSON.stringify(state.document, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${stripExtension(state.file?.name || 'stem')}.performance.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  log('EXPORT', 'performance.json exported. This is the stable handoff format for render adapters.');
}

function resetAnalysis() {
  state.analysis = null;
  state.document = null;
  els.export.disabled = true;
  els.performanceEmpty.hidden = false;
  els.performanceWrap.hidden = true;
  els.performanceRows.innerHTML = '';
  els.routeCards.innerHTML = '';
  els.routeState.textContent = 'Awaiting analysis';
  els.routeState.className = 'badge neutral';
  els.metrics.rms.textContent = '—';
  els.metrics.crest.textContent = '—';
  els.metrics.pitch.textContent = '—';
  els.metrics.notes.textContent = '—';
}

function log(label, message) {
  const row = document.createElement('div');
  row.innerHTML = `<time>${escapeHtml(label)}</time><span>${escapeHtml(message)}</span>`;
  els.runLog.prepend(row);
}

function setStage(active, doneThrough) {
  const order = ['input', 'analyze', 'route', 'render', 'compare'];
  document.querySelectorAll('.stage').forEach(button => {
    const id = button.dataset.stage;
    button.classList.toggle('active', id === active);
    if (doneThrough) button.classList.toggle('done', order.indexOf(id) < order.indexOf(doneThrough));
    else if (order.indexOf(id) < order.indexOf(active)) button.classList.add('done');
  });
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
