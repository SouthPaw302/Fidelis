from __future__ import annotations
import os, tempfile
from pathlib import Path
from fixture import ensure_test_wav

os.environ['FIDELIS_RUNTIME']=tempfile.mkdtemp(prefix='fidelis-backend-gate-')

from fastapi.testclient import TestClient
from fidelis_backend.api import app

wav=ensure_test_wav('test-fiddle.wav')
c=TestClient(app)
health=c.get('/api/health'); assert health.status_code==200
caps=c.get('/api/capabilities').json()['items']
assert caps['fidelis-native-performance']['status']=='ready'
assert caps['fidelis-reference-synth']['status']=='ready'
assert caps['instrudio-native']['status']=='ready'
assert caps['fidelis-physical-violin']['status']=='ready'
assert caps['demucs']['status'] in {'ready','blocked'}
models=c.get('/api/models'); assert models.status_code==200 and 'demucs' in models.json()['items']
if caps['demucs']['status']=='blocked':
    bad=c.post('/api/models/demucs/checkpoint',files={'file':('bad.th',b'not-a-demucs-model','application/octet-stream')})
    assert bad.status_code==400 and 'SHA-256 mismatch' in bad.json()['detail']
    assert c.get('/api/capabilities').json()['items']['demucs']['status']=='blocked'

p=c.post('/api/projects',json={'name':'Backend Gate','sourceKind':'stem'}).json(); pid=p['project']['id']
with wav.open('rb') as f:
    src=c.post(f'/api/projects/{pid}/source',data={'sourceKind':'stem','instrument':'fiddle'},files={'file':('fiddle.wav',f,'audio/wav')})
assert src.status_code==200
part=src.json()['project']['parts'][0]['id']
pipe=c.post(f'/api/projects/{pid}/parts/{part}/pipeline',json={'allowFallback':True,'runQc':True})
assert pipe.status_code==200 and pipe.json()['status']=='complete'
assert pipe.json()['route']['assignment']['intendedRouteId']=='physical'
assert pipe.json()['route']['assignment']['adapterId']=='instrudio-native'
assert pipe.json()['route']['assignment']['fallback'] is False
assert pipe.json()['render']['result']['render']['sourceWaveformReuse'] is False
re=c.post(f'/api/projects/{pid}/reassemble?wait=true').json(); assert re['status']=='complete'
aid=re['result']['artifact']['id']
blob=c.get(f'/api/artifacts/{aid}/download'); assert blob.status_code==200 and blob.content[:4]==b'RIFF'
ctx=c.get(f'/api/projects/{pid}/harness/context'); assert ctx.status_code==200
plan=c.post(f'/api/projects/{pid}/harness/plan',json={'objective':'highest fidelity reconstruction'}); assert plan.status_code==200

mix=c.post('/api/projects',json={'name':'Full Mix Gate','sourceKind':'full_mix'}).json(); mid=mix['project']['id']
with wav.open('rb') as f:
    src=c.post(f'/api/projects/{mid}/source',data={'sourceKind':'full_mix','instrument':'unknown'},files={'file':('mix.wav',f,'audio/wav')})
assert src.status_code==200
result=c.post(f'/api/projects/{mid}/autopilot').json()
if caps['demucs']['status']=='blocked':
    assert result['status']=='blocked' and result['blockedAt']=='decompose'
    assert c.get(f'/api/projects/{mid}').json()['parts']==[]
print('FIDELIS BACKEND GATE: PASS')
