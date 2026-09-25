from __future__ import annotations

import hashlib
import importlib.metadata
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import soundfile as sf

from .base import Capability
from ..config import DEMUCS_ALLOW_DOWNLOAD, DEMUCS_DEVICE, DEMUCS_MODEL, MODEL_DIR

HTDEMUCS_FILENAME = '955717e8-8726e21a.th'
HTDEMUCS_SHA256 = '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4'
HTDEMUCS_OFFICIAL_URL = 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th'


class DemucsAdapter:
    id = 'demucs'
    kind = 'source_decomposer'

    @property
    def torch_home(self) -> Path:
        return MODEL_DIR / 'torch'

    @property
    def checkpoint_dir(self) -> Path:
        return self.torch_home / 'hub' / 'checkpoints'

    @property
    def expected_checkpoint(self) -> Path:
        return self.checkpoint_dir / HTDEMUCS_FILENAME

    def _weight_files(self) -> list[Path]:
        homes = [
            self.checkpoint_dir,
            Path.home() / '.cache' / 'torch' / 'hub' / 'checkpoints',
            Path.home() / '.cache' / 'demucs',
        ]
        found: list[Path] = []
        for root in homes:
            if root.exists():
                found.extend(root.rglob('*.th'))
                found.extend(root.rglob('*.pt'))
                found.extend(root.rglob('*.pth'))
        return sorted(set(found))

    def _valid_expected_checkpoint(self) -> bool:
        path = self.expected_checkpoint
        if not path.is_file():
            return False
        return self.sha256(path) == HTDEMUCS_SHA256

    def capability(self) -> Capability:
        exe = shutil.which('demucs')
        if not exe:
            return Capability(self.id, self.kind, 'unavailable', 'Demucs / HTDemucs', 'demucs executable is not installed')
        try:
            version = importlib.metadata.version('demucs')
        except Exception:
            version = None
        valid = self._valid_expected_checkpoint()
        cached = [str(x) for x in self._weight_files()]
        if valid or DEMUCS_ALLOW_DOWNLOAD:
            return Capability(
                self.id, self.kind, 'ready', 'Demucs / HTDemucs', version=version,
                metadata={
                    'model': DEMUCS_MODEL,
                    'device': DEMUCS_DEVICE,
                    'checkpoint': str(self.expected_checkpoint),
                    'checkpointVerified': valid,
                    'cachedWeights': cached,
                    'officialUrl': HTDEMUCS_OFFICIAL_URL,
                    'expectedSha256': HTDEMUCS_SHA256,
                },
            )
        return Capability(
            self.id,
            self.kind,
            'blocked',
            'Demucs / HTDemucs',
            'Demucs is installed but the verified HTDemucs checkpoint is not in the Fidelis model cache and network download is disabled.',
            version=version,
            metadata={
                'model': DEMUCS_MODEL,
                'device': DEMUCS_DEVICE,
                'checkpoint': str(self.expected_checkpoint),
                'checkpointVerified': False,
                'cachedWeights': cached,
                'officialUrl': HTDEMUCS_OFFICIAL_URL,
                'expectedSha256': HTDEMUCS_SHA256,
            },
        )

    def install_checkpoint(self, source: Path) -> dict[str, Any]:
        source = Path(source)
        if not source.is_file():
            raise FileNotFoundError(source)
        digest = self.sha256(source)
        if digest != HTDEMUCS_SHA256:
            raise ValueError(f'HTDemucs checkpoint SHA-256 mismatch: expected {HTDEMUCS_SHA256}, got {digest}')
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, self.expected_checkpoint)
        return {
            'status': 'installed',
            'model': 'htdemucs',
            'path': str(self.expected_checkpoint),
            'sha256': digest,
            'capability': self.capability().to_dict(),
        }

    def run(self, source: Path, output_dir: Path, *, model: str | None = None, device: str | None = None) -> dict[str, Any]:
        cap = self.capability()
        if cap.status != 'ready':
            raise RuntimeError(cap.reason or f'{self.id} is {cap.status}')
        source = Path(source)
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        model = model or DEMUCS_MODEL
        device = device or DEMUCS_DEVICE
        cmd = [shutil.which('demucs') or 'demucs', '-n', model, '-d', device, '-o', str(output_dir), str(source)]
        env = dict(os.environ)
        env['TORCH_HOME'] = str(self.torch_home)
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60 * 60, check=False, env=env)
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout)[-6000:])
        track_dir = output_dir / model / source.stem
        if not track_dir.is_dir():
            candidates = list(output_dir.rglob(source.stem))
            track_dir = candidates[0] if candidates else track_dir
        stems = []
        for name in ('vocals', 'drums', 'bass', 'other'):
            p = track_dir / f'{name}.wav'
            if p.is_file():
                info = sf.info(p)
                stems.append({'name': name, 'path': str(p), 'durationSec': info.duration, 'sampleRate': info.samplerate,
                              'channels': info.channels, 'mimeType': 'audio/wav'})
        if not stems:
            raise RuntimeError('Demucs completed without discoverable stem files.')
        return {'schema': 'fidelis.decomposition.v0.1', 'adapter': {'id': self.id, 'model': model, 'device': device},
                'status': 'complete', 'stems': stems, 'stdout': proc.stdout[-4000:]}

    @staticmethod
    def sha256(path: Path) -> str:
        h = hashlib.sha256()
        with Path(path).open('rb') as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b''):
                h.update(chunk)
        return h.hexdigest()
