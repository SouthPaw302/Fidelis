from __future__ import annotations

import base64
import json
import math
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
import librosa
import numpy as np
import soundfile as sf

from . import storage
from .audio_utils import probe_audio, write_wav
from .config import RUNTIME
from .harness.deepseek import build_context, request_plan
from .harness.jev import judge_routes
from .jobs import RUNNER
from .qc import compare_audio
from .registry import REGISTRY


def _project(project_id: str) -> dict[str, Any]:
    project = storage.get_project(project_id)
    if not project:
        raise KeyError(f'project not found: {project_id}')
    return project


def _artifact(artifact_id: str) -> dict[str, Any]:
    artifact = storage.get_artifact(artifact_id)
    if not artifact:
        raise KeyError(f'artifact not found: {artifact_id}')
    return artifact


def _part(project: dict[str, Any], part_id: str) -> dict[str, Any]:
    for part in project.get('parts') or []:
        if part.get('id') == part_id:
            return part
    raise KeyError(f'part not found: {part_id}')


def _part_id(label: str) -> str:
    clean = ''.join(c.lower() if c.isalnum() else '-' for c in label).strip('-')[:36] or 'part'
    return f'part_{clean}_{uuid.uuid4().hex[:8]}'


def _artifact_summary(artifact: dict[str, Any]) -> dict[str, Any]:
    return {k: artifact.get(k) for k in ('id', 'role', 'filename', 'mimeType', 'size', 'sha256', 'metadata', 'createdAt')}


def _remember_artifact(project: dict[str, Any], artifact: dict[str, Any]) -> None:
    project.setdefault('artifacts', [])
    summary = _artifact_summary(artifact)
    for i, item in enumerate(project['artifacts']):
        if item.get('id') == artifact['id']:
            project['artifacts'][i] = summary
            break
    else:
        project['artifacts'].append(summary)


def _reassembly(project: dict[str, Any]) -> None:
    tracks = []
    for part in project.get('parts') or []:
        reconstruction = part.get('reconstruction') or {}
        chosen = reconstruction.get('artifactId') or part.get('sourceArtifactId')
        tracks.append({
            'partId': part['id'],
            'artifactId': chosen,
            'use': 'reconstruction' if reconstruction.get('artifactId') else 'source',
            'gainDb': 0.0,
            'pan': 0.0,
            'offsetSec': 0.0,
        })
    project['reassembly']['tracks'] = tracks
    project['reassembly']['status'] = 'planned' if tracks else 'not-started'



