from __future__ import annotations

import os
from pathlib import Path

import httpx

from fixture import ensure_test_wav

BASE = os.environ.get('FIDELIS_TEST_BASE_URL', 'http://127.0.0.1:8787').rstrip('/')
FIXTURE = ensure_test_wav(Path(__file__).resolve().parents[2] / 'test-fiddle.wav')

with httpx.Client(base_url=BASE, timeout=180.0) as c:
    health = c.get('/api/health')
    health.raise_for_status()
    assert health.json()['ok'] is True

    caps = c.get('/api/capabilities').json()['items']
    assert caps['fidelis-native-performance']['status'] == 'ready'
    assert caps['fidelis-physical-violin']['status'] == 'ready'
    assert caps['fidelis-qc']['status'] == 'ready'

    models = c.get('/api/models')
    models.raise_for_status()
    assert 'demucs' in models.json()['items']
    if caps['demucs']['status'] == 'blocked':
        bad = c.post('/api/models/demucs/checkpoint', files={'file': ('invalid.th', b'bad model', 'application/octet-stream')})
        assert bad.status_code == 400

    created = c.post('/api/projects', json={'name': 'Live HTTP Physical Gate', 'sourceKind': 'stem'})
    created.raise_for_status()
    pid = created.json()['project']['id']
    with FIXTURE.open('rb') as fh:
        source = c.post(
            f'/api/projects/{pid}/source',
            data={'sourceKind': 'stem', 'instrument': 'fiddle'},
            files={'file': ('fiddle.wav', fh, 'audio/wav')},
        )
    source.raise_for_status()
    part_id = source.json()['project']['parts'][0]['id']

    pipeline = c.post(
        f'/api/projects/{pid}/parts/{part_id}/pipeline',
        json={'desiredRouteId': 'physical', 'allowFallback': False, 'runQc': True},
    )
    pipeline.raise_for_status()
    result = pipeline.json()
    assert result['status'] == 'complete', result
    assignment = result['route']['assignment']
    assert assignment['adapterId'] == 'instrudio-native', assignment
    assert assignment['fallback'] is False
    render = result['render']['result']['render']
    assert render['sourceWaveformReuse'] is False
    assert render['sampleRate'] == 48000
    assert render['channels'] == 2

    reassembled = c.post(f'/api/projects/{pid}/reassemble?wait=true')
    reassembled.raise_for_status()
    assert reassembled.json()['status'] == 'complete'
    master_id = reassembled.json()['result']['artifact']['id']
    wav = c.get(f'/api/artifacts/{master_id}/download')
    wav.raise_for_status()
    assert wav.content[:4] == b'RIFF'

    mix_created = c.post('/api/projects', json={'name': 'Live HTTP Full Mix Gate', 'sourceKind': 'full_mix'}).json()
    mid = mix_created['project']['id']
    with FIXTURE.open('rb') as fh:
        mix_source = c.post(
            f'/api/projects/{mid}/source',
            data={'sourceKind': 'full_mix', 'instrument': 'unknown'},
            files={'file': ('mix.wav', fh, 'audio/wav')},
        )
    mix_source.raise_for_status()
    if caps['demucs']['status'] == 'blocked':
        auto = c.post(f'/api/projects/{mid}/autopilot')
        auto.raise_for_status()
        auto_result = auto.json()
        assert auto_result['status'] == 'blocked' and auto_result['blockedAt'] == 'decompose', auto_result
        assert c.get(f'/api/projects/{mid}').json()['parts'] == []

print('FIDELIS LIVE HTTP GATE: PASS')
