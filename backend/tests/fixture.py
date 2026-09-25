from __future__ import annotations
import math, wave
from pathlib import Path

def ensure_test_wav(path: str | Path = 'test-fiddle.wav', *, sr: int = 48000, seconds: float = 2.5) -> Path:
    path = Path(path).resolve()
    if path.is_file():
        return path
    frames = bytearray()
    phase = 0.0
    total = int(sr * seconds)
    for i in range(total):
        t = i / sr
        cents = 14.0 * math.sin(2 * math.pi * 5.3 * t)
        hz = 440.0 * 2 ** (cents / 1200.0)
        phase += 2 * math.pi * hz / sr
        env = min(1.0, t / .04, max(0.0, (seconds - t) / .08))
        sample = max(-1.0, min(1.0, math.sin(phase) * .24 * env))
        iv = int(sample * 32767)
        frames.extend(iv.to_bytes(2, 'little', signed=True))
    with wave.open(str(path), 'wb') as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr); wf.writeframes(bytes(frames))
    return path