def _materialize_remote_decomposition(result: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    if not isinstance(result, dict) or result.get('status') != 'complete':
        raise RuntimeError('remote decomposer did not return a complete decomposition result')
    stems = result.get('stems') or []
    if not stems:
        raise RuntimeError('remote decomposer returned no stems')
    output_dir.mkdir(parents=True, exist_ok=True)
    materialized = []
    for index, stem in enumerate(stems):
        name = str(stem.get('name') or f'stem-{index+1}').lower().replace('/', '-').replace('\\', '-')
        filename = Path(str(stem.get('fileName') or f'{name}.wav')).name
        target = output_dir / filename
        if stem.get('audioBase64'):
            target.write_bytes(base64.b64decode(stem['audioBase64']))
        elif stem.get('downloadUrl'):
            with httpx.Client(timeout=3600, follow_redirects=True) as client:
                response = client.get(str(stem['downloadUrl']))
                response.raise_for_status()
                target.write_bytes(response.content)
        elif stem.get('path') and Path(str(stem['path'])).is_file():
            source_path = Path(str(stem['path']))
            target.write_bytes(source_path.read_bytes())
        else:
            raise RuntimeError(f'remote stem {name!r} has no materializable audio payload')
        meta = probe_audio(target)
        materialized.append({
            'name': name, 'path': str(target), 'durationSec': meta['durationSec'],
            'sampleRate': meta['sampleRate'], 'channels': meta['channels'], 'mimeType': 'audio/wav',
            'confidence': stem.get('confidence'),
        })
    return {
        'schema': 'fidelis.decomposition.v0.1',
        'status': 'complete',
        'adapter': result.get('adapter') or {'id': 'demucs', 'model': 'remote-worker'},
        'stems': materialized,
    }

def ingest_source(project_id: str, path: Path, *, filename: str, mime_type: str | None, source_kind: str,
                  instrument: str = 'unknown') -> dict[str, Any]:
    project = _project(project_id)
    meta = probe_audio(path)
    artifact = storage.store_artifact(project_id, path, role='source', filename=filename, mime_type=mime_type,
                                      metadata={'audio': meta, 'sourceKind': source_kind, 'instrument': instrument})
    _remember_artifact(project, artifact)
    project['source']['kind'] = source_kind
    project['source']['primaryArtifactId'] = artifact['id']
    project['timeline']['durationSec'] = meta['durationSec']
    project['timeline']['sampleRate'] = meta['sampleRate']

    # Replace only the previous primary-source part; supplied/decomposed parts remain explicit.
    project['parts'] = [p for p in project.get('parts', []) if p.get('origin') != 'primary-stem']
    if source_kind == 'stem':
        project['parts'].append({
            'id': _part_id(filename), 'label': Path(filename).stem, 'instrument': instrument, 'origin': 'primary-stem',
            'sourceArtifactId': artifact['id'], 'status': 'available', 'performance': None, 'routeDecision': None,
            'renderer': {'status': 'unassigned', 'adapterId': None, 'intendedRouteId': None, 'fallback': False},
            'reconstruction': {'status': 'not-started', 'artifactId': None}, 'qc': None,
        })
    _reassembly(project)
    storage.save_project(project)
    return {'project': project, 'artifact': artifact}


def ingest_supplied_stem(project_id: str, path: Path, *, filename: str, mime_type: str | None,
                         instrument: str = 'unknown') -> dict[str, Any]:
    project = _project(project_id)
    meta = probe_audio(path)
    artifact = storage.store_artifact(project_id, path, role='supplied-stem', filename=filename, mime_type=mime_type,
                                      metadata={'audio': meta, 'instrument': instrument})
    _remember_artifact(project, artifact)
    if artifact['id'] not in project['source']['suppliedStemArtifactIds']:
        project['source']['suppliedStemArtifactIds'].append(artifact['id'])
    project['parts'].append({
        'id': _part_id(filename), 'label': Path(filename).stem, 'instrument': instrument, 'origin': 'supplied-stem',
        'sourceArtifactId': artifact['id'], 'status': 'available', 'performance': None, 'routeDecision': None,
        'renderer': {'status': 'unassigned', 'adapterId': None, 'intendedRouteId': None, 'fallback': False},
        'reconstruction': {'status': 'not-started', 'artifactId': None}, 'qc': None,
    })
    _reassembly(project)
    storage.save_project(project)
    return {'project': project, 'artifact': artifact}


def submit_decomposition(project_id: str, *, wait: bool = False) -> dict[str, Any]:
    project = _project(project_id)
    aid = project['source'].get('primaryArtifactId')
    if project['source'].get('kind') != 'full_mix' or not aid:
        raise ValueError('decomposition requires a full_mix project with a primary source')
    source = _artifact(aid)
    cap = REGISTRY.capabilities()['demucs']

    def work():
        if cap['status'] != 'ready':
            return {'status': 'blocked', 'capability': cap, 'stems': []}
        out = RUNTIME / 'decomposition' / f"{project_id}-{int(time.time())}"
        if cap.get('execution') == 'remote-worker':
            remote = REGISTRY.remote('demucs').execute(
                operation='decompose', project_id=project_id, source_path=Path(source['path']),
                options={'model': (cap.get('metadata') or {}).get('model', 'htdemucs')},
            )
            result = _materialize_remote_decomposition(remote, out)
        else:
            result = REGISTRY.demucs.run(Path(source['path']), out)
        project2 = _project(project_id)
        added = []
        run_id = f"decomp_{uuid.uuid4().hex[:10]}"
        for stem in result['stems']:
            artifact = storage.store_artifact(project_id, Path(stem['path']), role='decomposed-stem', filename=Path(stem['path']).name,
                                              mime_type='audio/wav', metadata={'audio': stem, 'adapterId': result['adapter'].get('id', 'demucs'), 'runId': run_id})
            _remember_artifact(project2, artifact)
            part = {
                'id': _part_id(stem['name']), 'label': stem['name'].title(), 'instrument': 'unknown' if stem['name'] == 'other' else stem['name'],
                'origin': 'decomposed', 'sourceArtifactId': artifact['id'], 'status': 'recovered-audio',
                'decomposition': {'adapterId': result['adapter'].get('id', 'demucs'), 'runId': run_id, 'model': result['adapter'].get('model')},
                'performance': None, 'routeDecision': None,
                'renderer': {'status': 'unassigned', 'adapterId': None, 'intendedRouteId': None, 'fallback': False},
                'reconstruction': {'status': 'not-started', 'artifactId': None}, 'qc': None,
            }
            project2['parts'].append(part)
            added.append(part)
        project2['provenance']['lastDecomposition'] = {'adapterId': result['adapter'].get('id', 'demucs'), 'runId': run_id, 'model': result['adapter'].get('model')}
        _reassembly(project2)
        storage.save_project(project2)
        return {'status': 'complete', 'adapter': result['adapter'], 'parts': added}

    job = RUNNER.submit(project_id, 'decompose', {'adapterId': 'demucs', 'capability': cap}, work)
    return RUNNER.wait(job['id'], timeout=3600) if wait else job


def submit_analysis(project_id: str, part_id: str, *, adapter_id: str = 'fidelis-native-performance', wait: bool = False) -> dict[str, Any]:
    project = _project(project_id)
    part = _part(project, part_id)
    artifact = _artifact(part['sourceArtifactId'])

    def work():
        if adapter_id == 'fidelis-native-performance':
            perf = REGISTRY.performance.run(Path(artifact['path']), instrument=part.get('instrument') or 'unknown')
        elif adapter_id in {'basic-pitch', 'stradi'}:
            worker = REGISTRY.remote(adapter_id)
            result = worker.execute(operation='analyze', project_id=project_id, part_id=part_id, source_path=Path(artifact['path']),
                                    options={'instrument': part.get('instrument') or 'unknown'})
            perf = result.get('performance') if isinstance(result, dict) else None
            if not isinstance(perf, dict):
                if isinstance(result, dict) and str(result.get('schema','')).startswith('fidelis.performance.'):
                    perf = result
                else:
                    raise RuntimeError(f'{adapter_id} worker did not return a Fidelis performance document')
        else:
            raise RuntimeError(f'unsupported performance adapter: {adapter_id}')
        perf_art = storage.write_artifact_bytes(project_id, json.dumps(perf, indent=2).encode('utf-8'), role='performance-map',
                                                filename=f"{part_id}.performance.json", mime_type='application/json',
                                                metadata={'adapterId': adapter_id, 'partId': part_id})
        project2 = _project(project_id)
        part2 = _part(project2, part_id)
        part2['performance'] = {'artifactId': perf_art['id'], 'document': perf}
        part2['status'] = 'performance-mapped'
        _remember_artifact(project2, perf_art)
        storage.save_project(project2)
        return {'partId': part_id, 'performanceArtifactId': perf_art['id'], 'performance': perf}

    job = RUNNER.submit(project_id, 'analyze', {'partId': part_id, 'adapterId': adapter_id}, work)
    return RUNNER.wait(job['id'], timeout=1800) if wait else job


def route_part(project_id: str, part_id: str, *, desired_route_id: str | None = None, allow_fallback: bool = True) -> dict[str, Any]:
    project = _project(project_id)
    part = _part(project, part_id)
    perf = ((part.get('performance') or {}).get('document'))
    caps = REGISTRY.capabilities()
    decision = judge_routes(instrument=part.get('instrument') or 'unknown', performance=perf, capabilities=caps)
    desired = desired_route_id or decision['preferredRouteId']
    desired_route = next((r for r in decision['desiredRoutes'] if r['id'] == desired), None)
    if desired == 'reference':
        adapter_id = 'fidelis-reference-synth'
        fallback = False
    elif desired_route and desired_route.get('executable'):
        if desired == 'physical':
            adapter_id = ('instrudio' if (caps.get('instrudio') or {}).get('status') == 'ready' else 'instrudio-native' if (caps.get('instrudio-native') or {}).get('status') == 'ready' else 'fidelis-physical-violin')
        elif desired == 'ddsp':
            adapter_id = 'ddsp'
        else:
            adapter_id = next(x for x in desired_route['stack'] if (caps.get(x) or {}).get('status') == 'ready')
        fallback = False
    elif allow_fallback and (caps.get('fidelis-reference-synth') or {}).get('status') == 'ready':
        adapter_id = 'fidelis-reference-synth'
        fallback = True
    else:
        adapter_id = None
        fallback = False

    part['routeDecision'] = decision
    part['renderer'] = {
        'status': 'assigned' if adapter_id else 'blocked', 'adapterId': adapter_id,
        'intendedRouteId': desired, 'fallback': fallback,
        'note': 'Reference synth is a pipeline fallback, not the target fidelity renderer.' if fallback else None,
    }
    project['routes'] = [r for r in project.get('routes', []) if r.get('partId') != part_id]
    project['routes'].append({'partId': part_id, 'decision': decision, 'selectedRouteId': desired, 'adapterId': adapter_id, 'fallback': fallback})
    _reassembly(project)
    storage.save_project(project)
    return {'partId': part_id, 'decision': decision, 'assignment': part['renderer']}


def submit_render(project_id: str, part_id: str, *, wait: bool = False) -> dict[str, Any]:
    project = _project(project_id)
    part = _part(project, part_id)
    assignment = part.get('renderer') or {}
    adapter_id = assignment.get('adapterId')
    if not adapter_id:
        raise ValueError('part has no executable renderer assignment; route it first')

    def work():
        project2 = _project(project_id)
        part2 = _part(project2, part_id)
        perf = ((part2.get('performance') or {}).get('document'))
        if not perf:
            raise RuntimeError('rendering requires a performance map')
        output = RUNTIME / 'renders' / project_id / f"{part_id}.{adapter_id}.wav"
        output.parent.mkdir(parents=True, exist_ok=True)
        if adapter_id == 'fidelis-reference-synth':
            rendered = REGISTRY.reference.run(perf, output)
        elif adapter_id == 'instrudio-native':
            rendered = REGISTRY.instrudio_native.run(perf, output)
        elif adapter_id == 'fidelis-physical-violin':
            rendered = REGISTRY.physical_violin.run(perf, output)
        elif adapter_id in {'instrudio', 'ddsp', 'rave', 'brave', 'sony-diffusion', 'wavetransfer'}:
            source_artifact = _artifact(part2['sourceArtifactId'])
            operation = 'timbre_transfer' if adapter_id in {'rave','brave','sony-diffusion','wavetransfer'} else 'render'
            rendered = REGISTRY.remote(adapter_id).execute(
                operation=operation, project_id=project_id, part_id=part_id, source_path=Path(source_artifact['path']),
                performance=perf, options={'instrument': part2.get('instrument'), 'intendedRouteId': assignment.get('intendedRouteId')},
                output_path=output,
            )
            returned_path = Path(((rendered.get('artifact') or {}).get('path') or output))
            if returned_path != output and returned_path.is_file():
                output.write_bytes(returned_path.read_bytes())
            if not output.is_file():
                raise RuntimeError(f'{adapter_id} worker completed without an audio artifact')
        else:
            raise RuntimeError(f'unsupported renderer adapter: {adapter_id}')
        artifact = storage.store_artifact(project_id, output, role='reconstruction-candidate', filename=output.name, mime_type='audio/wav',
                                          metadata={'adapterId': adapter_id, 'intendedRouteId': assignment.get('intendedRouteId'), 'fallback': assignment.get('fallback')})
        _remember_artifact(project2, artifact)
        part2['reconstruction'] = {'status': 'candidate', 'artifactId': artifact['id'], 'adapterId': adapter_id,
                                   'intendedRouteId': assignment.get('intendedRouteId'), 'fallback': assignment.get('fallback')}
        _reassembly(project2)
        storage.save_project(project2)
        return {'partId': part_id, 'artifact': artifact, 'render': rendered}

    job = RUNNER.submit(project_id, 'render', {'partId': part_id, 'adapterId': adapter_id}, work)
    return RUNNER.wait(job['id'], timeout=1800) if wait else job


def submit_qc(project_id: str, part_id: str, *, wait: bool = False) -> dict[str, Any]:
    project = _project(project_id)
    part = _part(project, part_id)
    source = _artifact(part['sourceArtifactId'])
    candidate_id = (part.get('reconstruction') or {}).get('artifactId')
    if not candidate_id:
        raise ValueError('part has no reconstruction candidate')
    candidate = _artifact(candidate_id)

    def work():
        report = compare_audio(Path(source['path']), Path(candidate['path']))
        report_art = storage.write_artifact_bytes(project_id, json.dumps(report, indent=2).encode(), role='qc-report',
                                                  filename=f'{part_id}.qc.json', mime_type='application/json', metadata={'partId': part_id})
        project2 = _project(project_id)
        part2 = _part(project2, part_id)
        part2['qc'] = {'artifactId': report_art['id'], 'report': report}
        project2['qc']['status'] = 'evidence-available'
        project2['qc']['checks'] = [x for x in project2['qc'].get('checks', []) if x.get('partId') != part_id]
        project2['qc']['checks'].append({'partId': part_id, 'artifactId': report_art['id'], 'metrics': report['metrics']})
        _remember_artifact(project2, report_art)
        storage.save_project(project2)
        return {'partId': part_id, 'qcArtifactId': report_art['id'], 'report': report}

    job = RUNNER.submit(project_id, 'qc', {'partId': part_id}, work)
    return RUNNER.wait(job['id'], timeout=1800) if wait else job


def submit_reassembly(project_id: str, *, wait: bool = False) -> dict[str, Any]:
    project = _project(project_id)

    def work():
        project2 = _project(project_id)
        tracks = project2.get('reassembly', {}).get('tracks') or []
        if not tracks:
            raise RuntimeError('reassembly has no tracks')
        target_sr = int(project2['timeline'].get('sampleRate') or 48000)
        loaded = []
        max_len = 0
        for track in tracks:
            artifact = _artifact(track['artifactId'])
            data, sr = sf.read(artifact['path'], always_2d=True, dtype='float32')
            # soundfile returns frames x channels
            if sr != target_sr:
                channels = [librosa.resample(data[:, c], orig_sr=sr, target_sr=target_sr) for c in range(data.shape[1])]
                data = np.stack(channels, axis=1)
            if data.shape[1] == 1:
                data = np.repeat(data, 2, axis=1)
            elif data.shape[1] > 2:
                data = data[:, :2]
            offset = max(0, int(float(track.get('offsetSec') or 0) * target_sr))
            gain = 10 ** (float(track.get('gainDb') or 0) / 20)
            pan = max(-1.0, min(1.0, float(track.get('pan') or 0)))
            gains = np.array([math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)], dtype=np.float32) * math.sqrt(2)
            data = data * gain * gains
            loaded.append((offset, data))
            max_len = max(max_len, offset + len(data))
        mix = np.zeros((max_len, 2), dtype=np.float32)
        for offset, data in loaded:
            mix[offset:offset + len(data)] += data
        peak = float(np.max(np.abs(mix)))
        if peak > .96:
            mix *= .96 / peak
        output = RUNTIME / 'reassembly' / project_id / 'reassembled.wav'
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output, mix, target_sr, subtype='PCM_16')
        artifact = storage.store_artifact(project_id, output, role='reassembled-master', filename='reassembled.wav', mime_type='audio/wav',
                                          metadata={'sampleRate': target_sr, 'tracks': len(tracks)})
        _remember_artifact(project2, artifact)
        project2['reassembly']['masterArtifactId'] = artifact['id']
        project2['reassembly']['status'] = 'candidate'
        storage.save_project(project2)
        return {'artifact': artifact, 'tracks': len(tracks), 'sampleRate': target_sr}

    job = RUNNER.submit(project_id, 'reassemble', {}, work)
    return RUNNER.wait(job['id'], timeout=1800) if wait else job


