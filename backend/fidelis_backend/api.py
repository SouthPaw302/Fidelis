from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import storage
from .config import RUNTIME
from .jobs import RUNNER
from .orchestrator import (
    harness_context,
    harness_plan,
    ingest_source,
    ingest_supplied_stem,
    route_part,
    submit_analysis,
    submit_decomposition,
    submit_qc,
    submit_reassembly,
    submit_render,
    run_project_pipeline,
)
from .registry import REGISTRY

APP_VERSION = '0.3.0-prealpha'
API_TOKEN = os.environ.get('FIDELIS_API_TOKEN', '').strip()
FRONTEND_ROOT = Path(os.environ.get('FIDELIS_FRONTEND_ROOT') or (Path(__file__).resolve().parents[2] / 'dist'))

app = FastAPI(title='Fidelis Backend', version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


def auth(authorization: str | None = Header(default=None)) -> None:
    if not API_TOKEN:
        return
    if authorization != f'Bearer {API_TOKEN}':
        raise HTTPException(status_code=401, detail='invalid or missing API token')


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sourceKind: Literal['full_mix', 'stem'] = 'full_mix'


class RouteRequest(BaseModel):
    desiredRouteId: str | None = None
    allowFallback: bool = True


class HarnessPlanRequest(BaseModel):
    objective: str = 'reconstruct the project while preserving performance and improving instrument fidelity'


class PipelineRequest(BaseModel):
    desiredRouteId: str | None = None
    allowFallback: bool = True
    runQc: bool = True


def _project_or_404(project_id: str):
    project = storage.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail='project not found')
    return project


def _artifact_or_404(artifact_id: str):
    artifact = storage.get_artifact(artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail='artifact not found')
    return artifact


def _infer_instrument(name: str) -> str:
    low = name.lower()
    checks = [
        ('vocals', ('vocal', 'vox', 'voice')),
        ('drums', ('drum', 'perc', 'kick', 'snare')),
        ('bass', ('bass',)),
        ('fiddle', ('fiddle', 'violin', 'string')),
        ('guitar', ('guitar', 'gtr')),
        ('piano', ('piano', 'keys', 'rhodes')),
    ]
    for instrument, tokens in checks:
        if any(token in low for token in tokens):
            return instrument
    return 'unknown'


def _temp_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or 'upload.bin').suffix
    fd, name = tempfile.mkstemp(prefix='fidelis-upload-', suffix=suffix, dir=RUNTIME)
    os.close(fd)
    path = Path(name)
    with path.open('wb') as out:
        shutil.copyfileobj(upload.file, out, length=1024 * 1024)
    return path


@app.get('/api/health')
def health(_: None = Depends(auth)):
    return {
        'schema': 'fidelis.health.v0.1',
        'ok': True,
        'version': APP_VERSION,
        'runtime': str(RUNTIME),
        'projects': len(storage.list_projects()),
        'capabilitiesReady': sum(1 for x in REGISTRY.capabilities().values() if x['status'] == 'ready'),
    }


@app.get('/api/capabilities')
def capabilities(_: None = Depends(auth)):
    return {'schema': 'fidelis.capabilities.v0.1', 'items': REGISTRY.capabilities()}


@app.get('/api/models')
def models(_: None = Depends(auth)):
    demucs = REGISTRY.demucs.capability().to_dict()
    return {
        'schema': 'fidelis.models.v0.1',
        'items': {
            'demucs': {
                'id': 'demucs',
                'label': demucs['label'],
                'status': demucs['status'],
                'reason': demucs.get('reason') or '',
                'metadata': demucs.get('metadata') or {},
            }
        },
    }


@app.post('/api/models/demucs/checkpoint')
def install_demucs_checkpoint(file: UploadFile = File(...), _: None = Depends(auth)):
    path = _temp_upload(file)
    try:
        try:
            installed = REGISTRY.demucs.install_checkpoint(path)
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            'schema': 'fidelis.model-install.v0.1',
            'modelId': 'demucs',
            'result': installed,
            'capabilities': REGISTRY.capabilities(),
        }
    finally:
        path.unlink(missing_ok=True)


@app.post('/api/projects')
def create_project(request: ProjectCreate, _: None = Depends(auth)):
    return storage.create_project(request.name, request.sourceKind)


@app.get('/api/projects')
def projects(_: None = Depends(auth)):
    return {'items': storage.list_projects()}


@app.get('/api/projects/{project_id}')
def project(project_id: str, _: None = Depends(auth)):
    return _project_or_404(project_id)


@app.post('/api/projects/{project_id}/source')
def upload_source(
    project_id: str,
    file: UploadFile = File(...),
    sourceKind: Literal['full_mix', 'stem'] = Form('full_mix'),
    instrument: str = Form('unknown'),
    _: None = Depends(auth),
):
    _project_or_404(project_id)
    path = _temp_upload(file)
    try:
        return ingest_source(project_id, path, filename=file.filename or path.name, mime_type=file.content_type,
                             source_kind=sourceKind, instrument=instrument)
    finally:
        path.unlink(missing_ok=True)


