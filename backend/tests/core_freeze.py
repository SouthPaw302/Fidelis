from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

api_text = (ROOT / 'backend/fidelis_backend/api.py').read_text(encoding='utf-8')
registry_text = (ROOT / 'backend/fidelis_backend/registry.py').read_text(encoding='utf-8')
protocol_text = (ROOT / 'backend/WORKER_PROTOCOL.md').read_text(encoding='utf-8')

ast.parse(api_text)
ast.parse(registry_text)

required_routes = [
    '/api/health',
    '/api/capabilities',
    '/api/models',
    '/api/projects',
    '/api/projects/{project_id}/source',
    '/api/projects/{project_id}/stems',
    '/api/projects/{project_id}/decompose',
    '/api/projects/{project_id}/parts/{part_id}/analyze',
    '/api/projects/{project_id}/parts/{part_id}/route',
    '/api/projects/{project_id}/parts/{part_id}/render',
    '/api/projects/{project_id}/parts/{part_id}/qc',
    '/api/projects/{project_id}/reassemble',
    '/api/projects/{project_id}/artifacts',
    '/api/artifacts/{artifact_id}',
    '/api/projects/{project_id}/harness/context',
    '/api/projects/{project_id}/harness/plan',
]
for route in required_routes:
    assert route in api_text, f'missing protected API route: {route}'

required_workers = [
    'demucs', 'basic-pitch', 'stradi', 'ddsp', 'rave', 'brave',
    'sony-diffusion', 'wavetransfer', 'instrudio',
]
for worker in required_workers:
    assert repr(worker) in registry_text or f'"{worker}"' in registry_text, f'missing protected worker slot: {worker}'

for operation in ['decompose', 'analyze', 'render', 'timbre_transfer']:
    assert f'`{operation}`' in protocol_text, f'missing protected worker operation: {operation}'

assert 'The worker is not project authority.' in protocol_text
print('FIDELIS CORE FREEZE PY: PASS')
