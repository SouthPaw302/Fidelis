from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np

from .base import Capability
from ..audio_utils import write_wav


class ReferenceRenderer:
    id = 'fidelis-reference-synth'
    kind = 'renderer'

    def capability(self) -> Capability:
        return Capability(self.id, self.kind, 'ready', 'Fidelis Reference Synth',
                          'Pipeline-validation renderer; not a fidelity renderer.', version='0.1')

    def run(self, performance: dict[str, Any], output: Path, *, sample_rate: int = 48000) -> dict[str, Any]:
        notes = performance.get('performance') or []
        if not notes:
            raise RuntimeError('reference renderer requires performance events')
        source_duration = float((performance.get('source') or {}).get('durationSec') or 0)
        last_end = max(float(n.get('start', 0)) + float(n.get('duration', 0)) for n in notes)
        duration = max(source_duration, last_end + .05)
        pcm = np.zeros(max(1, int(math.ceil(duration * sample_rate))), dtype=np.float32)
        for note in notes:
            self._note(pcm, sample_rate, note)
        peak = float(np.max(np.abs(pcm)))
        if peak > .86:
            pcm *= .86 / peak
        write_wav(output, pcm, sample_rate)
        rms = float(np.sqrt(np.mean(np.square(pcm), dtype=np.float64)))
        return {'adapterId': self.id, 'path': str(output), 'sampleRate': sample_rate, 'durationSec': len(pcm) / sample_rate,
                'rms': rms, 'peak': float(np.max(np.abs(pcm))), 'disclaimer': 'Pipeline reference only; not a fidelity renderer.'}

    def _note(self, pcm: np.ndarray, sr: int, note: dict[str, Any]) -> None:
        start = max(0, int(float(note.get('start', 0)) * sr))
        duration = max(.02, float(note.get('duration', .1)))
        end = min(len(pcm), start + int(duration * sr))
        if end <= start:
            return
        hz0 = float(note.get('hz') or 440)
        vib_hz = max(0.0, float(note.get('vibratoHz') or 0))
        vib_depth = max(0.0, float(note.get('vibratoDepthCents') or 0))
        dyn = min(.72, max(.08, float(note.get('dynamics') or .12) * 3.4))
        attack_name = str(note.get('attack') or 'medium')
        attack = min(duration * .3, .008 if attack_name == 'firm' else .045 if attack_name == 'soft' else .02)
        release = min(duration * .35, .06)
        phase = 0.0
        pitch_start = float(note.get('pitchStartCents') or 0)
        pitch_end = float(note.get('pitchEndCents') or 0)
        for i in range(start, end):
            t = (i - start) / sr
            local = t / duration
            vib = math.sin(2 * math.pi * vib_hz * t) * vib_depth if vib_hz else 0.0
            slide = pitch_start + (pitch_end - pitch_start) * min(1, max(0, local))
            hz = hz0 * 2 ** ((vib + slide) / 1200)
            phase += 2 * math.pi * hz / sr
            attack_gain = min(1.0, t / attack) if attack else 1.0
            rs = max(0, duration - release)
            release_gain = min(1.0, max(0.0, (duration - t) / release)) if t >= rs and release else 1.0
            tone = math.sin(phase) + .28 * math.sin(phase * 2.01) + .12 * math.sin(phase * 3.0)
            pcm[i] += tone * dyn * attack_gain * release_gain / 1.4
