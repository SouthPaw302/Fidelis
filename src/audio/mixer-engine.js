import { ensureSharedAudio } from '../core/shared-audio.js';

export class BrowserMixerEngine {
  constructor({ AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
    if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');
    this.context = new AudioContextCtor();
    this.buffers = new Map();
    this.strips = new Map();
    this.sources = new Map();
    this.project = null;
    this.playing = false;
    this.startedAt = 0;

    this.masterBus = this.context.createGain();
    this.cueBus = this.context.createGain();
    this.masterOutput = this.context.createGain();
    this.cueOutput = this.context.createGain();
    this.safety = this.context.createDynamicsCompressor();

    this.masterBus.connect(this.masterOutput);
    this.cueBus.connect(this.cueOutput);
    this.masterOutput.connect(this.safety);
    this.cueOutput.connect(this.safety);
    this.safety.connect(this.context.destination);

    setParam(this.safety.threshold, -1);
    setParam(this.safety.knee, 0);
    setParam(this.safety.ratio, 20);
    setParam(this.safety.attack, 0.003);
    setParam(this.safety.release, 0.1);
  }

  registerBuffer(assetId, audioBuffer) {
    if (!assetId || !audioBuffer) throw new Error('assetId and AudioBuffer are required.');
    this.buffers.set(assetId, audioBuffer);
    return this.buffers.size;
  }

  unregisterAll() {
    this.stop();
    this.buffers.clear();
    for (const strip of this.strips.values()) disconnectStrip(strip);
    this.strips.clear();
    this.project = null;
  }

  setProject(project) {
    this.project = project || null;
    if (!project) return;
    const shared = ensureSharedAudio(project);
    for (const channel of shared.channels) this.ensureStrip(channel.id);
    for (const id of [...this.strips.keys()]) {
      if (!shared.channels.some(channel => channel.id === id)) {
        disconnectStrip(this.strips.get(id));
        this.strips.delete(id);
      }
    }
    this.syncMix();
  }

  ensureStrip(channelId) {
    if (this.strips.has(channelId)) return this.strips.get(channelId);
    const low = this.context.createBiquadFilter(); low.type = 'lowshelf'; setParam(low.frequency, 180);
    const mid = this.context.createBiquadFilter(); mid.type = 'peaking'; setParam(mid.frequency, 1200); setParam(mid.Q, 0.9);
    const high = this.context.createBiquadFilter(); high.type = 'highshelf'; setParam(high.frequency, 6500);
    const fader = this.context.createGain();
    const mainPan = this.context.createStereoPanner();
    const mainGate = this.context.createGain();
    const cuePan = this.context.createStereoPanner();
    const cueGate = this.context.createGain();

    low.connect(mid); mid.connect(high);
    high.connect(fader); fader.connect(mainPan); mainPan.connect(mainGate); mainGate.connect(this.masterBus);
    high.connect(cuePan); cuePan.connect(cueGate); cueGate.connect(this.cueBus);

    const strip = { input: low, low, mid, high, fader, mainPan, mainGate, cuePan, cueGate };
    this.strips.set(channelId, strip);
    return strip;
  }

  syncMix() {
    if (!this.project) return;
    const shared = ensureSharedAudio(this.project);
    const anySolo = shared.channels.some(channel => channel.mixer.solo);
    for (const channel of shared.channels) {
      const strip = this.ensureStrip(channel.id);
      const m = channel.mixer;
      setParam(strip.low.gain, m.eq.lowDb);
      setParam(strip.mid.gain, m.eq.midDb);
      setParam(strip.high.gain, m.eq.highDb);
      setParam(strip.fader.gain, dbToGain(m.gainDb));
      setParam(strip.mainPan.pan, m.pan);
      setParam(strip.cuePan.pan, m.pan);
      const mainAudible = !m.mute && (!anySolo || m.solo);
      setParam(strip.mainGate.gain, mainAudible ? 1 : 0);
      setParam(strip.cueGate.gain, m.cue ? 1 : 0);
    }
    setParam(this.masterOutput.gain, shared.master.cueMonitor ? 0 : dbToGain(shared.master.gainDb));
    setParam(this.cueOutput.gain, shared.master.cueMonitor ? dbToGain(shared.master.gainDb) : 0);
  }

  async play({ offsetSec = 0 } = {}) {
    if (!this.project) throw new Error('Load a Fidelis project before playback.');
    await this.context.resume?.();
    this.stop();
    this.syncMix();
    const shared = ensureSharedAudio(this.project);
    let started = 0;
    for (const channel of shared.channels) {
      const buffer = this.buffers.get(channel.assetId);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.ensureStrip(channel.id).input);
      const clipStart = Math.max(0, Number(channel.clip?.startSec || 0));
      const requested = Math.max(0, Number(offsetSec || 0));
      const startOffset = Math.min(buffer.duration || Infinity, clipStart + requested);
      source.start(0, startOffset);
      source.onended = () => { this.sources.delete(channel.id); if (!this.sources.size) this.playing = false; };
      this.sources.set(channel.id, source);
      started++;
    }
    if (!started) throw new Error('No decoded mixer buffers are available.');
    this.playing = true;
    this.startedAt = this.context.currentTime;
    return started;
  }

  stop() {
    for (const source of this.sources.values()) { try { source.stop(); } catch {} try { source.disconnect(); } catch {} }
    this.sources.clear();
    this.playing = false;
  }

  inspect() {
    const channels = {};
    for (const [id, s] of this.strips) channels[id] = { lowDb:s.low.gain.value, midDb:s.mid.gain.value, highDb:s.high.gain.value, gain:s.fader.gain.value, pan:s.mainPan.pan.value, mainGate:s.mainGate.gain.value, cueGate:s.cueGate.gain.value };
    return { playing:this.playing, buffers:this.buffers.size, masterGain:this.masterOutput.gain.value, cueGain:this.cueOutput.gain.value, channels };
  }
}

export const dbToGain = db => Math.pow(10, Number(db || 0) / 20);
function setParam(param, value){ if(param?.setValueAtTime) param.setValueAtTime(Number(value), 0); else if(param) param.value = Number(value); }
function disconnectStrip(strip){ for(const node of Object.values(strip||{})){ try { node?.disconnect?.(); } catch {} } }
