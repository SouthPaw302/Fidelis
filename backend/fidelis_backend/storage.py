from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .config import ARTIFACT_DIR, DB_PATH

_LOCK = threading.RLock()


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with _LOCK, _connect() as con:
        con.executescript(
            '''
            CREATE TABLE IF NOT EXISTS projects (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              document TEXT NOT NULL,
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              project_id TEXT,
              kind TEXT NOT NULL,
              status TEXT NOT NULL,
              request TEXT NOT NULL,
              result TEXT,
              error TEXT,
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS artifacts (
              id TEXT PRIMARY KEY,
              project_id TEXT,
              role TEXT NOT NULL,
              filename TEXT NOT NULL,
              path TEXT NOT NULL,
              mime_type TEXT,
              size INTEGER NOT NULL,
              sha256 TEXT NOT NULL,
              metadata TEXT NOT NULL,
              created_at REAL NOT NULL
            );
            '''
        )


def _slug(value: str) -> str:
    text = ''.join(c.lower() if c.isalnum() else '-' for c in value.strip())
    while '--' in text:
        text = text.replace('--', '-')
    return text.strip('-')[:64] or 'project'


def create_project(name: str, source_kind: str = 'full_mix') -> dict[str, Any]:
    now = time.time()
    project_id = f"project_{_slug(name)}_{uuid.uuid4().hex[:8]}"
    doc = {
        'schema': 'fidelis.project.v0.3-backend',
        'project': {'id': project_id, 'name': name, 'createdAt': now, 'status': 'ready'},
        'source': {'kind': source_kind, 'primaryArtifactId': None, 'suppliedStemArtifactIds': []},
        'artifacts': [],
        'timeline': {'durationSec': 0.0, 'sampleRate': None, 'tempo': {'bpm': None, 'confidence': 0.0, 'source': None}, 'beats': [], 'phrases': []},
        'parts': [],
        'routes': [],
        'reassembly': {'status': 'not-started', 'tracks': [], 'masterArtifactId': None},
        'qc': {'status': 'not-run', 'checks': []},
        'provenance': {'application': 'Fidelis', 'backendVersion': '0.3-prealpha'},
    }
    with _LOCK, _connect() as con:
        con.execute('INSERT INTO projects(id,name,document,created_at,updated_at) VALUES(?,?,?,?,?)',
                    (project_id, name, json.dumps(doc), now, now))
    return doc


def get_project(project_id: str) -> dict[str, Any] | None:
    with _LOCK, _connect() as con:
        row = con.execute('SELECT document FROM projects WHERE id=?', (project_id,)).fetchone()
    return json.loads(row['document']) if row else None


def save_project(project: dict[str, Any]) -> dict[str, Any]:
    pid = project['project']['id']
    now = time.time()
    with _LOCK, _connect() as con:
        cur = con.execute('UPDATE projects SET document=?,updated_at=? WHERE id=?', (json.dumps(project), now, pid))
        if cur.rowcount != 1:
            raise KeyError(f'project not found: {pid}')
    return project


def list_projects() -> list[dict[str, Any]]:
    with _LOCK, _connect() as con:
        rows = con.execute('SELECT document FROM projects ORDER BY updated_at DESC').fetchall()
    return [json.loads(row['document']) for row in rows]


