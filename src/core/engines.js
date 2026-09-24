export const ENGINES = [
  { id: 'rave', name: 'Scyclone / RAVE', type: 'direct transfer', mode: 'adapter', description: 'Real-time neural timbre transfer while preserving performance timing.' },
  { id: 'brave', name: 'BRAVE', type: 'direct transfer', mode: 'adapter', description: 'Low-latency instrumental timbre transfer research path.' },
  { id: 'sony-diffusion', name: 'Sony Diffusion', type: 'direct transfer', mode: 'adapter', description: 'Diffusion-based musical timbre transfer benchmark.' },
  { id: 'wavetransfer', name: 'WaveTransfer', type: 'direct transfer', mode: 'adapter', description: 'Multi-instrument diffusion timbre transfer.' },
  { id: 'ddsp', name: 'Google DDSP', type: 'structured synthesis', mode: 'adapter', description: 'Pitch + loudness + learned timbre synthesis and transfer.' },
  { id: 'midi-ddsp', name: 'MIDI-DDSP', type: 'performance model', mode: 'reference', description: 'Score, performance and synthesis separation; architecture reference.' },
  { id: 'basic-pitch', name: 'Basic Pitch', type: 'transcription', mode: 'adapter', description: 'Audio-to-notes/MIDI with pitch-bend support.' },
  { id: 'stradi', name: 'STRAdi', type: 'violin transcription', mode: 'adapter', description: 'Violin-specific transcription path for fiddle/violin stems.' },
  { id: 'instrudio', name: 'Instrudio Violin', type: 'physical renderer', mode: 'adapter', description: 'Physical violin controls: bow, vibrato, portamento and articulation.' },
  { id: 'libertydj', name: 'LibertyDJ Intelligence', type: 'ecosystem', mode: 'available', description: 'ONNX/WebGPU/WASM worker patterns, beat and semantic analysis.' },
  { id: 'libertas', name: 'LibertasDesktop', type: 'ecosystem', mode: 'available', description: 'Native PCM, aligned stems, DSP and 48 kHz rendering chassis.' },
  { id: 'aivideoedit', name: 'AIVideoEdit', type: 'ecosystem', mode: 'available', description: 'FFT, onset, energy, phrase/QC and orchestration utilities.' },
];

export const ROUTES = {
  direct: { id: 'direct', name: 'Direct timbre transfer', stack: 'RAVE / BRAVE / Sony / WaveTransfer', description: 'Fastest A/B path. Preserve timing and phrasing directly in audio.' },
  ddsp: { id: 'ddsp', name: 'Structured DDSP reconstruction', stack: 'F0 + dynamics → DDSP', description: 'Separate continuous performance controls from timbre and rebuild the sound with a structured synthesizer.' },
  physical: { id: 'physical', name: 'Performance → physical renderer', stack: 'STRAdi / Basic Pitch → Fidelis → Instrudio', description: 'Discard the source waveform and preserve the musical gesture.' }
};
