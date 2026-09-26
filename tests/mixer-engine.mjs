import assert from 'node:assert/strict';
import { createProject, addPrimarySource, addSuppliedStem } from '../src/core/project.js';
import { ensureSharedAudio, updateChannelMixer, updateMasterMixer } from '../src/core/shared-audio.js';
import { BrowserMixerEngine, dbToGain } from '../src/audio/mixer-engine.js';

class Param { constructor(v=0){this.value=v;} setValueAtTime(v){this.value=v;} }
class Node { constructor(){this.connections=[];} connect(n){this.connections.push(n); return n;} disconnect(){this.connections=[];} }
class Gain extends Node { constructor(){super();this.gain=new Param(1);} }
class Pan extends Node { constructor(){super();this.pan=new Param(0);} }
class Biquad extends Node { constructor(){super();this.gain=new Param(0);this.frequency=new Param(0);this.Q=new Param(0);this.type='';} }
class Compressor extends Node { constructor(){super();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();} }
class Source extends Node { constructor(){super();this.buffer=null;this.started=null;this.stopped=false;} start(when,offset){this.started={when,offset};} stop(){this.stopped=true;} }
class FakeAudioContext { constructor(){this.destination=new Node();this.currentTime=1;this.state='running';this.sources=[];} createGain(){return new Gain();} createStereoPanner(){return new Pan();} createBiquadFilter(){return new Biquad();} createDynamicsCompressor(){return new Compressor();} createBufferSource(){const s=new Source();this.sources.push(s);return s;} async resume(){this.state='running';} }

const project=createProject({name:'Step 4',sourceKind:'full_mix',createdAt:'2026-09-25T00:00:00.000Z'});
const source=addPrimarySource(project,{fileName:'song.wav',durationSec:120,sampleRate:48000,channels:2});
const bassPart=addSuppliedStem(project,{fileName:'bass.wav',durationSec:120,sampleRate:48000,channels:2},{instrument:'bass',label:'Bass'});
const shared=ensureSharedAudio(project);
const sourceChannel=shared.channels.find(c=>c.assetId===source.id);
const bass=shared.channels.find(c=>c.partId===bassPart.id);
updateChannelMixer(project, sourceChannel.id, { mute:true });
updateChannelMixer(project, bass.id, { gainDb:-6, pan:.25, eq:{lowDb:3,midDb:-2,highDb:1}, solo:true, cue:true });
updateMasterMixer(project,{gainDb:-3,cueMonitor:false});

const engine=new BrowserMixerEngine({AudioContextCtor:FakeAudioContext});
engine.registerBuffer(source.id,{duration:120});
engine.registerBuffer(bass.assetId,{duration:120});
engine.setProject(project);
let snap=engine.inspect();
assert.equal(snap.buffers,2);
assert.equal(snap.channels[sourceChannel.id].mainGate,0);
assert.equal(snap.channels[bass.id].mainGate,1);
assert.equal(snap.channels[bass.id].cueGate,1);
assert.ok(Math.abs(snap.channels[bass.id].gain-dbToGain(-6))<1e-9);
assert.equal(snap.channels[bass.id].pan,.25);
assert.equal(snap.channels[bass.id].lowDb,3);
assert.equal(snap.channels[bass.id].midDb,-2);
assert.equal(snap.channels[bass.id].highDb,1);
assert.ok(Math.abs(snap.masterGain-dbToGain(-3))<1e-9);
assert.equal(snap.cueGain,0);

updateMasterMixer(project,{cueMonitor:true}); engine.syncMix(); snap=engine.inspect();
assert.equal(snap.masterGain,0);
assert.ok(Math.abs(snap.cueGain-dbToGain(-3))<1e-9);
const started=await engine.play();
assert.equal(started,2); assert.equal(engine.inspect().playing,true);
assert.equal(engine.context.sources.length,2);
engine.stop(); assert.equal(engine.inspect().playing,false);
console.log('FIDELIS AUDIBLE MIXER ENGINE: PASS');
