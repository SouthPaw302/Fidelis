from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx

from .base import Capability


class RemoteWorkerAdapter:
    """Fidelis worker protocol wrapper for local/GPU/cloud model services.

    A worker URL is an exact execute endpoint. It receives multipart fields:
      request: application/json describing operation/options
      source: optional audio file
      performance: optional performance JSON

    It may return JSON or an audio body. Audio bodies are written to output_path.
    """

    def __init__(self, *, id: str, kind: str, label: str, url: str | None):
        self.id = id
        self.kind = kind
        self.label = label
        self.url = (url or '').strip()

    def capability(self) -> Capability:
        if not self.url:
            return Capability(self.id, self.kind, 'unavailable', self.label, 'No Fidelis worker URL configured.', execution='remote-worker')
        return Capability(self.id, self.kind, 'ready', self.label, 'Configured through Fidelis worker protocol.', execution='remote-worker',
                          metadata={'urlConfigured': True})

    def execute(self, *, operation: str, project_id: str, part_id: str | None = None, source_path: Path | None = None,
                performance: dict[str, Any] | None = None, options: dict[str, Any] | None = None,
                output_path: Path | None = None, timeout: float = 3600) -> dict[str, Any]:
        if not self.url:
            raise RuntimeError(f'{self.id} worker URL is not configured')
        request = {
            'schema': 'fidelis.worker-request.v0.1',
            'engineId': self.id,
            'operation': operation,
            'projectId': project_id,
            'partId': part_id,
            'options': options or {},
        }
        files: dict[str, tuple] = {
            'request': ('request.json', json.dumps(request), 'application/json'),
        }
        handles = []
        try:
            if source_path:
                fh = Path(source_path).open('rb'); handles.append(fh)
                files['source'] = (Path(source_path).name, fh, 'application/octet-stream')
            if performance is not None:
                files['performance'] = ('performance.json', json.dumps(performance), 'application/json')
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                response = client.post(self.url, files=files)
            response.raise_for_status()
            content_type = (response.headers.get('content-type') or '').split(';')[0].strip().lower()
            if content_type.startswith('audio/') or content_type in {'application/octet-stream', 'audio/wav'}:
                if not output_path:
                    raise RuntimeError('worker returned audio but no output path was supplied')
                output_path = Path(output_path); output_path.parent.mkdir(parents=True, exist_ok=True); output_path.write_bytes(response.content)
                return {'schema': 'fidelis.worker-result.v0.1', 'status': 'complete', 'engineId': self.id,
                        'artifact': {'path': str(output_path), 'mimeType': content_type or 'audio/wav'}}
            data = response.json()
            if not isinstance(data, dict):
                raise RuntimeError('worker returned non-object JSON')
            return data
        finally:
            for fh in handles:
                fh.close()