def create_job(project_id: str | None, kind: str, request: dict[str, Any]) -> dict[str, Any]:
    jid = f"job_{kind.replace('.', '-')}_{uuid.uuid4().hex[:10]}"
    now = time.time()
    row = {'id': jid, 'projectId': project_id, 'kind': kind, 'status': 'queued', 'request': request,
           'result': None, 'error': None, 'createdAt': now, 'updatedAt': now}
    with _LOCK, _connect() as con:
        con.execute('INSERT INTO jobs(id,project_id,kind,status,request,result,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                    (jid, project_id, kind, 'queued', json.dumps(request), None, None, now, now))
    return row


def update_job(job_id: str, *, status: str | None = None, result: Any = None, error: str | None = None) -> dict[str, Any]:
    current = get_job(job_id)
    if not current:
        raise KeyError(job_id)
    if status is not None:
        current['status'] = status
    if result is not None:
        current['result'] = result
    if error is not None:
        current['error'] = error
    current['updatedAt'] = time.time()
    with _LOCK, _connect() as con:
        con.execute('UPDATE jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?',
                    (current['status'], json.dumps(current['result']) if current['result'] is not None else None,
                     current['error'], current['updatedAt'], job_id))
    return current


def get_job(job_id: str) -> dict[str, Any] | None:
    with _LOCK, _connect() as con:
        row = con.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if not row:
        return None
    return {
        'id': row['id'], 'projectId': row['project_id'], 'kind': row['kind'], 'status': row['status'],
        'request': json.loads(row['request']), 'result': json.loads(row['result']) if row['result'] else None,
        'error': row['error'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at']
    }


def list_jobs(project_id: str | None = None) -> list[dict[str, Any]]:
    with _LOCK, _connect() as con:
        if project_id:
            rows = con.execute('SELECT id FROM jobs WHERE project_id=? ORDER BY created_at DESC', (project_id,)).fetchall()
        else:
            rows = con.execute('SELECT id FROM jobs ORDER BY created_at DESC').fetchall()
    return [get_job(row['id']) for row in rows]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def store_artifact(project_id: str | None, source: Path, *, role: str, filename: str | None = None,
                   mime_type: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    source = Path(source)
    if not source.is_file():
        raise FileNotFoundError(source)
    aid = f"artifact_{uuid.uuid4().hex[:12]}"
    final_name = filename or source.name
    ext = Path(final_name).suffix
    target = ARTIFACT_DIR / f"{aid}{ext}"
    shutil.copy2(source, target)
    size = target.stat().st_size
    digest = _sha256(target)
    now = time.time()
    md = metadata or {}
    with _LOCK, _connect() as con:
        con.execute('INSERT INTO artifacts(id,project_id,role,filename,path,mime_type,size,sha256,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                    (aid, project_id, role, final_name, str(target), mime_type, size, digest, json.dumps(md), now))
    return {'id': aid, 'projectId': project_id, 'role': role, 'filename': final_name, 'path': str(target),
            'mimeType': mime_type, 'size': size, 'sha256': digest, 'metadata': md, 'createdAt': now}


def write_artifact_bytes(project_id: str | None, data: bytes, *, role: str, filename: str,
                         mime_type: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    temp = ARTIFACT_DIR / f".tmp-{uuid.uuid4().hex}-{Path(filename).name}"
    temp.write_bytes(data)
    try:
        return store_artifact(project_id, temp, role=role, filename=filename, mime_type=mime_type, metadata=metadata)
    finally:
        temp.unlink(missing_ok=True)


def get_artifact(artifact_id: str) -> dict[str, Any] | None:
    with _LOCK, _connect() as con:
        row = con.execute('SELECT * FROM artifacts WHERE id=?', (artifact_id,)).fetchone()
    if not row:
        return None
    return {'id': row['id'], 'projectId': row['project_id'], 'role': row['role'], 'filename': row['filename'],
            'path': row['path'], 'mimeType': row['mime_type'], 'size': row['size'], 'sha256': row['sha256'],
            'metadata': json.loads(row['metadata']), 'createdAt': row['created_at']}


def list_artifacts(project_id: str | None = None) -> list[dict[str, Any]]:
    with _LOCK, _connect() as con:
        if project_id:
            rows = con.execute('SELECT id FROM artifacts WHERE project_id=? ORDER BY created_at', (project_id,)).fetchall()
        else:
            rows = con.execute('SELECT id FROM artifacts ORDER BY created_at').fetchall()
    return [get_artifact(row['id']) for row in rows]

init_db()
