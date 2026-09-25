from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from ..config import HARNESS_TOKEN, HARNESS_URL


def build_context(project: dict[str, Any], *, capabilities: dict[str, dict[str, Any]], jobs: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        'schema': 'fidelis.harness-context.v0.1',
        'project': project,
        'capabilities': capabilities,
        'activeJobs': [j for j in jobs if j.get('status') in {'queued', 'running'}],
        'recentJobs': jobs[:20],
        'authority': {
            'projectTruth': 'fidelis backend project document',
            'executionTruth': 'deterministic adapters/jobs',
            'judge': 'Jev bounded route decision',
            'planner': 'DeepSeek Harness optional',
        },
        'rules': [
            'Do not invent adapter readiness; use capability status.',
            'Do not bypass project state when rendering or reassembling.',
            'A planner may select/sequence work but does not execute DSP itself.',
            'Record every generated artifact and adapter/model provenance.',
            'If a target engine is blocked, preserve the intended route and choose only an explicitly labeled fallback.',
        ],
    }


def deterministic_plan(context: dict[str, Any], objective: str) -> dict[str, Any]:
    project = context['project']
    parts = project.get('parts') or []
    steps = []
    if project.get('source', {}).get('kind') == 'full_mix' and not parts:
        steps.append({'action': 'decompose', 'adapter': 'demucs', 'reason': 'Full mix has no recovered/supplied parts.'})
    for part in parts:
        if not part.get('performance'):
            steps.append({'action': 'analyze', 'partId': part['id'], 'adapter': 'fidelis-native-performance'})
        if not (part.get('renderer') or {}).get('adapterId'):
            steps.append({'action': 'route', 'partId': part['id'], 'judge': 'jev'})
    if any((p.get('renderer') or {}).get('adapterId') for p in parts):
        steps.append({'action': 'render_assigned_parts'})
        steps.append({'action': 'qc_candidates'})
        steps.append({'action': 'reassemble'})
    return {'schema': 'fidelis.harness-plan.v0.1', 'source': 'deterministic-fallback', 'objective': objective, 'steps': steps}


def request_plan(context: dict[str, Any], objective: str) -> dict[str, Any]:
    if not HARNESS_URL:
        return deterministic_plan(context, objective)
    payload = json.dumps({'objective': objective, 'context': context}).encode('utf-8')
    headers = {'content-type': 'application/json'}
    if HARNESS_TOKEN:
        headers['authorization'] = f'Bearer {HARNESS_TOKEN}'
    req = urllib.request.Request(HARNESS_URL, data=payload, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode('utf-8'))
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        fallback = deterministic_plan(context, objective)
        fallback['harnessError'] = str(exc)
        return fallback
    return {'schema': 'fidelis.harness-plan.v0.1', 'source': 'deepseek-harness', 'objective': objective, 'plan': data}