def harness_context(project_id: str) -> dict[str, Any]:
    project = _project(project_id)
    return build_context(project, capabilities=REGISTRY.capabilities(), jobs=storage.list_jobs(project_id))


def harness_plan(project_id: str, objective: str) -> dict[str, Any]:
    return request_plan(harness_context(project_id), objective)


def run_project_pipeline(project_id: str, *, allow_fallback: bool = True, reassemble_when_possible: bool = True) -> dict[str, Any]:
    """Run every currently executable deterministic stage, stopping honestly at blocked dependencies."""
    project = _project(project_id)
    report: dict[str, Any] = {'schema': 'fidelis.project-pipeline.v0.1', 'projectId': project_id, 'status': 'running', 'stages': []}

    if project['source'].get('kind') == 'full_mix' and not project.get('parts'):
        decomp = submit_decomposition(project_id, wait=True)
        report['stages'].append({'stage': 'decompose', 'job': decomp})
        result = decomp.get('result') or {}
        if decomp.get('status') != 'complete' or result.get('status') != 'complete':
            report['status'] = 'blocked' if result.get('status') == 'blocked' else 'failed'
            report['blockedAt'] = 'decompose'
            report['project'] = _project(project_id)
            return report
        project = _project(project_id)

    part_reports = []
    for part in list(project.get('parts') or []):
        pr: dict[str, Any] = {'partId': part['id'], 'instrument': part.get('instrument'), 'status': 'running'}
        try:
            if not part.get('performance'):
                if part.get('instrument') == 'drums':
                    pr['status'] = 'blocked'
                    pr['reason'] = 'No ready drum-performance or direct-transfer adapter is available.'
                    part_reports.append(pr)
                    continue
                analysis = submit_analysis(project_id, part['id'], wait=True)
                pr['analysis'] = analysis
                if analysis.get('status') != 'complete':
                    pr['status'] = 'failed'
                    part_reports.append(pr)
                    continue
            routed = route_part(project_id, part['id'], allow_fallback=allow_fallback)
            pr['route'] = routed
            if not (routed.get('assignment') or {}).get('adapterId'):
                pr['status'] = 'blocked'
                part_reports.append(pr)
                continue
            render = submit_render(project_id, part['id'], wait=True)
            pr['render'] = render
            if render.get('status') != 'complete':
                pr['status'] = 'failed'
                part_reports.append(pr)
                continue
            qc = submit_qc(project_id, part['id'], wait=True)
            pr['qc'] = qc
            pr['status'] = 'complete' if qc.get('status') == 'complete' else 'failed'
        except Exception as exc:
            pr['status'] = 'failed'
            pr['error'] = f'{type(exc).__name__}: {exc}'
        part_reports.append(pr)

    report['stages'].append({'stage': 'parts', 'items': part_reports})
    completed = [p for p in part_reports if p['status'] == 'complete']
    blocked = [p for p in part_reports if p['status'] == 'blocked']
    failed = [p for p in part_reports if p['status'] == 'failed']

    if reassemble_when_possible and completed:
        reassembly = submit_reassembly(project_id, wait=True)
        report['stages'].append({'stage': 'reassemble', 'job': reassembly})
        if reassembly.get('status') != 'complete':
            failed.append({'status': 'failed', 'stage': 'reassemble'})

    report['status'] = 'failed' if failed else 'partial' if blocked else 'complete'
    report['summary'] = {'completeParts': len(completed), 'blockedParts': len(blocked), 'failedParts': len(failed)}
    report['project'] = _project(project_id)
    return report
