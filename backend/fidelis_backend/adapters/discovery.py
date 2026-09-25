from __future__ import annotations

import importlib.util
import os
import shutil
from pathlib import Path

from .base import Capability
from .demucs import DemucsAdapter
from .physical_violin import PhysicalViolinRenderer
from .instrudio_violin import InstrudioViolinRenderer
from ..config import HARNESS_URL


def _module_cap(id_: str, kind: str, label: str, module: str, reason: str = '') -> Capability:
    ok = importlib.util.find_spec(module) is not None
    return Capability(id_, kind, 'ready' if ok else 'unavailable', label,
                      '' if ok else (reason or f'Python module {module} is not installed.'), execution='worker')


def _path_cap(id_: str, kind: str, label: str, env_key: str, hints: list[str]) -> Capability:
    configured = os.environ.get(env_key, '').strip()
    candidates = [Path(configured)] if configured else []
    candidates.extend(Path(x) for x in hints)
    for path in candidates:
        if path.exists():
            return Capability(id_, kind, 'experimental', label, f'Source tree found at {path}; Fidelis adapter validation is still required.',
                              metadata={'path': str(path)})
    return Capability(id_, kind, 'unavailable', label, f'No local source tree configured. Set {env_key}.')




def _worker_override(cap: Capability, env_key: str) -> Capability:
    url = os.environ.get(env_key, '').strip()
    if url:
        return Capability(cap.id, cap.kind, 'ready', cap.label, 'Configured through Fidelis worker protocol.', execution='remote-worker', metadata={'urlConfigured': True})
    return cap


def all_capabilities() -> list[Capability]:
    caps = [
        _worker_override(DemucsAdapter().capability(), 'FIDELIS_DEMUCS_URL'),
        Capability('fidelis-native-performance', 'performance_analyzer', 'ready', 'Fidelis Native Performance Analyzer',
                   'Librosa pYIN + deterministic gesture segmentation.', version='0.1'),
        InstrudioViolinRenderer().capability(),
        PhysicalViolinRenderer().capability(),
        Capability('fidelis-reference-synth', 'renderer', 'ready', 'Fidelis Reference Synth',
                   'Pipeline-validation renderer; not a fidelity renderer.', version='0.1'),
        Capability('fidelis-qc', 'quality_evaluator', 'ready', 'Fidelis QC', 'Waveform/performance comparison metrics.', version='0.1'),
        _worker_override(_module_cap('basic-pitch', 'transcriber', 'Basic Pitch', 'basic_pitch'), 'FIDELIS_BASIC_PITCH_URL'),
        _worker_override(_module_cap('ddsp', 'structured_synth', 'Google DDSP', 'ddsp'), 'FIDELIS_DDSP_URL'),
        _worker_override(_path_cap('stradi', 'transcriber', 'STRAdi', 'FIDELIS_STRADI_PATH', []), 'FIDELIS_STRADI_URL'),
        _worker_override(_path_cap('rave', 'timbre_transfer', 'RAVE / Scyclone', 'FIDELIS_RAVE_PATH', []), 'FIDELIS_RAVE_URL'),
        _worker_override(_path_cap('brave', 'timbre_transfer', 'BRAVE', 'FIDELIS_BRAVE_PATH', []), 'FIDELIS_BRAVE_URL'),
        _worker_override(_path_cap('sony-diffusion', 'timbre_transfer', 'Sony Diffusion Timbre Transfer', 'FIDELIS_SONY_DTT_PATH', []), 'FIDELIS_SONY_DTT_URL'),
        _worker_override(_path_cap('wavetransfer', 'timbre_transfer', 'WaveTransfer', 'FIDELIS_WAVETRANSFER_PATH', []), 'FIDELIS_WAVETRANSFER_URL'),
        _worker_override(_path_cap('instrudio', 'renderer', 'Instrudio Studio Violin (external worker)', 'FIDELIS_INSTRUDIO_PATH', []), 'FIDELIS_INSTRUDIO_URL'),
    ]
    dsh = shutil.which('dsh')
    npx = shutil.which('npx')
    if HARNESS_URL:
        harness_status = 'ready'
        harness_reason = 'Configured external DeepSeek Harness endpoint.'
    elif dsh:
        harness_status = 'experimental'
        harness_reason = 'dsh launcher exists but a Fidelis Harness profile has not been validated.'
    elif npx:
        harness_status = 'experimental'
        harness_reason = 'npx exists, but that alone does not prove DeepSeek Harness is configured.'
    else:
        harness_status = 'unavailable'
        harness_reason = 'No configured Harness endpoint or launcher found.'
    caps.append(Capability('deepseek-harness', 'planner', harness_status, 'DeepSeek Harness bridge',
                           harness_reason, execution='orchestrator', metadata={'endpointConfigured': bool(HARNESS_URL), 'dsh': dsh, 'npx': npx}))
    caps.append(Capability('jev', 'judge', 'ready', 'Jev bounded route judge', 'Deterministic local judge with provider hook.', execution='orchestrator'))
    return caps


def capability_map() -> dict[str, dict]:
    return {cap.id: cap.to_dict() for cap in all_capabilities()}
