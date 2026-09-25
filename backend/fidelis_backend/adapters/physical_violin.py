from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from scipy import signal

from .base import Capability


class PhysicalViolinRenderer:
    """Deterministic bowed-string renderer for recovered violin/fiddle performance.

    This is a Fidelis-native implementation based on general bowed-string physical
    synthesis ideas: Helmholtz-like harmonic weighting, continuous pitch motion,
    bow-noise excitation, mild inharmonic chorus and resonant body coloration.
    It intentionally shares no source code with third-party instrument projects.
    """

    id = 'fidelis-physical-violin'
    kind = 'renderer'
    version = '0.1'

    def capability(self) -> Capability:
        return Capability(
            self.id,
            self.kind,
            'ready',
            'Fidelis Physical Violin',
            'Deterministic bowed-string physical renderer for violin/fiddle performance maps.',
            version=self.version,
            execution='native',
            metadata={
                'sampleRate': 48000,
                'model': 'helmholtz-harmonic+body-resonance',
                'sourceWaveformReuse': False,
            },
        )

    def run(self, performance: dict[str, Any], output: Path, *, sample_rate: int = 48000,
            preset: str = 'solo-cantabile') -> dict[str, Any]:
        notes = performance.get('performance') or []
        if not notes:
            raise RuntimeError('physical violin renderer requires performance events')
        instrument = str((performance.get('source') or {}).get('instrument') or 'unknown').lower()
        if instrument not in {'fiddle', 'violin', 'strings', 'unknown'}:
            raise RuntimeError(f'physical violin renderer cannot render instrument={instrument!r}')

        duration = max(
            float((performance.get('source') or {}).get('durationSec') or 0.0),
            max(float(n.get('start') or 0.0) + float(n.get('duration') or 0.0) for n in notes) + 0.18,
        )
        n_samples = max(1, int(math.ceil(duration * sample_rate)))
        mono = np.zeros(n_samples, dtype=np.float64)

        preset_values = self._preset(preset)
        for index, note in enumerate(notes):
            self._render_note(mono, sample_rate, note, index=index, preset=preset_values)

        mono = self._body_response(mono, sample_rate, brightness=preset_values['brightness'])
        mono = self._soft_limit(mono)

        # A tiny decorrelated stereo field; no source waveform is used.
        delay = max(1, int(sample_rate * 0.00065))
        right = np.zeros_like(mono)
        right[delay:] = mono[:-delay]
        right = 0.94 * right + 0.06 * mono
        left = mono
        stereo = np.stack([left, right], axis=1)
        peak = float(np.max(np.abs(stereo)))
        if peak > 0.92:
            stereo *= 0.92 / peak
        rms = float(np.sqrt(np.mean(stereo ** 2, dtype=np.float64)))

        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output, stereo.astype(np.float32), sample_rate, subtype='PCM_24')
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        return {
            'schema': 'fidelis.render.v0.1',
            'adapterId': self.id,
            'version': self.version,
            'path': str(output),
            'sampleRate': sample_rate,
            'channels': 2,
            'durationSec': len(stereo) / sample_rate,
            'rms': rms,
            'peak': float(np.max(np.abs(stereo))),
            'sha256': digest,
            'preset': preset,
            'sourceWaveformReuse': False,
            'model': 'helmholtz-harmonic+bow-noise+body-resonance',
        }

    def _render_note(self, dst: np.ndarray, sr: int, note: dict[str, Any], *, index: int,
                     preset: dict[str, float]) -> None:
        start = max(0, int(float(note.get('start') or 0.0) * sr))
        duration = max(0.035, float(note.get('duration') or 0.08))
        end = min(len(dst), start + int(math.ceil(duration * sr)))
        if end <= start:
            return
        length = end - start
        t = np.arange(length, dtype=np.float64) / sr
        local = np.clip(t / max(duration, 1e-9), 0.0, 1.0)

        base_hz = max(40.0, float(note.get('hz') or 440.0))
        start_cents = float(note.get('pitchStartCents') or 0.0)
        end_cents = float(note.get('pitchEndCents') or 0.0)
        slide_cents = start_cents + (end_cents - start_cents) * local
        vibrato_hz = float(note.get('vibratoHz') or 0.0)
        vibrato_depth = float(note.get('vibratoDepthCents') or 0.0)
        if vibrato_hz > 0 and vibrato_depth > 0:
            # Fade vibrato in; avoids synthetic full-depth onset.
            vib_env = np.clip((t - 0.08) / 0.18, 0.0, 1.0)
            slide_cents += np.sin(2 * math.pi * vibrato_hz * t) * vibrato_depth * vib_env
        inst_hz = base_hz * np.power(2.0, slide_cents / 1200.0)
        phase = np.cumsum((2 * math.pi / sr) * inst_hz)

        dynamics = max(0.0, float(note.get('dynamics') or 0.08))
        confidence = np.clip(float(note.get('confidence') or 0.65), 0.0, 1.0)
        bow_pressure = float(np.clip(preset['bowPressure'] * (0.78 + dynamics * 1.7), 0.16, 0.96))
        bow_speed = float(np.clip(preset['bowSpeed'] * (0.86 + dynamics * 1.4), 0.16, 1.0))
        bow_point = float(np.clip(preset['bowPoint'] + (0.5 - confidence) * 0.05, 0.18, 0.82))
        D = float(np.clip(0.34 + bow_point * 0.32 + (bow_pressure - 0.5) * 0.06, 0.24, 0.76))

        # General Helmholtz-style Fourier weighting. Preserve coefficient sign.
        voice = np.zeros(length, dtype=np.float64)
        norm = 0.0
        nyquist = sr * 0.46
        max_harm = min(28, max(3, int(nyquist / max(base_hz, 1.0))))
        for harmonic in range(1, max_harm + 1):
            coeff = -(2.0 / (harmonic * harmonic * math.pi * math.pi * D * (1.0 - D))) * math.sin(harmonic * math.pi * D)
            if harmonic == 2:
                coeff *= 1.28  # restore some bowed-string H2 energy lost by 1/n² rolloff
            voice += coeff * np.sin(phase * harmonic)
            norm += abs(coeff)
        if norm > 1e-9:
            voice /= norm

        # Mild string stiffness / independent contact-point beating.
        cents = 2.1 + 1.2 * bow_pressure
        detune = 2 ** (cents / 1200.0)
        voice += 0.13 * np.sin(phase * detune) + 0.13 * np.sin(phase / detune)

        # Deterministic bow texture, high-passed then lightly band-limited.
        rng = np.random.default_rng(0xF1DE11 + index * 7919)
        noise = rng.normal(0.0, 1.0, length)
        if length > 3:
            noise = np.concatenate(([0.0], np.diff(noise)))
            b, a = signal.butter(1, min(0.95, 9000 / (sr / 2)), btype='lowpass')
            noise = signal.lfilter(b, a, noise)
        noise_gain = 0.012 + 0.028 * bow_pressure * bow_speed

        attack_name = str(note.get('attack') or 'medium')
        attack = preset['attack']
        if attack_name == 'firm':
            attack *= 0.55
        elif attack_name == 'soft':
            attack *= 1.45
        attack = min(duration * 0.32, max(0.006, attack))
        release = min(duration * 0.30, 0.09 + 0.05 * (1.0 - bow_speed))
        env = np.ones(length, dtype=np.float64)
        a_len = min(length, max(1, int(attack * sr)))
        env[:a_len] = np.sin(np.linspace(0, math.pi / 2, a_len, endpoint=True)) ** 1.45
        r_len = min(length, max(1, int(release * sr)))
        env[-r_len:] *= np.cos(np.linspace(0, math.pi / 2, r_len, endpoint=True)) ** 1.35

        level = np.clip(0.12 + dynamics * 2.8, 0.14, 0.82) * preset['volume']
        sample = (voice + noise * noise_gain) * env * level
        dst[start:end] += sample

    @staticmethod
    def _body_response(x: np.ndarray, sr: int, *, brightness: float) -> np.ndarray:
        if not len(x):
            return x
        # Broad resonant modes typical of a small bowed-string body. Values are
        # intentionally generic rather than copied from a third-party instrument.
        modes = [
            (275.0, 4.0, 0.11),
            (465.0, 5.0, 0.10),
            (535.0, 5.5, 0.09),
            (620.0, 5.0, 0.08),
            (1050.0, 3.2, 0.045),
            (2850.0, 6.0, 0.06 + brightness * 0.035),
            (4400.0, 5.0, 0.025 + brightness * 0.035),
        ]
        y = x * 0.72
        for freq, q, mix in modes:
            if freq >= sr * 0.47:
                continue
            b, a = signal.iirpeak(freq / (sr / 2), Q=q)
            resonant = signal.lfilter(b, a, x)
            y += resonant * mix
        cutoff = 7500 + brightness * 4500
        cutoff = min(cutoff, sr * 0.45)
        b, a = signal.butter(2, cutoff / (sr / 2), btype='lowpass')
        return signal.lfilter(b, a, y)

    @staticmethod
    def _soft_limit(x: np.ndarray) -> np.ndarray:
        return np.tanh(x * 1.35) / math.tanh(1.35)

    @staticmethod
    def _preset(name: str) -> dict[str, float]:
        presets = {
            'solo-cantabile': {'bowPressure': 0.60, 'bowSpeed': 0.55, 'bowPoint': 0.58, 'attack': 0.070, 'brightness': 0.72, 'volume': 0.74},
            'warm-ensemble': {'bowPressure': 0.50, 'bowSpeed': 0.46, 'bowPoint': 0.54, 'attack': 0.095, 'brightness': 0.55, 'volume': 0.70},
            'baroque': {'bowPressure': 0.46, 'bowSpeed': 0.62, 'bowPoint': 0.64, 'attack': 0.052, 'brightness': 0.60, 'volume': 0.72},
            'sul-pont': {'bowPressure': 0.74, 'bowSpeed': 0.42, 'bowPoint': 0.79, 'attack': 0.040, 'brightness': 0.96, 'volume': 0.66},
        }
        return presets.get(name, presets['solo-cantabile'])
