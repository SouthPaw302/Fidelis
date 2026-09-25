from __future__ import annotations

from pathlib import Path
from typing import Any

import librosa
import numpy as np

from .audio_utils import load_mono


def compare_audio(source: Path, candidate: Path, *, target_sr: int = 22050) -> dict[str, Any]:
    src, sr = load_mono(source, sr=target_sr)
    cand, _ = load_mono(candidate, sr=target_sr)
    n = min(len(src), len(cand))
    if n < target_sr // 10:
        raise RuntimeError('insufficient overlapping audio for QC')
    src = src[:n]
    cand = cand[:n]

    src_rms = float(np.sqrt(np.mean(src ** 2, dtype=np.float64)))
    cand_rms = float(np.sqrt(np.mean(cand ** 2, dtype=np.float64)))
    src_peak = float(np.max(np.abs(src)))
    cand_peak = float(np.max(np.abs(cand)))

    # Compare normalized amplitude envelopes rather than raw sample correlation, since reconstruction should not clone waveform phase.
    hop = 512
    e1 = librosa.feature.rms(y=src, hop_length=hop)[0]
    e2 = librosa.feature.rms(y=cand, hop_length=hop)[0]
    m = min(len(e1), len(e2))
    env_corr = float(np.corrcoef(e1[:m], e2[:m])[0, 1]) if m > 3 and np.std(e1[:m]) > 0 and np.std(e2[:m]) > 0 else 0.0

    c1 = librosa.feature.spectral_centroid(y=src, sr=sr, hop_length=hop)[0]
    c2 = librosa.feature.spectral_centroid(y=cand, sr=sr, hop_length=hop)[0]
    m2 = min(len(c1), len(c2))
    centroid_delta = float(np.mean(np.abs(c1[:m2] - c2[:m2]))) if m2 else 0.0

    onset1 = librosa.onset.onset_strength(y=src, sr=sr, hop_length=hop)
    onset2 = librosa.onset.onset_strength(y=cand, sr=sr, hop_length=hop)
    m3 = min(len(onset1), len(onset2))
    onset_corr = float(np.corrcoef(onset1[:m3], onset2[:m3])[0, 1]) if m3 > 3 and np.std(onset1[:m3]) > 0 and np.std(onset2[:m3]) > 0 else 0.0

    return {
        'schema': 'fidelis.qc.v0.1',
        'durationComparedSec': round(n / sr, 4),
        'source': {'rms': src_rms, 'peak': src_peak},
        'candidate': {'rms': cand_rms, 'peak': cand_peak},
        'metrics': {
            'energyEnvelopeCorrelation': round(env_corr, 5),
            'onsetEnvelopeCorrelation': round(onset_corr, 5),
            'spectralCentroidMeanAbsoluteDeltaHz': round(centroid_delta, 3),
            'rmsRatio': round(cand_rms / max(src_rms, 1e-12), 5),
        },
        'interpretation': 'QC evidence only. Higher envelope/onset correlation preserves macro-performance; spectral centroid delta is descriptive, not a quality score.'
    }
