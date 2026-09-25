from __future__ import annotations

import os

from .adapters.demucs import DemucsAdapter
from .adapters.discovery import capability_map
from .adapters.performance import NativePerformanceAdapter
from .adapters.physical_violin import PhysicalViolinRenderer
from .adapters.instrudio_violin import InstrudioViolinRenderer
from .adapters.reference_renderer import ReferenceRenderer
from .adapters.remote_worker import RemoteWorkerAdapter

WORKER_SPECS = {
    'demucs': ('source_decomposer', 'Demucs / HTDemucs', 'FIDELIS_DEMUCS_URL'),
    'basic-pitch': ('transcriber', 'Basic Pitch', 'FIDELIS_BASIC_PITCH_URL'),
    'stradi': ('transcriber', 'STRAdi', 'FIDELIS_STRADI_URL'),
    'ddsp': ('structured_synth', 'Google DDSP', 'FIDELIS_DDSP_URL'),
    'rave': ('timbre_transfer', 'RAVE / Scyclone', 'FIDELIS_RAVE_URL'),
    'brave': ('timbre_transfer', 'BRAVE', 'FIDELIS_BRAVE_URL'),
    'sony-diffusion': ('timbre_transfer', 'Sony Diffusion Timbre Transfer', 'FIDELIS_SONY_DTT_URL'),
    'wavetransfer': ('timbre_transfer', 'WaveTransfer', 'FIDELIS_WAVETRANSFER_URL'),
    'instrudio': ('renderer', 'Instrudio Studio Violin', 'FIDELIS_INSTRUDIO_URL'),
}


class Registry:
    def __init__(self) -> None:
        self.demucs = DemucsAdapter()
        self.performance = NativePerformanceAdapter()
        self.physical_violin = PhysicalViolinRenderer()
        self.instrudio_native = InstrudioViolinRenderer()
        self.reference = ReferenceRenderer()

    def capabilities(self) -> dict[str, dict]:
        return capability_map()

    def remote(self, adapter_id: str) -> RemoteWorkerAdapter:
        if adapter_id not in WORKER_SPECS:
            raise KeyError(f'no remote-worker spec for {adapter_id}')
        kind, label, env_key = WORKER_SPECS[adapter_id]
        return RemoteWorkerAdapter(id=adapter_id, kind=kind, label=label, url=os.environ.get(env_key))


REGISTRY = Registry()