@app.post('/api/projects/{project_id}/stems')
def upload_stems(project_id: str, files: list[UploadFile] = File(...), _: None = Depends(auth)):
    _project_or_404(project_id)
    results = []
    for file in files:
        path = _temp_upload(file)
        try:
            results.append(ingest_supplied_stem(project_id, path, filename=file.filename or path.name,
                                                mime_type=file.content_type, instrument=_infer_instrument(file.filename or '')))
        finally:
            path.unlink(missing_ok=True)
    return {'count': len(results), 'project': storage.get_project(project_id), 'artifacts': [r['artifact'] for r in results]}


@app.post('/api/projects/{project_id}/decompose')
def decompose(project_id: str, wait: bool = Query(False), _: None = Depends(auth)):
    _project_or_404(project_id)
    try:
        return submit_decomposition(project_id, wait=wait)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post('/api/projects/{project_id}/parts/{part_id}/analyze')
def analyze(project_id: str, part_id: str, adapterId: str = Query('fidelis-native-performance'), wait: bool = Query(False), _: None = Depends(auth)):
    _project_or_404(project_id)
    try:
        return submit_analysis(project_id, part_id, adapter_id=adapterId, wait=wait)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post('/api/projects/{project_id}/parts/{part_id}/route')
def route(project_id: str, part_id: str, request: RouteRequest, _: None = Depends(auth)):
    _project_or_404(project_id)
    try:
        return route_part(project_id, part_id, desired_route_id=request.desiredRouteId, allow_fallback=request.allowFallback)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post('/api/projects/{project_id}/parts/{part_id}/render')
def render(project_id: str, part_id: str, wait: bool = Query(False), _: None = Depends(auth)):
    _project_or_404(project_id)
    try:
        return submit_render(project_id, part_id, wait=wait)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post('/api/projects/{project_id}/parts/{part_id}/qc')
def qc(project_id: str, part_id: str, wait: bool = Query(False), _: None = Depends(auth)):
    _project_or_404(project_id)
    try:
        return submit_qc(project_id, part_id, wait=wait)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post('/api/projects/{project_id}/parts/{part_id}/pipeline')
def part_pipeline(project_id: str, part_id: str, request: PipelineRequest, _: None = Depends(auth)):
    _project_or_404(project_id)
    analysis = submit_analysis(project_id, part_id, wait=True)
    if analysis.get('status') != 'complete':
        return {'status': 'failed', 'stage': 'analyze', 'job': analysis}
    routed = route_part(project_id, part_id, desired_route_id=request.desiredRouteId, allow_fallback=request.allowFallback)
    if not (routed.get('assignment') or {}).get('adapterId'):
        return {'status': 'blocked', 'stage': 'route', 'route': routed}
    rendered = submit_render(project_id, part_id, wait=True)
    if rendered.get('status') != 'complete':
        return {'status': 'failed', 'stage': 'render', 'job': rendered, 'route': routed}
    qc_result = submit_qc(project_id, part_id, wait=True) if request.runQc else None
    return {'status': 'complete', 'analysis': analysis, 'route': routed, 'render': rendered, 'qc': qc_result,
            'project': storage.get_project(project_id)}


@app.post('/api/projects/{project_id}/autopilot')
def autopilot(project_id: str, allowFallback: bool = Query(True), _: None = Depends(auth)):
    _project_or_404(project_id)
    return run_project_pipeline(project_id, allow_fallback=allowFallback, reassemble_when_possible=True)


@app.post('/api/projects/{project_id}/reassemble')
def reassemble(project_id: str, wait: bool = Query(False), _: None = Depends(auth)):
    _project_or_404(project_id)
    try:
        return submit_reassembly(project_id, wait=wait)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get('/api/projects/{project_id}/jobs')
def project_jobs(project_id: str, _: None = Depends(auth)):
    _project_or_404(project_id)
    return {'items': storage.list_jobs(project_id)}


@app.get('/api/jobs/{job_id}')
def job(job_id: str, wait: bool = Query(False), _: None = Depends(auth)):
    result = RUNNER.wait(job_id, timeout=3600) if wait else storage.get_job(job_id)
    if not result:
        raise HTTPException(status_code=404, detail='job not found')
    return result


@app.get('/api/projects/{project_id}/artifacts')
def project_artifacts(project_id: str, _: None = Depends(auth)):
    _project_or_404(project_id)
    return {'items': storage.list_artifacts(project_id)}


@app.get('/api/artifacts/{artifact_id}')
def artifact_metadata(artifact_id: str, _: None = Depends(auth)):
    return _artifact_or_404(artifact_id)


@app.get('/api/artifacts/{artifact_id}/download')
def artifact_download(artifact_id: str, _: None = Depends(auth)):
    artifact = _artifact_or_404(artifact_id)
    return FileResponse(artifact['path'], media_type=artifact.get('mimeType') or 'application/octet-stream', filename=artifact['filename'])


@app.get('/api/projects/{project_id}/harness/context')
def context(project_id: str, _: None = Depends(auth)):
    _project_or_404(project_id)
    return harness_context(project_id)


@app.post('/api/projects/{project_id}/harness/plan')
def plan(project_id: str, request: HarnessPlanRequest, _: None = Depends(auth)):
    _project_or_404(project_id)
    return harness_plan(project_id, request.objective)


# Keep API declarations above this mount. Production serves only the built deck, never the repository root.
if FRONTEND_ROOT.is_dir():
    app.mount('/', StaticFiles(directory=str(FRONTEND_ROOT), html=True), name='frontend')
