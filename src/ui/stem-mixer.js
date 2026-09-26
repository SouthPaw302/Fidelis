import {
  ensureSharedAudio,
  setTempo,
  updateChannelMixer,
  updateMasterMixer,
  validateSharedAudio,
} from '../core/shared-audio.js';
import { BrowserMixerEngine } from '../audio/mixer-engine.js';

const $ = selector => document.querySelector(selector);
const els = {
  mixer: $('#stemMixer'), status: $('#mixerState'), bpm: $('#mixerBpm'), play: $('#playBtn'),
  masterGain: $('#masterGain'), masterGainReadout: $('#masterGainReadout'), cueMonitor: $('#cueMonitorBtn'), dspState: $('#dspState'),
};

let project = null;
let engine = null;

function getEngine() {
  if (engine) return engine;
  try {
    engine = new BrowserMixerEngine();
    setDspState('DSP READY');
    return engine;
  } catch (error) {
    setDspState('WEB AUDIO UNAVAILABLE');
    if (els.status) els.status.textContent = error.message;
    return null;
  }
}

window.addEventListener('fidelis:project', event => {
  project = event.detail?.project || null;
  if (project) getEngine()?.setProject(project);
  renderMixer();
});

window.addEventListener('fidelis:audio-buffer', event => {
  const { assetId, buffer } = event.detail || {};
  if (!assetId || !buffer) return;
  const runtime = getEngine();
  if (!runtime) return;
  runtime.registerBuffer(assetId, buffer);
  if (project) runtime.setProject(project);
  setDspState(`${runtime.inspect().buffers} BUFFER${runtime.inspect().buffers === 1 ? '' : 'S'} READY`);
});

window.addEventListener('fidelis:audio-reset', () => {
  engine?.unregisterAll();
  project = null;
  setPlayState(false);
  setDspState('DSP IDLE');
});

els.play?.addEventListener('click', async () => {
  const runtime = getEngine();
  if (!runtime || !project) return;
  try {
    if (runtime.playing) {
      runtime.stop();
      setPlayState(false);
      setDspState('MIX STOPPED');
    } else {
      const count = await runtime.play();
      setPlayState(true);
      setDspState(`${count} CHANNEL${count === 1 ? '' : 'S'} PLAYING`);
    }
  } catch (error) {
    setPlayState(false);
    setDspState(error.message);
  }
});

els.bpm?.addEventListener('change', () => {
  if (!project) return;
  try {
    const tempo = setTempo(project, els.bpm.value || null, { source: 'manual', confidence: 1 });
    els.bpm.value = tempo.bpm || '';
    announceChange();
  } catch (error) { els.status.textContent = error.message; }
});

els.masterGain?.addEventListener('input', () => {
  if (!project) return;
  const value = Number(els.masterGain.value);
  updateMasterMixer(project, { gainDb: value });
  if (els.masterGainReadout) els.masterGainReadout.textContent = `${value.toFixed(1)} dB`;
  announceChange(false);
});

els.cueMonitor?.addEventListener('click', () => {
  if (!project) return;
  const shared = ensureSharedAudio(project);
  updateMasterMixer(project, { cueMonitor: !shared.master.cueMonitor });
  announceChange();
  renderMixer();
});

els.mixer?.addEventListener('click', event => {
  const button = event.target.closest('button[data-channel-id][data-action]');
  if (!button || !project) return;
  const channel = ensureSharedAudio(project).channels.find(item => item.id === button.dataset.channelId);
  if (!channel) return;
  const action = button.dataset.action;
  if (!['mute', 'solo', 'cue'].includes(action)) return;
  updateChannelMixer(project, channel.id, { [action]: !channel.mixer[action] });
  announceChange();
  renderMixer();
});

els.mixer?.addEventListener('input', event => {
  const input = event.target.closest('input[data-channel-id][data-field]');
  if (!input || !project) return;
  const channelId = input.dataset.channelId; const field = input.dataset.field; const value = Number(input.value);
  if (field === 'gainDb') updateChannelMixer(project, channelId, { gainDb: value });
  if (field === 'pan') updateChannelMixer(project, channelId, { pan: value });
  if (field === 'lowDb') updateChannelMixer(project, channelId, { eq: { lowDb: value } });
  if (field === 'midDb') updateChannelMixer(project, channelId, { eq: { midDb: value } });
  if (field === 'highDb') updateChannelMixer(project, channelId, { eq: { highDb: value } });
  const readout = input.closest('.mixer-control')?.querySelector('output');
  if (readout) readout.textContent = formatControl(field, value);
  announceChange(false);
});

