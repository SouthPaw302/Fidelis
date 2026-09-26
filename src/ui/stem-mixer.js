import {
  ensureSharedAudio,
  setTempo,
  updateChannelMixer,
  validateSharedAudio,
} from '../core/shared-audio.js';

const $ = selector => document.querySelector(selector);
const els = {
  mixer: $('#stemMixer'),
  status: $('#mixerState'),
  bpm: $('#mixerBpm'),
};

let project = null;

window.addEventListener('fidelis:project', event => {
  project = event.detail?.project || null;
  renderMixer();
});

els.bpm?.addEventListener('change', () => {
  if (!project) return;
  try {
    const tempo = setTempo(project, els.bpm.value || null, { source: 'manual', confidence: 1 });
    els.bpm.value = tempo.bpm || '';
    announceChange();
  } catch (error) {
    els.status.textContent = error.message;
  }
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
  const channelId = input.dataset.channelId;
  const field = input.dataset.field;
  const value = Number(input.value);
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
    return;
  }
  const shared = ensureSharedAudio(project);
  const validation = validateSharedAudio(project);
  if (els.bpm) els.bpm.value = shared.tempo.bpm || '';
  els.status.textContent = validation.valid
    ? `${shared.channels.length} CHANNEL${shared.channels.length === 1 ? '' : 'S'} · CONTRACT READY`
    : 'SHARED CONTRACT INVALID';
  els.mixer.innerHTML = shared.channels.map(renderChannel).join('') || '<div class="mixer-empty">No mixer channels yet.</div>';
}

function renderChannel(channel) {
  const m = channel.mixer;
  return `<article class="mixer-channel" data-kind="${escapeHtml(channel.kind)}">
    <header class="mixer-channel-head">
      <div><strong>${escapeHtml(channel.label)}</strong><small>${escapeHtml(channel.instrument)} · ${escapeHtml(channel.kind)}</small></div>
      <span>${channel.rebuild?.selected === 'reconstruction' ? 'REBUILT' : 'ORIGINAL'}</span>
    </header>
    <div class="mixer-toggle-row">
      ${toggleButton(channel, 'mute', 'M')}
      ${toggleButton(channel, 'solo', 'S')}
      ${toggleButton(channel, 'cue', 'CUE')}
    </div>
    ${slider(channel, 'gainDb', 'GAIN', -24, 6, .5, m.gainDb)}
    ${slider(channel, 'pan', 'PAN', -1, 1, .01, m.pan)}
    <div class="mixer-eq">
      ${slider(channel, 'lowDb', 'LOW', -12, 12, .5, m.eq.lowDb)}
      ${slider(channel, 'midDb', 'MID', -12, 12, .5, m.eq.midDb)}
      ${slider(channel, 'highDb', 'HIGH', -12, 12, .5, m.eq.highDb)}
    </div>
    <footer><span>${channel.clip.loop.bars} BAR LOOP READY</span><span>LIBERTAS CONTRACT READY</span></footer>
  </article>`;
}

function toggleButton(channel, action, label) {
  const active = channel.mixer[action];
  return `<button class="mixer-toggle ${active ? 'active' : ''}" data-channel-id="${escapeHtml(channel.id)}" data-action="${action}" aria-pressed="${active}">${label}</button>`;
}

function slider(channel, field, label, min, max, step, value) {
  return `<label class="mixer-control"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-channel-id="${escapeHtml(channel.id)}" data-field="${field}"><output>${formatControl(field, value)}</output></label>`;
}

function formatControl(field, value) {
  if (field === 'pan') {
    if (Math.abs(value) < .01) return 'C';
    return value < 0 ? `L${Math.round(Math.abs(value) * 100)}` : `R${Math.round(value * 100)}`;
  }
  return `${Number(value).toFixed(1)} dB`;
}

function announceChange(render = false) {
  const shared = ensureSharedAudio(project);
  window.dispatchEvent(new CustomEvent('fidelis:shared-audio', { detail: { project, sharedAudio: shared } }));
  if (render) renderMixer();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}
