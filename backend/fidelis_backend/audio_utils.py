from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf


def probe_audio(path: Path) -> dict[str, Any]:
    path = Path(path)
    ffprobe = shutil.which('ffprobe')
    if ffprobe:
        proc = subprocess.run(
            [ffprobe, '-v', 'error', '-select_streams', 'a:0', '-show_entries',
             'stream=sample_rate,channels,duration,codec_name', '-of', 'json', str(path)],
            capture_output=True, text=True, timeout=30, check=False,
        )
        if proc.returncode == 0:
            try:
                data = json.loads(proc.stdout)
                stream = (data.get('streams') or [{}])[0]
                return {
                    'sampleRate': int(float(stream.get('sample_rate') or 0)) or None,
                    'channels': int(stream.get('channels') or 0) or None,
                    'durationSec': float(stream.get('duration') or 0.0),
                    'codec': stream.get('codec_name'),
                }
            except Exception:
                pass
    info = sf.info(path)
    return {'sampleRate': info.samplerate, 'channels': info.channels, 'durationSec': info.duration, 'codec': info.subtype}


def load_mono(path: Path, sr: int | None = None) -> tuple[np.ndarray, int]:
    y, sample_rate = librosa.load(str(path), sr=sr, mono=True)
    return np.asarray(y, dtype=np.float32), int(sample_rate)


def write_wav(path: Path, pcm: np.ndarray, sample_rate: int) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.asarray(pcm, dtype=np.float32), sample_rate, subtype='PCM_16')