function renderMixer() {
  if (!els.mixer || !els.status) return;
  if (!project) {
    els.mixer.innerHTML = '<div class="mixer-empty">Load a song or stem to create the shared source channel.</div>';
    els.status.textContent = 'WAITING FOR PROJECT';
    if (els.bpm) els.bpm.value = '';
    if (els.masterGain) els.masterGain.value = '0';
    if (els.masterGainReadout) els.masterGainReadout.textContent = '0.0 dB';
    if (els.cueMonitor) { els.cueMonitor.textContent = 'CUE MONITOR OFF'; els.cueMonitor.classList.remove('active'); }
    return;
  }
  const shared = ensureSharedAudio(project); const validation = validateSharedAudio(project); const runtime = getEngine();
  runtime?.setProject(project);
  if (els.bpm) els.bpm.value = shared.tempo.bpm || '';
  if (els.masterGain) els.masterGain.value = shared.master.gainDb;
  if (els.masterGainReadout) els.masterGainReadout.textContent = `${Number(shared.master.gainDb).toFixed(1)} dB`;
  if (els.cueMonitor) { els.cueMonitor.textContent = shared.master.cueMonitor ? 'CUE MONITOR ON' : 'CUE MONITOR OFF'; els.cueMonitor.classList.toggle('active', shared.master.cueMonitor); }
  els.status.textContent = validation.valid ? `${shared.channels.length} CHANNEL${shared.channels.length === 1 ? '' : 'S'} · DSP ${runtime ? 'READY' : 'OFFLINE'}` : 'SHARED CONTRACT INVALID';
  els.mixer.innerHTML = shared.channels.map(renderChannel).join('') || '<div class="mixer-empty">No mixer channels yet.</div>';
  if (els.play) els.play.textContent = runtime?.playing ? '■ STOP MIX' : '▶ PLAY MIX';
}

function renderChannel(channel) {
  const m = channel.mixer;
  return `<article class="mixer-channel" data-kind="${escapeHtml(channel.kind)}"><header class="mixer-channel-head"><div><strong>${escapeHtml(channel.label)}</strong><small>${escapeHtml(channel.instrument)} · ${escapeHtml(channel.kind)}</small></div><span>${channel.rebuild?.selected === 'reconstruction' ? 'REBUILT' : 'ORIGINAL'}</span></header><div class="mixer-toggle-row">${toggleButton(channel,'mute','M')}${toggleButton(channel,'solo','S')}${toggleButton(channel,'cue','CUE')}</div>${slider(channel,'gainDb','GAIN',-24,6,.5,m.gainDb)}${slider(channel,'pan','PAN',-1,1,.01,m.pan)}<div class="mixer-eq">${slider(channel,'lowDb','LOW',-12,12,.5,m.eq.lowDb)}${slider(channel,'midDb','MID',-12,12,.5,m.eq.midDb)}${slider(channel,'highDb','HIGH',-12,12,.5,m.eq.highDb)}</div><footer><span>WEB AUDIO DSP</span><span>${channel.clip.loop.bars} BAR LOOP NEXT</span></footer></article>`;
}
function toggleButton(channel, action, label){ const active=channel.mixer[action]; return `<button class="mixer-toggle ${active?'active':''}" data-channel-id="${escapeHtml(channel.id)}" data-action="${action}" aria-pressed="${active}">${label}</button>`; }
function slider(channel,field,label,min,max,step,value){ return `<label class="mixer-control"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-channel-id="${escapeHtml(channel.id)}" data-field="${field}"><output>${formatControl(field,value)}</output></label>`; }
function formatControl(field,value){ if(field==='pan'){ if(Math.abs(value)<.01)return 'C'; return value<0?`L${Math.round(Math.abs(value)*100)}`:`R${Math.round(value*100)}`;} return `${Number(value).toFixed(1)} dB`; }
function announceChange(render=false){ const shared=ensureSharedAudio(project); engine?.syncMix(); window.dispatchEvent(new CustomEvent('fidelis:shared-audio',{detail:{project,sharedAudio:shared}})); if(render)renderMixer(); }
function setPlayState(playing){ if(els.play) els.play.textContent=playing?'■ STOP MIX':'▶ PLAY MIX'; }
function setDspState(message){ if(els.dspState) els.dspState.textContent=message; }
function escapeHtml(value){ return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
