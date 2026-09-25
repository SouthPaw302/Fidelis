from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from scipy import signal

from .base import Capability

VENDOR_ROOT = Path(__file__).resolve().parents[2] / 'vendor' / 'instrudio'
DEFINITION_PATH = VENDOR_ROOT / 'studio_violin.json'
LICENSE_PATH = VENDOR_ROOT / 'LICENSE'


class InstrudioViolinRenderer:
    """Offline adaptation of Instrudio Studio Violin's MIT-licensed model contract.

    Upstream Studio Violin is a Web Audio physical-model instrument. This adapter
    translates the public control/synthesis model into deterministic NumPy/SciPy
    rendering so Fidelis can render recovered performance maps in a backend job.
    """

    id = 'instrudio-native'
    kind = 'renderer'
    version = '0.1'

    def __init__(self) -> None:
        self.definition = json.loads(DEFINITION_PATH.read_text(encoding='utf-8'))
        self.open_strings = self.definition['openStrings']
        self.presets = self.definition['presets']

    def capability(self) -> Capability:
        ready = DEFINITION_PATH.is_file() and LICENSE_PATH.is_file()
        return Capability(
            self.id,
            self.kind,
            'ready' if ready else 'blocked',
            'Instrudio Studio Violin (native backend adapter)',
            'MIT-licensed Studio Violin physical-model contract translated to deterministic offline rendering.' if ready
            else 'Vendored Instrudio definition/license is missing.',
            version=self.version,
            execution='native',
            metadata={
                'upstream': self.definition.get('upstream') if ready else 'GareBear99/Instrudio',
                'upstreamVersion': self.definition.get('upstreamVersion') if ready else None,
                'upstreamCommit': self.definition.get('upstreamCommit') if ready else None,
                'upstreamLicensePath': self.definition.get('upstreamLicensePath') if ready else None,
                'license': 'MIT',
                'definition': str(DEFINITION_PATH),
                'sourceWaveformReuse': False,
                'features': [
                    'helmholtz-harmonics', 'h2-correction', 'inharmonicity-chorus',
                    '8-band-body-eq', 'sympathetic-resonance', 'bow-noise', 'portamento-summary',
                ],
            },
        )

    def run(self, performance: dict[str, Any], output: Path, *, sample_rate: int = 48000,
            preset: str = 'solo-cantabile') -> dict[str, Any]:
        cap = self.capability()
        if cap.status != 'ready':
            raise RuntimeError(cap.reason)
        events = performance.get('performance') or []
        if not events:
            raise RuntimeError('Instrudio renderer requires performance events')
        instrument = str((performance.get('source') or {}).get('instrument') or 'unknown').lower()
        if instrument not in {'fiddle', 'violin', 'strings', 'unknown'}:
            raise RuntimeError(f'Instrudio Studio Violin cannot render instrument={instrument!r}')

        settings = dict(self.presets.get(preset) or self.presets['solo-cantabile'])
        duration = max(
            float((performance.get('source') or {}).get('durationSec') or 0.0),
            max(float(e.get('start') or 0.0) + float(e.get('duration') or 0.0) for e in events) + 0.45,
        )
        mono = np.zeros(max(1, int(math.ceil(duration * sample_rate))), dtype=np.float64)
        sympathetic = np.zeros_like(mono)

        for idx, event in enumerate(events):
            self._render_event(mono, sympathetic, sample_rate, event, idx, settings)

        mono += sympathetic
        mono = self._high_shelf(mono, sample_rate, 3000.0, -2.0)
        mono = self._soft_limit(mono)
        stereo = self._room(mono, sample_rate, wet=float(settings.get('reverb', 0.32)))
        peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
        if peak > 0.94:
            stereo *= 0.94 / peak
        rms = float(np.sqrt(np.mean(stereo ** 2, dtype=np.float64))) if stereo.size else 0.0

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
            'peak': float(np.max(np.abs(stereo))) if stereo.size else 0.0,
            'sha256': digest,
            'preset': preset,
            'sourceWaveformReuse': False,
            'model': 'Instrudio Studio Violin physical model (offline adaptation)',
            'upstream': 'GareBear99/Instrudio',
            'upstreamVersion': self.definition.get('upstreamVersion'),
            'upstreamCommit': self.definition.get('upstreamCommit'),
            'upstreamLicensePath': self.definition.get('upstreamLicensePath'),
            'license': 'MIT',
        }

    def _render_event(self, dst: np.ndarray, sympathetic: np.ndarray, sr: int, note: dict[str, Any],
                      index: int, settings: dict[str, Any]) -> None:
        start = max(0, int(float(note.get('start') or 0.0) * sr))
        dur = max(0.04, float(note.get('duration') or 0.08))
        release = 0.10 + (1.0 - float(settings['bowSpeed'])) * 0.28
        end = min(len(dst), start + int(math.ceil((dur + release) * sr)))
        if end <= start:
            return
        length = end - start
        t = np.arange(length, dtype=np.float64) / sr
        held = np.clip(t / dur, 0.0, 1.0)

        midi = float(note.get('midi') or 69.0)
        base_hz = max(40.0, float(note.get('hz') or 440.0))
        si = self._string_index(midi)
        pressure = float(np.clip(settings['bowPressure'] * (0.82 + float(note.get('dynamics') or 0.08) * 1.5), 0.05, 1.0))
        speed = float(np.clip(settings['bowSpeed'], 0.05, 1.0))
        point = float(np.clip(settings['bowPoint'], 0.05, 0.95))
        brightness = float(settings['brightness'])
        character = str(settings.get('character', 'solo'))
        is_sul = character == 'sul'
        is_bar = character == 'baroque'
        is_ensemble = character == 'ensemble'

        # Recovered pitch movement + Instrudio-style pressure-coupled vibrato.
        start_c = float(note.get('pitchStartCents') or 0.0)
        end_c = float(note.get('pitchEndCents') or 0.0)
        cents = start_c + (end_c - start_c) * np.clip(t / max(dur, 1e-6), 0, 1)
        recovered_vib_rate = float(note.get('vibratoHz') or settings.get('vibRate', 5.5))
        recovered_vib_depth_c = float(note.get('vibratoDepthCents') or (float(settings.get('vibDepth', .32)) * 50.0))
        eff_depth = recovered_vib_depth_c * (0.6 + pressure * 0.6)
        vib_in = np.clip((t - (float(settings['attack']) + 0.10)) / 0.18, 0.0, 1.0)
        cents += np.sin(2 * np.pi * recovered_vib_rate * t) * eff_depth * vib_in
        # Instrudio attack approaches pitch from roughly 8 cents flat.
        approach = -8.0 * np.clip(1.0 - t / 0.040, 0.0, 1.0)
        cents += approach
        freq = base_hz * np.power(2.0, cents / 1200.0)
        phase = np.cumsum((2.0 * np.pi / sr) * freq)

        # Helmholtz Fourier series. Upstream D = 0.5 + pressure * 0.30.
        D = float(np.clip(0.5 + pressure * 0.30, 0.12, 0.88))
        nyquist = sr * 0.46
        max_harm = min(64, max(3, int(nyquist / base_hz)))
        helm = np.zeros(length, dtype=np.float64)
        norm = 0.0
        for n in range(1, max_harm + 1):
            coeff = -(2.0 / (n * n * math.pi * math.pi * D * (1.0 - D))) * math.sin(n * math.pi * D)
            helm += coeff * np.sin(phase * n)
            norm += abs(coeff)
        if norm > 1e-12:
            helm /= norm

        inj = math.tanh(speed * pressure * 3.8) * 0.42 * point
        voice = helm * inj
        # H2 correction and inharmonic chorus.
        h2_gain = inj * 0.38 * (1.6 if is_sul else 0.7 if is_bar else 1.0)
        voice += h2_gain * np.sin(phase * 2.0)
        for cents_detune in (-2.5, 2.5):
            ratio = 2 ** (cents_detune / 1200.0)
            voice += 0.22 * inj * np.sin(phase * ratio)
        if is_ensemble:
            for cents_detune in (-14.0, 14.0):
                voice += 0.13 * inj * np.sin(phase * (2 ** (cents_detune / 1200.0)))

        # Bow-stroke variation and pressure-dependent nonlinearity.
        bow_lfo = 1.0 + 0.10 * np.sin(2 * np.pi * (0.35 + (index % 5) * 0.04) * t)
        amt = 5.0 + pressure * 55.0
        shaped = ((math.pi + amt) * voice) / (math.pi + amt * np.abs(voice) + 1e-12)
        voice = shaped * bow_lfo

        # Envelope; recovered attack hint scales the upstream preset attack.
        attack = float(settings['attack'])
        attack_name = str(note.get('attack') or 'medium')
        if attack_name == 'soft':
            attack *= 1.35
        elif attack_name == 'firm':
            attack *= 0.62
        env = np.ones(length, dtype=np.float64)
        a_len = max(1, min(length, int(attack * sr)))
        env[:a_len] = np.sin(np.linspace(0, math.pi / 2, a_len)) ** 1.5
        release_start = min(length - 1, int(dur * sr))
        if release_start < length:
            rel_n = length - release_start
            env[release_start:] *= np.exp(-np.linspace(0, 5.8, rel_n))

        dyn = float(np.clip(float(note.get('dynamics') or 0.08), 0.0, 1.0))
        level = float(np.clip((0.18 + dyn * 2.7) * pressure * float(settings['volume']), 0.05, 0.92))
        voice *= env * level

        # Deterministic attack scratch + continuous rosin texture.
        rng = np.random.default_rng(0x1A57D10 + index * 104729)
        noise = rng.normal(0.0, 1.0, length)
        scratch_dur = min(length, int((0.020 + pressure * 0.040) * sr))
        scratch = np.zeros(length, dtype=np.float64)
        if scratch_dur > 2:
            scratch[:scratch_dur] = noise[:scratch_dur] * np.sqrt(np.linspace(1.0, 0.0, scratch_dur))
            scratch = self._bandpass(scratch, sr, min(sr * .42, base_hz * 1.5), q=1.8)
            scratch *= level * pressure * 0.18
        rosin = self._bandpass(noise, sr, min(sr * .42, base_hz * (3.5 if is_sul else 2.0)), q=10.0)
        rosin_amt = (speed * (0.06 + (0.3 - pressure) * 0.12) if pressure < 0.3 else pressure * speed * (0.038 if is_sul else 0.020))
        rosin *= env * level * rosin_amt
        voice += scratch + rosin

        voice = self._body_eq(voice, sr, si, brightness, is_sul, is_bar)
        dst[start:end] += voice[:end-start]
        self._add_sympathetic(sympathetic, sr, start, end, base_hz, env[:end-start], level, index)

    def _body_eq(self, x: np.ndarray, sr: int, si: int, brightness: float, is_sul: bool, is_bar: bool) -> np.ndarray:
        offsets = [
            [+4,+2,+2,+2,-3,-1,-1,+3],
            [+1,+1,+1,+1, 0,-1, 0,+1],
            [ 0, 0, 0, 0, 0, 0, 0, 0],
            [-4,-2,-1,-1,+3,+3,+1,-2],
        ][si]
        bands = [
            (275, -3 if is_sul else 12, 4.2),
            (475, 0 if is_sul else 9, 5.1),
            (530, 2 if is_sul else 7, 4.8),
            (580, 3 if is_sul else 8, 5.5),
            (2800, 14 if is_sul else 4 if is_bar else 13, 6.5),
            (4500, 9 if is_sul else 2 if is_bar else 5, 5.0),
            (1100, -6 if is_bar else -3, 2.8),
            (180, -2 if is_sul else 4, 2.0),
        ]
        y = x
        for idx, (freq, gain_db, q) in enumerate(bands):
            if freq >= sr * 0.48:
                continue
            y = signal.lfilter(*self._peaking_coeff(sr, freq, q, (gain_db + offsets[idx]) * brightness), y)
        return y

    def _add_sympathetic(self, dst: np.ndarray, sr: int, start: int, end: int, played_hz: float,
                         env: np.ndarray, level: float, index: int) -> None:
        n = end - start
        if n <= 0:
            return
        t = np.arange(n, dtype=np.float64) / sr
        for open_idx, string in enumerate(self.open_strings):
            open_hz = float(string['hz'])
            min_cents = min(abs(1200.0 * math.log2(max(1e-9, played_hz / (open_hz * m)))) for m in (1, 2, 4))
            amp = max(0.0, (1.0 - min_cents / 20.0) * 0.038)
            if amp <= 0:
                continue
            # Triangle approximation by odd harmonics.
            tri = np.zeros(n, dtype=np.float64)
            for k in (1, 3, 5, 7):
                tri += ((-1) ** ((k - 1)//2)) * np.sin(2*np.pi*open_hz*k*t) / (k*k)
            dst[start:end] += tri * env * amp * level * 0.8

    def _room(self, mono: np.ndarray, sr: int, wet: float) -> np.ndarray:
        wet = float(np.clip(wet, 0.0, 1.0))
        left = mono.copy()
        right = mono.copy()
        # Upstream describes early reflections around 8 ms left / 15 ms right.
        for delay_s, gain, side in ((0.008, 0.25, 'l'), (0.015, 0.13, 'r'), (0.031, 0.08*wet, 'l'), (0.043, 0.07*wet, 'r')):
            d = max(1, int(delay_s * sr))
            if d >= len(mono):
                continue
            if side == 'l':
                left[d:] += mono[:-d] * gain * max(0.25, wet)
            else:
                right[d:] += mono[:-d] * gain * max(0.25, wet)
        return np.stack([left, right], axis=1)

    @staticmethod
    def _string_index(midi: float) -> int:
        if midi >= 76: return 3
        if midi >= 69: return 2
        if midi >= 62: return 1
        return 0

    @staticmethod
    def _bandpass(x: np.ndarray, sr: int, freq: float, q: float) -> np.ndarray:
        freq = float(np.clip(freq, 30.0, sr * 0.46))
        b, a = signal.iirpeak(freq / (sr / 2.0), Q=max(0.2, q))
        return signal.lfilter(b, a, x)

    @staticmethod
    def _peaking_coeff(sr: int, freq: float, q: float, gain_db: float) -> tuple[np.ndarray, np.ndarray]:
        # RBJ Audio EQ Cookbook peaking biquad.
        A = 10 ** (gain_db / 40.0)
        w0 = 2 * math.pi * freq / sr
        alpha = math.sin(w0) / (2 * q)
        c = math.cos(w0)
        b0 = 1 + alpha * A
        b1 = -2 * c
        b2 = 1 - alpha * A
        a0 = 1 + alpha / A
        a1 = -2 * c
        a2 = 1 - alpha / A
        b = np.array([b0, b1, b2], dtype=np.float64) / a0
        a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)
        return b, a

    @staticmethod
    def _high_shelf(x: np.ndarray, sr: int, freq: float, gain_db: float) -> np.ndarray:
        A = 10 ** (gain_db / 40.0)
        w0 = 2 * math.pi * freq / sr
        c, s = math.cos(w0), math.sin(w0)
        alpha = s / 2 * math.sqrt(2.0)
        sqrtA = math.sqrt(A)
        b0 = A*((A+1)+(A-1)*c+2*sqrtA*alpha)
        b1 = -2*A*((A-1)+(A+1)*c)
        b2 = A*((A+1)+(A-1)*c-2*sqrtA*alpha)
        a0 = (A+1)-(A-1)*c+2*sqrtA*alpha
        a1 = 2*((A-1)-(A+1)*c)
        a2 = (A+1)-(A-1)*c-2*sqrtA*alpha
        return signal.lfilter(np.array([b0,b1,b2])/a0, np.array([1.0,a1/a0,a2/a0]), x)

    @staticmethod
    def _soft_limit(x: np.ndarray) -> np.ndarray:
        return np.tanh(x * 1.18) / math.tanh(1.18)
