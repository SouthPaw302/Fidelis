import { FidelisBackend, BackendError } from './backend-client.js';
import { drawWaveform } from './ui/waveform.js';

const $ = selector => document.querySelector(selector);
const backend = new FidelisBackend();

const els = {
  backendState: $('#backendState'),
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
  autopilot: $('#autopilotBtn'),
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
  renderState: $('#renderState'),
  renderPlan: $('#renderPlan'),
  renderCandidate: $('#renderCandidateBtn'),
  downloadCandidate: $('#downloadCandidateBtn'),
  candidateAudio: $('#candidateAudio'),
  compareState: $('#compareState'),
  abSource: $('#abSourceBtn'),
  abCandidate: $('#abCandidateBtn'),
  candidateMetrics: $('#candidateMetrics'),
  reassemble: $('#reassembleBtn'),
  downloadMaster: $('#downloadMasterBtn'),
  masterState: $('#masterState'),
  performanceRows: $('#performanceRows'),
  performanceEmpty: $('#performanceEmpty'),
  performanceWrap: $('#performanceTableWrap'),
  runLog: $('#runLog'),
  engineGrid: $('#engineGrid'),
  demucsImport: $('#demucsImportBtn'),
  demucsCheckpoint: $('#demucsCheckpointFile'),
  metrics: {
    duration: $('#metricDuration'),
    rate: $('#metricRate'),
    rms: $('#metricRms'),
    crest: $('#metricCrest'),
    pitch: $('#metricPitch'),
    notes: $('#metricNotes'),
  },
};

const state = {
  backendOnline: false,
  capabilities: {},
  file: null,
  buffer: null,
  objectUrl: null,
  project: null,
  projectId: null,
  activePartId: null,
  performance: null,
  routeDecision: null,
  assignment: null,
  candidateArtifact: null,
  candidateQc: null,
  masterArtifact: null,
};

drawWaveform(els.waveform, null);
wireEvents();
boot();

