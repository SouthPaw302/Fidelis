from __future__ import annotations

import json
import sys
from typing import Any

from . import storage
from .orchestrator import harness_context, harness_plan, route_part, run_project_pipeline
from .registry import REGISTRY

PROTOCOL = '2025-11-25'

TOOLS = [
    {'name': 'harness__status', 'description': 'Return Fidelis backend and harness capability state.', 'inputSchema': {'type': 'object', 'properties': {}}},
    {'name': 'harness__context', 'description': 'Return authoritative Fidelis project/capability/job context.', 'inputSchema': {'type': 'object', 'required': ['project_id'], 'properties': {'project_id': {'type': 'string'}}}},
    {'name': 'harness__plan', 'description': 'Ask configured DeepSeek Harness or deterministic fallback for a project plan.', 'inputSchema': {'type': 'object', 'required': ['project_id'], 'properties': {'project_id': {'type': 'string'}, 'objective': {'type': 'string'}}}},
    {'name': 'capabilities__get', 'description': 'Return model/adapter preflight truth.', 'inputSchema': {'type': 'object', 'properties': {}}},
    {'name': 'project__get', 'description': 'Return one authoritative project document.', 'inputSchema': {'type': 'object', 'required': ['project_id'], 'properties': {'project_id': {'type': 'string'}}}},
    {'name': 'part__route', 'description': 'Run Jev bounded route judgement and record the selected adapter/fallback.', 'inputSchema': {'type': 'object', 'required': ['project_id','part_id'], 'properties': {'project_id': {'type': 'string'}, 'part_id': {'type': 'string'}, 'desired_route_id': {'type': 'string'}, 'allow_fallback': {'type': 'boolean'}}}},
    {'name': 'project__autopilot', 'description': 'Execute all currently ready deterministic stages and stop cleanly at blocked dependencies.', 'inputSchema': {'type': 'object', 'required': ['project_id'], 'properties': {'project_id': {'type': 'string'}, 'allow_fallback': {'type': 'boolean'}}}},
]


def call_tool(name: str, args: dict[str, Any]) -> Any:
    if name == 'harness__status':
        return {'schema': 'fidelis.harness-status.v0.1', 'ok': True, 'bridge': 'mcp-stdio', 'capabilities': REGISTRY.capabilities()}
    if name == 'harness__context':
        return harness_context(str(args.get('project_id') or ''))
    if name == 'harness__plan':
        return harness_plan(str(args.get('project_id') or ''), str(args.get('objective') or 'reconstruct with best available fidelity'))
    if name == 'capabilities__get':
        return REGISTRY.capabilities()
    if name == 'project__get':
        project = storage.get_project(str(args.get('project_id') or ''))
        if not project: raise ValueError('project not found')
        return project
    if name == 'part__route':
        return route_part(str(args.get('project_id') or ''), str(args.get('part_id') or ''),
                          desired_route_id=args.get('desired_route_id'), allow_fallback=bool(args.get('allow_fallback', True)))
    if name == 'project__autopilot':
        return run_project_pipeline(str(args.get('project_id') or ''), allow_fallback=bool(args.get('allow_fallback', True)))
    raise ValueError(f'unknown tool: {name}')


def response(id_: Any, result: Any = None, error: Any = None) -> dict[str, Any]:
    out = {'jsonrpc': '2.0', 'id': id_}
    if error is not None: out['error'] = error
    else: out['result'] = result
    return out


def main() -> int:
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw: continue
        try:
            req = json.loads(raw)
            method = req.get('method')
            rid = req.get('id')
            if method == 'initialize':
                pv = ((req.get('params') or {}).get('protocolVersion') or PROTOCOL)
                negotiated = PROTOCOL if pv != PROTOCOL else pv
                print(json.dumps(response(rid, {'protocolVersion': negotiated, 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'fidelis', 'version': '0.3.0-prealpha'}})), flush=True)
            elif method == 'notifications/initialized':
                continue
            elif method == 'tools/list':
                print(json.dumps(response(rid, {'tools': TOOLS})), flush=True)
            elif method == 'tools/call':
                params = req.get('params') or {}
                try:
                    value = call_tool(str(params.get('name') or ''), params.get('arguments') or {})
                    print(json.dumps(response(rid, {'content': [{'type': 'text', 'text': json.dumps(value)}], 'isError': False})), flush=True)
                except Exception as exc:
                    print(json.dumps(response(rid, {'content': [{'type': 'text', 'text': f'{type(exc).__name__}: {exc}'}], 'isError': True})), flush=True)
            elif rid is not None:
                print(json.dumps(response(rid, error={'code': -32601, 'message': 'method not found'})), flush=True)
        except Exception as exc:
            print(json.dumps(response(None, error={'code': -32700, 'message': str(exc)})), flush=True)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
