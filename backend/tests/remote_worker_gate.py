from __future__ import annotations

import json
import os
import shutil
import socket
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from fixture import ensure_test_wav

# A deliberately tiny worker: it accepts Fidelis multipart and returns the source WAV unchanged.
# This tests transport/orchestration only; it is not a fidelity engine.
FIXTURE = ensure_test_wav('test-fiddle.wav')
SOURCE = FIXTURE.read_bytes()

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length=int(self.headers.get('content-length') or 0)
        _=self.rfile.read(length)
        if self.path == '/demucs':
            port=self.server.server_address[1]
            payload={
                'schema':'fidelis.decomposition.v0.1',
                'status':'complete',
                'adapter':{'id':'demucs','model':'htdemucs-remote-test'},
                'stems':[
                    {'name':name,'fileName':f'{name}.wav','downloadUrl':f'http://127.0.0.1:{port}/stem/{name}.wav'}
                    for name in ('vocals','drums','bass','other')
                ],
            }
            body=json.dumps(payload).encode()
            self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header('Content-Type','audio/wav')
        self.send_header('Content-Length',str(len(SOURCE)))
        self.end_headers(); self.wfile.write(SOURCE)
    def do_GET(self):
        if self.path.startswith('/stem/'):
            self.send_response(200); self.send_header('Content-Type','audio/wav'); self.send_header('Content-Length',str(len(SOURCE))); self.end_headers(); self.wfile.write(SOURCE); return
        self.send_response(404); self.end_headers()
    def log_message(self,*args): pass

srv=ThreadingHTTPServer(('127.0.0.1',0),Handler)
thread=threading.Thread(target=srv.serve_forever,daemon=True); thread.start()
url=f'http://127.0.0.1:{srv.server_address[1]}/rave'
demucs_url=f'http://127.0.0.1:{srv.server_address[1]}/demucs'
os.environ['FIDELIS_RAVE_URL']=url
os.environ['FIDELIS_DEMUCS_URL']=demucs_url
os.environ['FIDELIS_RUNTIME']=tempfile.mkdtemp(prefix='fidelis-worker-gate-')

from fastapi.testclient import TestClient
from fidelis_backend.api import app

try:
    c=TestClient(app)
    caps=c.get('/api/capabilities').json()['items']
    assert caps['rave']['status']=='ready',caps['rave']
    assert caps['demucs']['status']=='ready' and caps['demucs']['execution']=='remote-worker',caps['demucs']
    p=c.post('/api/projects',json={'name':'Worker Gate','sourceKind':'stem'}).json(); pid=p['project']['id']
    with FIXTURE.open('rb') as f:
        r=c.post(f'/api/projects/{pid}/source',data={'sourceKind':'stem','instrument':'guitar'},files={'file':('guitar.wav',f,'audio/wav')})
    part=r.json()['project']['parts'][0]['id']
    a=c.post(f'/api/projects/{pid}/parts/{part}/analyze?wait=true'); assert a.json()['status']=='complete'
    route=c.post(f'/api/projects/{pid}/parts/{part}/route',json={'desiredRouteId':'direct','allowFallback':False}).json()
    assert route['assignment']['adapterId']=='rave' and route['assignment']['fallback'] is False,route
    rendered=c.post(f'/api/projects/{pid}/parts/{part}/render?wait=true').json(); assert rendered['status']=='complete',rendered
    aid=rendered['result']['artifact']['id']
    blob=c.get(f'/api/artifacts/{aid}/download'); assert blob.status_code==200 and blob.content[:4]==b'RIFF'

    mix=c.post('/api/projects',json={'name':'Remote Demucs Gate','sourceKind':'full_mix'}).json(); mid=mix['project']['id']
    with FIXTURE.open('rb') as f:
        msrc=c.post(f'/api/projects/{mid}/source',data={'sourceKind':'full_mix','instrument':'unknown'},files={'file':('mix.wav',f,'audio/wav')})
    assert msrc.status_code==200
    dec=c.post(f'/api/projects/{mid}/decompose?wait=true').json(); assert dec['status']=='complete',dec
    project=c.get(f'/api/projects/{mid}').json(); assert len(project['parts'])==4,project['parts']
    assert {p['instrument'] for p in project['parts']}=={'vocals','drums','bass','unknown'}
    assert project['provenance']['lastDecomposition']['model']=='htdemucs-remote-test'
    print('FIDELIS REMOTE WORKER GATE: PASS',url,demucs_url)
finally:
    srv.shutdown(); srv.server_close()