function wireEvents() {
  els.file.addEventListener('change', () => els.file.files?.[0] && loadPrimaryFile(els.file.files[0]));
  els.stemFiles.addEventListener('change', () => els.stemFiles.files?.length && loadSuppliedStems([...els.stemFiles.files]));
  els.instrument.addEventListener('change', () => {
    syncPrimaryActionLabel();
    if (state.project) log('SOURCE', 'Source type changed locally. Reload the primary source to create a project with the new source type.');
  });

  ['dragenter', 'dragover'].forEach(type => els.dropzone.addEventListener(type, event => {
    event.preventDefault();
    els.dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach(type => els.dropzone.addEventListener(type, event => {
    event.preventDefault();
    els.dropzone.classList.remove('drag');
  }));
  els.dropzone.addEventListener('drop', event => event.dataTransfer?.files?.[0] && loadPrimaryFile(event.dataTransfer.files[0]));

  els.play.addEventListener('click', safeToggleSourcePlayback);
  els.analyze.addEventListener('click', runDecompileOrAnalyze);
  els.export.addEventListener('click', exportPerformance);
  els.exportProject.addEventListener('click', exportProject);
  els.autopilot.addEventListener('click', runAutopilot);
  els.projectPartList.addEventListener('click', onPartClick);
  els.routeCards.addEventListener('click', onRouteClick);
  els.renderCandidate.addEventListener('click', renderCandidate);
  els.downloadCandidate.addEventListener('click', downloadCandidate);
  els.abSource.addEventListener('click', () => playAB('source'));
  els.abCandidate.addEventListener('click', () => playAB('candidate'));
  els.reassemble.addEventListener('click', reassembleProject);
  els.downloadMaster.addEventListener('click', downloadMaster);
  els.demucsImport.addEventListener('click', () => els.demucsCheckpoint.click());
  els.demucsCheckpoint.addEventListener('change', () => els.demucsCheckpoint.files?.[0] && installDemucsModel(els.demucsCheckpoint.files[0]));
}

async function boot() {
  setBackendState('CONNECTING', 'muted');
  try {
    const [health, caps] = await Promise.all([backend.health(), backend.capabilities()]);
    state.backendOnline = true;
    state.capabilities = caps.items || {};
    setBackendState(`BACKEND ${health.version}`, 'ready');
    renderEngineRegistry();
    log('BACKEND', `Authoritative FastAPI core online. ${health.capabilitiesReady} capability adapter(s) ready.`);
    const demucs = state.capabilities.demucs;
    if (demucs && demucs.status !== 'ready') log('DEMUX', `Demucs ${demucs.status}: ${demucs.reason || 'preflight did not pass'}`);
  } catch (error) {
    state.backendOnline = false;
    setBackendState('BACKEND OFFLINE', 'error');
    renderEngineRegistry();
    log('ERROR', `Backend connection failed: ${error.message}`);
  }
  syncPrimaryActionLabel();
}

async function loadPrimaryFile(file) {
  if (!requireBackend()) return;
  cleanupUrls();
  resetWorkflow();
  state.file = file;
  state.objectUrl = URL.createObjectURL(file);
  els.preview.src = state.objectUrl;
  els.fileState.textContent = file.name;
  els.fileState.className = 'deck-badge';
  log('INPUT', `${file.name} selected (${formatBytes(file.size)}).`);

  try {
    state.buffer = await decodeAudioFile(file);
    drawWaveform(els.waveform, state.buffer);
    els.metrics.duration.textContent = state.buffer.duration.toFixed(2);
    els.metrics.rate.textContent = (state.buffer.sampleRate / 1000).toFixed(1);
    $('#waveState').textContent = 'LOCAL DECODE OK';

    const sourceKind = currentSourceKind();
    const created = await backend.createProject(stripExtension(file.name), sourceKind);
    state.projectId = created.project.id;
    state.project = created;
    log('PROJECT', `Backend project ${state.projectId} created.`);

    const uploaded = await backend.uploadSource(state.projectId, file, {
      sourceKind,
      instrument: sourceKind === 'stem' ? els.instrument.value : 'unknown',
    });
    state.project = uploaded.project;
    state.activePartId = sourceKind === 'stem' ? state.project.parts?.[0]?.id || null : null;
    $('#waveState').textContent = 'SOURCE LOCKED';

    els.play.disabled = false;
    els.analyze.disabled = false;
    els.exportProject.disabled = false;
    els.autopilot.disabled = false;
    renderProject();
    syncPrimaryActionLabel();
    setStage('input', 'analyze');
    log('SOURCE', `Primary source stored as artifact ${uploaded.artifact.id} (${uploaded.artifact.sha256.slice(0, 10)}…).`);
    await refreshHarnessContext();
  } catch (error) {
    logError('Source ingest failed', error);
    els.fileState.textContent = 'INGEST FAILED';
    els.fileState.className = 'deck-badge muted';
  }
}

async function loadSuppliedStems(files) {
  if (!requireProject()) return;
  els.stemState.textContent = 'UPLOADING STEMS…';
  try {
    const result = await backend.uploadStems(state.projectId, files);
    state.project = result.project;
    if (!state.activePartId && state.project.parts?.length) state.activePartId = state.project.parts[0].id;
    els.stemState.textContent = `${state.project.source.suppliedStemArtifactIds?.length || 0} STEM(S) ATTACHED`;
    renderProject();
    syncPrimaryActionLabel();
    log('STEMS', `${result.count} supplied stem(s) registered in backend project state.`);
  } catch (error) {
    els.stemState.textContent = 'STEM UPLOAD FAILED';
    logError('Supplied stem upload failed', error);
  } finally {
    els.stemFiles.value = '';
  }
}

async function runDecompileOrAnalyze() {
  if (!requireProject()) return;
  if (state.project.source.kind === 'full_mix' && !state.activePartId) {
    await decomposeFullMix();
    return;
  }
  if (!state.activePartId) {
    log('PARTS', 'Select a project part first.');
    return;
  }
  await analyzeSelectedPart();
}

async function decomposeFullMix() {
  setBusy(els.analyze, true, 'DECOMPILING…');
  setStage('analyze');
  log('DECOMP', 'Submitting full-mix source to the configured source-decomposition adapter.');
  try {
    const job = await backend.decompose(state.projectId, { wait: true });
    const result = job.result || {};
    state.project = await backend.getProject(state.projectId);
    renderProject();

    if (job.status === 'complete' && result.status === 'complete') {
      state.activePartId = state.project.parts?.[0]?.id || null;
      renderProject();
      syncPrimaryActionLabel();
      setStage('analyze');
      log('DECOMP', `${result.parts?.length || 0} recovered audio part(s) registered. Select a part to analyze.`);
      return;
    }

    const cap = result.capability || state.capabilities.demucs || {};
    els.performanceEmpty.innerHTML = `<span class="empty-glyph">⌁</span><strong>DECOMPOSITION ${escapeHtml(String(result.status || job.status).toUpperCase())}</strong><small>${escapeHtml(cap.reason || 'The source decomposer is not currently executable.')}</small>`;
    els.performanceEmpty.hidden = false;
    els.performanceWrap.hidden = true;
    els.routeState.textContent = 'SOURCE DECOMP BLOCKED';
    els.routeState.className = 'deck-badge muted';
    els.routeCards.innerHTML = `<article class="route-card"><div class="route-rank">CAPABILITY GATE</div><h3>${escapeHtml(cap.label || 'Source decomposer')}</h3><p>${escapeHtml(cap.reason || 'Not ready')}</p><div class="route-stack">STATUS: ${escapeHtml(cap.status || 'blocked')} // NO FAKE STEMS CREATED</div></article>`;
    log('BLOCKED', cap.reason || 'Full-mix decomposition is blocked by adapter preflight.');
  } catch (error) {
    logError('Full-mix decomposition failed', error);
  } finally {
    setBusy(els.analyze, false);
    syncPrimaryActionLabel();
  }
}

async function analyzeSelectedPart() {
  const part = activePart();
  if (!part) return;
  setBusy(els.analyze, true, 'ANALYZING…');
  setStage('analyze');
  log('ANALYZE', `Backend performance analysis started for ${part.label} (${part.instrument}).`);

  try {
    const job = await backend.analyzePart(state.projectId, part.id, { wait: true });
    if (job.status !== 'complete') throw new Error(job.error || `analysis job ended ${job.status}`);
    state.performance = job.result.performance;
    renderPerformance(state.performance.performance || []);
    updateMetricsFromPerformance(state.performance);
    els.export.disabled = false;

    state.project = await backend.getProject(state.projectId);
    renderProject();
    const routed = await backend.routePart(state.projectId, part.id, { allowFallback: true });
    state.routeDecision = routed.decision;
    state.assignment = routed.assignment;
    state.project = await backend.getProject(state.projectId);
    renderProject();
    renderRoutes(routed.decision, routed.assignment);
    setStage('route');
    log('JEV', `Preferred route: ${routed.decision.preferredRouteId}. Executing adapter: ${routed.assignment.adapterId || 'blocked'}.`);
    await refreshHarnessContext();
  } catch (error) {
    logError('Part analysis failed', error);
  } finally {
    setBusy(els.analyze, false);
    syncPrimaryActionLabel();
  }
}

function renderRoutes(decision, assignment) {
  resetCandidate();
  const routes = decision?.desiredRoutes || [];
  const selected = assignment?.intendedRouteId || decision?.preferredRouteId;
  els.routeCards.innerHTML = routes.map(route => {
    const statuses = Object.entries(route.adapterStatuses || {}).map(([id, status]) => `${id}:${status}`).join(' · ');
    const selectedClass = route.id === selected ? ' selected' : '';
    return `<article class="route-card${route.rank === 1 ? ' recommended' : ''}${selectedClass}" data-route-card="${escapeHtml(route.id)}">
      <div class="route-rank">${route.rank === 1 ? 'JEV PREFERRED' : `ROUTE ${route.rank}`}</div>
      <h3>${escapeHtml(route.label)}</h3>
      <p>${escapeHtml(route.reason)}</p>
      <div class="route-stack">${escapeHtml(route.stack.join(' → '))}<br>${escapeHtml(statuses || 'no adapter status')}</div>
      <button class="deck-button ghost route-select" data-route-select="${escapeHtml(route.id)}">${route.id === selected ? 'SELECTED' : 'SELECT ROUTE'}</button>
    </article>`;
  }).join('');

  els.routeState.textContent = assignment?.adapterId ? `ARMED: ${assignment.intendedRouteId}` : 'ROUTE BLOCKED';
  els.routeState.className = assignment?.adapterId ? 'deck-badge' : 'deck-badge muted';
  armRenderer(assignment);
}

async function onRouteClick(event) {
  const button = event.target.closest('[data-route-select]');
  if (!button || !requireProject() || !state.activePartId) return;
  button.disabled = true;
  try {
    const routed = await backend.routePart(state.projectId, state.activePartId, {
      desiredRouteId: button.dataset.routeSelect,
      allowFallback: true,
    });
    state.routeDecision = routed.decision;
    state.assignment = routed.assignment;
    state.project = await backend.getProject(state.projectId);
    renderProject();
    renderRoutes(routed.decision, routed.assignment);
    setStage('render');
    log('ROUTE', `${routed.assignment.intendedRouteId} selected; backend adapter ${routed.assignment.adapterId || 'none'} ${routed.assignment.fallback ? '(fallback)' : ''}.`);
  } catch (error) {
    logError('Route selection failed', error);
  } finally {
    button.disabled = false;
  }
}

function armRenderer(assignment) {
  if (!assignment?.adapterId) {
    els.renderState.textContent = 'NO EXECUTABLE ADAPTER';
    els.renderState.className = 'deck-badge muted';
    els.renderPlan.textContent = 'Jev has a preferred reconstruction route, but no configured worker/renderer can execute it and fallback is disabled or unavailable.';
    els.renderCandidate.disabled = true;
    return;
  }
  els.renderState.textContent = assignment.fallback ? 'FALLBACK ARMED' : 'RENDERER ARMED';
  els.renderState.className = 'deck-badge';
  els.renderPlan.innerHTML = `<strong>${escapeHtml(assignment.intendedRouteId || 'route')}</strong><br>Execution adapter: <b>${escapeHtml(assignment.adapterId)}</b>${assignment.fallback ? '<br><br>Fallback is explicitly recorded. This is not being presented as the target fidelity engine.' : ''}`;
  els.renderCandidate.disabled = false;
  els.renderCandidate.textContent = assignment.fallback ? 'RUN REFERENCE FALLBACK' : 'RENDER CANDIDATE';
}

async function renderCandidate() {
  if (!requireProject() || !state.activePartId || !state.assignment?.adapterId) return;
  resetCandidate();
  setBusy(els.renderCandidate, true, 'RENDERING…');
  els.renderState.textContent = 'RENDERING';
  setStage('render');

  try {
    const job = await backend.renderPart(state.projectId, state.activePartId, { wait: true });
    if (job.status !== 'complete') throw new Error(job.error || `render job ended ${job.status}`);
    state.candidateArtifact = job.result.artifact;
    const qcJob = await backend.qcPart(state.projectId, state.activePartId, { wait: true });
    state.candidateQc = qcJob.status === 'complete' ? qcJob.result.report : null;
    state.project = await backend.getProject(state.projectId);
    renderProject();

    els.candidateAudio.src = backend.artifactUrl(state.candidateArtifact.id);
    els.candidateAudio.hidden = false;
    els.downloadCandidate.disabled = false;
    els.abSource.disabled = false;
    els.abCandidate.disabled = false;
    els.reassemble.disabled = false;
    els.compareState.textContent = 'A/B READY';
    els.compareState.className = 'deck-badge';
    els.renderState.textContent = 'CANDIDATE COMPLETE';
    els.renderState.className = 'deck-badge';
    els.candidateMetrics.textContent = formatQc(state.candidateQc, state.candidateArtifact);
    setStage('compare');
    log('RENDER', `${state.candidateArtifact.filename} produced by ${state.assignment.adapterId}. QC evidence attached.`);
  } catch (error) {
    els.renderState.textContent = 'RENDER FAILED';
    els.renderState.className = 'deck-badge muted';
    logError('Candidate render failed', error);
  } finally {
    setBusy(els.renderCandidate, false);
    armRenderer(state.assignment);
  }
}

async function reassembleProject() {
  if (!requireProject()) return;
  setBusy(els.reassemble, true, 'REASSEMBLING…');
  els.masterState.textContent = 'MIXING';
  try {
    const job = await backend.reassemble(state.projectId, { wait: true });
    if (job.status !== 'complete') throw new Error(job.error || `reassembly ended ${job.status}`);
    state.masterArtifact = job.result.artifact;
    state.project = await backend.getProject(state.projectId);
    renderProject();
    els.masterState.textContent = `MASTER: ${state.masterArtifact.filename}`;
    els.downloadMaster.disabled = false;
    log('MIX', `Reassembled ${job.result.tracks} track(s) to ${state.masterArtifact.filename}.`);
  } catch (error) {
    els.masterState.textContent = 'REASSEMBLY FAILED';
    logError('Project reassembly failed', error);
  } finally {
    setBusy(els.reassemble, false);
  }
}

async function runAutopilot() {
  if (!requireProject()) return;
  setBusy(els.autopilot, true, 'AUTOPILOT RUNNING…');
  log('HARNESS', 'Project autopilot executing all currently ready deterministic stages.');
  try {
    const report = await backend.autopilot(state.projectId, { allowFallback: true });
    state.project = report.project || await backend.getProject(state.projectId);
    renderProject();
    if (report.status === 'blocked') {
      log('BLOCKED', `Autopilot stopped at ${report.blockedAt}. No unavailable dependency was bypassed.`);
    } else {
      log('AUTOPILOT', `Pipeline ${report.status}. ${report.summary ? `${report.summary.completeParts} complete / ${report.summary.blockedParts} blocked.` : ''}`);
    }
    const firstPart = state.project.parts?.[0];
    if (firstPart) {
      state.activePartId = firstPart.id;
      if (firstPart.performance?.document) {
        state.performance = firstPart.performance.document;
        renderPerformance(state.performance.performance || []);
        updateMetricsFromPerformance(state.performance);
      }
      if (firstPart.routeDecision) {
        state.routeDecision = firstPart.routeDecision;
        state.assignment = firstPart.renderer;
        renderRoutes(firstPart.routeDecision, firstPart.renderer);
      }
      if (firstPart.reconstruction?.artifactId) {
        state.candidateArtifact = await backend.artifactMeta(firstPart.reconstruction.artifactId);
        els.candidateAudio.src = backend.artifactUrl(state.candidateArtifact.id);
        els.candidateAudio.hidden = false;
        els.downloadCandidate.disabled = false;
        els.abSource.disabled = false;
        els.abCandidate.disabled = false;
        els.reassemble.disabled = false;
        els.compareState.textContent = 'A/B READY';
        els.compareState.className = 'deck-badge';
        if (firstPart.qc?.report) state.candidateQc = firstPart.qc.report;
        els.candidateMetrics.textContent = formatQc(state.candidateQc, state.candidateArtifact);
        setStage('compare');
      }
    }
  } catch (error) {
    logError('Autopilot failed', error);
  } finally {
    setBusy(els.autopilot, false);
  }
}

function onPartClick(event) {
  const row = event.target.closest('[data-part-id]');
  if (!row) return;
  state.activePartId = row.dataset.partId;
  state.performance = activePart()?.performance?.document || null;
  state.routeDecision = activePart()?.routeDecision || null;
  state.assignment = activePart()?.renderer || null;
  state.candidateArtifact = null;
  state.candidateQc = activePart()?.qc?.report || null;
  renderProject();
  resetCandidate();

  if (state.performance) {
    renderPerformance(state.performance.performance || []);
    updateMetricsFromPerformance(state.performance);
    els.export.disabled = false;
  } else {
    resetPerformanceSurface(false);
  }
  if (state.routeDecision) renderRoutes(state.routeDecision, state.assignment);
  syncPrimaryActionLabel();
  log('PART', `${activePart()?.label || state.activePartId} selected.`);
}

function renderProject() {
  const project = state.project;
  if (!project) {
    els.projectState.textContent = 'NO PROJECT';
    els.projectState.className = 'deck-badge muted';
    els.projectSource.textContent = '--';
    els.projectAssets.textContent = '0';
    els.projectStems.textContent = '0';
    els.projectParts.textContent = '0';
    els.projectMaps.textContent = '0';
    els.projectReassembly.textContent = '--';
    els.projectPartList.innerHTML = '<div class="project-empty">Backend project structure appears here after source/stems are loaded.</div>';
    return;
  }

  const parts = project.parts || [];
  const maps = parts.filter(part => part.performance?.document).length;
  els.projectState.textContent = 'BACKEND AUTHORITY';
  els.projectState.className = 'deck-badge';
  els.projectSource.textContent = project.source.kind === 'full_mix' ? 'FULL MIX' : 'ISOLATED STEM';
  els.projectAssets.textContent = String((project.artifacts || []).length);
  els.projectStems.textContent = String(project.source.suppliedStemArtifactIds?.length || 0);
  els.projectParts.textContent = String(parts.length);
  els.projectMaps.textContent = String(maps);
  els.projectReassembly.textContent = String(project.reassembly?.status || 'not-started').toUpperCase();
  els.exportProject.disabled = false;
  els.autopilot.disabled = false;

  if (!parts.length) {
    els.projectPartList.innerHTML = project.source.kind === 'full_mix'
      ? '<div class="project-warning">Full mix is stored in the backend. Run DECOMPILE FULL MIX or attach supplied stems. No fake parts are created.</div>'
      : '<div class="project-empty">Primary stem registered. Run ANALYZE SELECTED PART.</div>';
    return;
  }

  els.projectPartList.innerHTML = parts.map(part => {
    const selected = part.id === state.activePartId ? ' selected' : '';
    const mapped = part.performance?.document ? 'PERFORMANCE MAPPED' : 'MAP PENDING';
    const renderer = part.renderer?.adapterId
      ? `${part.renderer.adapterId}${part.renderer.fallback ? ' [fallback]' : ''}`
      : 'RENDERER UNASSIGNED';
    const action = part.id === state.activePartId ? 'ACTIVE PART' : 'SELECT PART';
    return `<button type="button" class="project-part${selected}" data-part-id="${escapeHtml(part.id)}" aria-pressed="${part.id === state.activePartId ? 'true' : 'false'}">
      <strong>${escapeHtml(part.label)}</strong>
      <span>${escapeHtml(part.instrument || 'unknown')}</span>
      <span>${escapeHtml(part.origin || 'unknown')}</span>
      <span class="${part.performance?.document ? 'mapped' : 'pending'}">${mapped}</span>
      <span class="part-select-action">${action}</span>
    </button>`;
  }).join('');
}

function renderPerformance(notes) {
  if (!notes.length) {
    els.performanceEmpty.innerHTML = '<span class="empty-glyph">⌁</span><strong>NO STABLE PERFORMANCE EVENTS</strong><small>The selected analyzer returned no stable note gestures.</small>';
    els.performanceEmpty.hidden = false;
    els.performanceWrap.hidden = true;
    return;
  }
  els.performanceRows.innerHTML = notes.slice(0, 200).map(note => `<tr>
    <td>${Number(note.start || 0).toFixed(2)}s</td>
    <td class="note-name">${escapeHtml(note.note || '--')}</td>
    <td>${Number(note.duration || 0).toFixed(2)}s</td>
    <td>${Number(note.dynamics || 0).toFixed(3)} · ${escapeHtml(note.attack || '--')}</td>
    <td>${note.vibratoHz ? `${Number(note.vibratoHz).toFixed(1)}Hz / ${Number(note.vibratoDepthCents || 0).toFixed(0)}¢` : '—'}</td>
    <td>${escapeHtml(note.transition || '--')}</td>
  </tr>`).join('');
  els.performanceEmpty.hidden = true;
  els.performanceWrap.hidden = false;
}

async function refreshCapabilities() {
  const caps = await backend.capabilities();
  state.capabilities = caps.items || {};
  renderEngineRegistry();
  return state.capabilities;
}

async function installDemucsModel(file) {
  if (!requireBackend()) return;
  const prior = els.demucsImport.textContent;
  els.demucsImport.disabled = true;
  els.demucsImport.textContent = 'VERIFYING MODEL…';
  log('MODEL', `Verifying ${file.name} as the managed HTDemucs checkpoint.`);
  try {
    const result = await backend.installDemucsCheckpoint(file);
    state.capabilities = result.capabilities || await refreshCapabilities();
    renderEngineRegistry();
    const demucs = state.capabilities.demucs || {};
    if (demucs.status !== 'ready') throw new Error(demucs.reason || 'Demucs did not become ready after installation.');
    log('MODEL', `HTDemucs checkpoint verified and installed. Full-mix decomposition is now READY.`);
  } catch (error) {
    logError('HTDemucs model import rejected', error);
    await refreshCapabilities().catch(() => {});
  } finally {
    els.demucsCheckpoint.value = '';
    els.demucsImport.disabled = false;
    els.demucsImport.textContent = prior;
  }
}

function renderEngineRegistry() {
  const caps = Object.values(state.capabilities || {});
  if (!caps.length) {
    els.engineGrid.innerHTML = '<article class="engine"><div class="engine-top"><strong>Backend capabilities</strong><span class="engine-type">offline</span></div><small>Start the Fidelis backend to populate real adapter state.</small></article>';
    return;
  }
  els.engineGrid.innerHTML = caps.map(cap => `<article class="engine capability-${escapeHtml(cap.status)}">
    <div class="engine-top"><strong>${escapeHtml(cap.label)}</strong><span class="engine-type">${escapeHtml(cap.status)}</span></div>
    <small><b>${escapeHtml(cap.kind)}</b><br>${escapeHtml(cap.reason || cap.execution || '')}</small>
  </article>`).join('');
  const demucs = state.capabilities.demucs || {};
  els.demucsImport.disabled = !state.backendOnline || demucs.status === 'ready';
  els.demucsImport.textContent = demucs.status === 'ready'
    ? (demucs.execution === 'remote-worker' ? 'REMOTE DEMUCS ACTIVE' : 'HTDEMUCS INSTALLED')
    : 'IMPORT HTDEMUCS MODEL';
}

function updateMetricsFromPerformance(performance) {
  const a = performance?.analysis || {};
  const s = performance?.source || {};
  els.metrics.duration.textContent = Number(s.durationSec || state.buffer?.duration || 0).toFixed(2);
  els.metrics.rate.textContent = ((Number(s.sampleRate || state.buffer?.sampleRate || 0)) / 1000).toFixed(1);
  els.metrics.rms.textContent = Number(a.rms || 0).toFixed(4);
  els.metrics.crest.textContent = `${Number(a.crestFactor || 0).toFixed(2)}×`;
  els.metrics.pitch.textContent = String(a.pitchFrameCount ?? performance.pitchContour?.length ?? 0);
  els.metrics.notes.textContent = String(a.noteCount ?? performance.performance?.length ?? 0);
}

function resetWorkflow() {
  state.project = null;
  state.projectId = null;
  state.activePartId = null;
  state.performance = null;
  state.routeDecision = null;
  state.assignment = null;
  state.candidateArtifact = null;
  state.candidateQc = null;
  state.masterArtifact = null;
  els.play.disabled = true;
  els.analyze.disabled = true;
  els.export.disabled = true;
  els.fileState.textContent = 'NO SOURCE';
  els.fileState.className = 'deck-badge muted';
  $('#waveState').textContent = 'STANDBY';
  els.metrics.duration.textContent = '--';
  els.metrics.rate.textContent = '--';
  els.exportProject.disabled = true;
  els.autopilot.disabled = true;
  els.reassemble.disabled = true;
  els.downloadMaster.disabled = true;
  els.masterState.textContent = 'NO MASTER';
  els.stemFiles.value = '';
  els.stemState.textContent = '0 STEMS ATTACHED';
  resetPerformanceSurface();
  resetCandidate();
  renderProject();
}

function resetPerformanceSurface(clearActivePart = true) {
  state.performance = null;
  state.routeDecision = null;
  state.assignment = null;
  if (clearActivePart) state.activePartId = null;
  els.export.disabled = true;
  els.performanceEmpty.innerHTML = '<span class="empty-glyph">⌁</span><strong>NO PERFORMANCE EVENTS</strong><small>Select or recover a part, then run backend analysis.</small>';
  els.performanceEmpty.hidden = false;
  els.performanceWrap.hidden = true;
  els.performanceRows.innerHTML = '';
  els.routeCards.innerHTML = '';
  els.routeState.textContent = 'WAITING';
  els.routeState.className = 'deck-badge muted';
  els.renderState.textContent = 'ROUTE NOT ARMED';
  els.renderState.className = 'deck-badge muted';
  els.renderPlan.textContent = 'Jev will arm an executable backend adapter after analysis.';
  els.renderCandidate.disabled = true;
  els.metrics.rms.textContent = '—';
  els.metrics.crest.textContent = '—';
  els.metrics.pitch.textContent = '—';
  els.metrics.notes.textContent = '—';
}

function resetCandidate() {
  state.candidateArtifact = null;
  state.candidateQc = null;
  els.candidateAudio.pause();
  els.candidateAudio.removeAttribute('src');
  els.candidateAudio.load();
  els.candidateAudio.hidden = true;
  els.downloadCandidate.disabled = true;
  els.abSource.disabled = true;
  els.abCandidate.disabled = true;
  els.compareState.textContent = 'NO CANDIDATE';
  els.compareState.className = 'deck-badge muted';
  els.candidateMetrics.textContent = '--';
}

function activePart() {
  return state.project?.parts?.find(part => part.id === state.activePartId) || null;
}

function currentSourceKind() {
  return els.instrument.value === 'unknown' ? 'full_mix' : 'stem';
}

function syncPrimaryActionLabel() {
  if (!els.analyze) return;
  if (!state.backendOnline) {
    els.analyze.textContent = 'BACKEND REQUIRED';
    els.analyze.disabled = true;
    return;
  }
  if (state.project?.source?.kind === 'full_mix') {
    els.analyze.textContent = state.activePartId ? 'ANALYZE SELECTED PART' : 'DECOMPILE FULL MIX';
  } else {
    els.analyze.textContent = 'ANALYZE SELECTED PART';
  }
}

function exportPerformance() {
  if (!state.performance) return;
  downloadJson(`${stripExtension(state.file?.name || 'part')}.performance.json`, state.performance);
  log('EXPORT', 'Backend performance document exported.');
}

function exportProject() {
  if (!state.project) return;
  downloadJson(`${stripExtension(state.file?.name || 'project')}.fidelis-backend.json`, state.project);
  log('EXPORT', 'Authoritative backend project document exported.');
}

function downloadCandidate() {
  if (!state.candidateArtifact) return;
  triggerDownload(backend.artifactUrl(state.candidateArtifact.id), state.candidateArtifact.filename);
  log('EXPORT', `Candidate ${state.candidateArtifact.filename} download started.`);
}

function downloadMaster() {
  if (!state.masterArtifact) return;
  triggerDownload(backend.artifactUrl(state.masterArtifact.id), state.masterArtifact.filename);
  log('EXPORT', `Master ${state.masterArtifact.filename} download started.`);
}

function playAB(which) {
  const source = els.preview;
  const candidate = els.candidateAudio;
  source.pause();
  candidate.pause();
  try { source.currentTime = 0; } catch {}
  try { candidate.currentTime = 0; } catch {}
  const target = which === 'source' ? source : candidate;
  if (which === 'source') source.hidden = false;
  else candidate.hidden = false;
  target.play().catch(error => log('AUDIO', `Playback blocked: ${error.message}`));
  els.compareState.textContent = which === 'source' ? 'A // SOURCE' : 'B // CANDIDATE';
}

function safeToggleSourcePlayback() {
  els.preview.hidden = false;
  if (els.preview.paused) els.preview.play().catch(error => log('AUDIO', `Playback blocked: ${error.message}`));
  else els.preview.pause();
}

async function refreshHarnessContext() {
  if (!state.projectId) return;
  try {
    const ctx = await backend.harnessContext(state.projectId);
    log('HARNESS', `Context refreshed: ${ctx.project?.parts?.length ?? state.project?.parts?.length ?? 0} part(s); authority=Fidelis backend.`);
  } catch (error) {
    log('HARNESS', `Context unavailable: ${error.message}`);
  }
}

function formatQc(report, artifact) {
  const m = report?.metrics || {};
  const size = artifact?.size ? formatBytes(artifact.size) : '--';
  if (!report) return `${artifact?.filename || 'candidate'} // ${size} // QC unavailable`;
  return `${artifact?.filename || 'candidate'} // ${size} // ENERGY ${Number(m.energyEnvelopeCorrelation || 0).toFixed(3)} // ONSET ${Number(m.onsetEnvelopeCorrelation || 0).toFixed(3)} // ΔCENTROID ${Number(m.spectralCentroidMeanAbsoluteDeltaHz || 0).toFixed(0)}Hz`;
}

function setStage(active, doneThrough) {
  const order = ['input', 'analyze', 'route', 'render', 'compare'];
  document.querySelectorAll('.stage').forEach(stage => {
    const id = stage.dataset.stage;
    stage.classList.toggle('active', id === active);
    if (id === active) stage.setAttribute('aria-current', 'step');
    else stage.removeAttribute('aria-current');
    const done = doneThrough ? order.indexOf(id) < order.indexOf(doneThrough) : order.indexOf(id) < order.indexOf(active);
    stage.classList.toggle('done', done);
  });
}

function setBackendState(text, mode) {
  if (!els.backendState) return;
  els.backendState.innerHTML = `<span class="pulse"></span>${escapeHtml(text)}`;
  els.backendState.dataset.mode = mode;
}

function setBusy(button, busy, label = '') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label || 'WORKING…';
    button.disabled = true;
  } else {
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
    button.disabled = false;
  }
}

function requireBackend() {
  if (state.backendOnline) return true;
  log('ERROR', 'The authoritative Fidelis backend is offline.');
  return false;
}

function requireProject() {
  if (!requireBackend()) return false;
  if (state.projectId && state.project) return true;
  log('PROJECT', 'Load a primary source first.');
  return false;
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

function log(label, message) {
  const row = document.createElement('div');
  row.innerHTML = `<time>${escapeHtml(label)}</time><span>${escapeHtml(message)}</span>`;
  els.runLog.prepend(row);
}

function logError(prefix, error) {
  const detail = error instanceof BackendError && error.status ? `${error.status}: ${error.message}` : error.message;
  log('ERROR', `${prefix}: ${detail}`);
}

function triggerDownload(url, filename) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || '';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadJson(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function cleanupUrls() {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
}

function stripExtension(name) { return String(name).replace(/\.[^.]+$/, ''); }

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}
