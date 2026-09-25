from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import librosa
import numpy as np

from .base import Capability
from ..audio_utils import load_mono, probe_audio


class NativePerformanceAdapter:
    id = 'fidelis-native-performance'
    kind = 'performance_analyzer'

    def capability(self) -> Capability:
        return Capability(self.id, self.kind, 'ready', 'Fidelis Native Performance Analyzer',
                          'Librosa pYIN + deterministic gesture segmentation.', version='0.1')

    def run(self, source: Path, *, instrument: str = 'unknown') -> dict[str, Any]:
        source = Path(source)
        meta = probe_audio(source)
        y, sr = load_mono(source, sr=None)
        if y.size == 0:
            raise RuntimeError('empty audio')

        rms = float(np.sqrt(np.mean(np.square(y), dtype=np.float64)))
        peak = float(np.max(np.abs(y)))
        crest = peak / max(rms, 1e-12)
        min_hz, max_hz = self._range(instrument)
        frame_length = 2048 if sr >= 32000 else 1024
        hop_length = max(128, frame_length // 4)

        f0, voiced_flag, voiced_prob = librosa.pyin(
            y,
            fmin=min_hz,
            fmax=max_hz,
            sr=sr,
            frame_length=frame_length,
            hop_length=hop_length,
        )
        times = librosa.times_like(f0, sr=sr, hop_length=hop_length)
        frame_rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length, center=True)[0]
        count = min(len(f0), len(times), len(frame_rms))
        pitch_frames: list[dict[str, Any]] = []
        for i in range(count):
            hz = float(f0[i]) if np.isfinite(f0[i]) else 0.0
            if hz <= 0 or not bool(voiced_flag[i]):
                continue
            midi = float(librosa.hz_to_midi(hz))
            confidence = float(voiced_prob[i]) if np.isfinite(voiced_prob[i]) else 0.5
            pitch_frames.append({
                'time': round(float(times[i]), 5),
                'hz': round(hz, 5),
                'midi': round(midi, 5),
                'confidence': round(max(0.0, min(1.0, confidence)), 4),
                'rms': round(float(frame_rms[i]), 7),
                '_frame': i,
            })

        notes = self._segment(pitch_frames, hop_length / sr)
        for frame in pitch_frames:
            frame.pop('_frame', None)

        return {
            'schema': 'fidelis.performance.v0.2-backend',
            'source': {
                'file': source.name,
                'instrument': instrument,
                'durationSec': round(float(meta['durationSec']), 5),
                'sampleRate': int(meta['sampleRate'] or sr),
                'channels': int(meta['channels'] or 1),
            },
            'analysis': {
                'adapterId': self.id,
                'rms': round(rms, 7),
                'peak': round(peak, 7),
                'crestFactor': round(crest, 5),
                'pitchFrameCount': len(pitch_frames),
                'noteCount': len(notes),
                'voicedRatio': round(len(pitch_frames) / max(1, len(f0)), 5),
                'method': 'librosa.pyin',
            },
            'performance': notes,
            'pitchContour': pitch_frames,
        }

    @staticmethod
    def _range(instrument: str) -> tuple[float, float]:
        ranges = {
            'bass': (35.0, 500.0),
            'fiddle': (150.0, 2400.0),
            'vocals': (65.0, 1600.0),
            'guitar': (70.0, 1400.0),
            'piano': (50.0, 2400.0),
        }
        return ranges.get(instrument, (55.0, 1800.0))

    def _segment(self, frames: list[dict[str, Any]], hop_sec: float) -> list[dict[str, Any]]:
        if not frames:
            return []
        groups: list[list[dict[str, Any]]] = []
        cur = [frames[0]]
        for frame in frames[1:]:
            prev = cur[-1]
            med = float(np.median([x['midi'] for x in cur]))
            gap = frame['time'] - prev['time']
            delta = abs(frame['midi'] - med)
            if gap > hop_sec * 2.7 or delta > 0.75:
                if len(cur) >= 2:
                    groups.append(cur)
                cur = [frame]
            else:
                cur.append(frame)
        if len(cur) >= 2:
            groups.append(cur)

        out = []
        for group in groups:
            midi_vals = np.array([x['midi'] for x in group], dtype=np.float64)
            rms_vals = np.array([x['rms'] for x in group], dtype=np.float64)
            center = float(np.median(midi_vals))
            start = float(group[0]['time'])
            duration = float(group[-1]['time'] - start + hop_sec)
            if duration < 0.045:
                continue
            cents = (midi_vals - center) * 100.0
            n_edge = min(3, len(cents))
            start_cents = float(np.mean(cents[:n_edge]))
            end_cents = float(np.mean(cents[-n_edge:]))
            slide = end_cents - start_cents
            attack_rms = float(np.mean(rms_vals[:n_edge]))
            peak_rms = float(np.max(rms_vals))
            attack = 'soft' if attack_rms < peak_rms * .55 else 'firm' if attack_rms > peak_rms * .85 else 'medium'
            vib_rate, vib_depth = self._vibrato(cents, duration)
            out.append({
                'start': round(start, 5),
                'duration': round(duration, 5),
                'note': librosa.midi_to_note(center, unicode=False),
                'midi': round(center, 4),
                'hz': round(float(librosa.midi_to_hz(center)), 4),
                'dynamics': round(float(np.mean(rms_vals)), 7),
                'attack': attack,
                'transition': 'slide-up' if slide > 22 else 'slide-down' if slide < -22 else 'stable',
                'pitchStartCents': round(start_cents, 2),
                'pitchEndCents': round(end_cents, 2),
                'vibratoHz': round(vib_rate, 3),
                'vibratoDepthCents': round(vib_depth, 2),
                'confidence': round(float(np.mean([x['confidence'] for x in group])), 4),
            })
        return out

    @staticmethod
    def _vibrato(cents: np.ndarray, duration: float) -> tuple[float, float]:
        if len(cents) < 8 or duration < .22:
            return 0.0, 0.0
        window = min(5, len(cents))
        kernel = np.ones(window) / window
        smooth = np.convolve(cents, kernel, mode='same')
        residual = cents - smooth
        depth = float(np.std(residual) * math.sqrt(2))
        if not 4 <= depth <= 90:
            return 0.0, 0.0
        crossings = int(np.sum(np.signbit(residual[:-1]) != np.signbit(residual[1:])))
        rate = crossings / max(0.001, duration * 2)
        if not 2.5 <= rate <= 10:
            return 0.0, 0.0
        return rate, depth
