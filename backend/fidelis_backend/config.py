from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(os.environ.get('FIDELIS_RUNTIME', ROOT / 'runtime')).resolve()
DB_PATH = RUNTIME / 'fidelis.sqlite3'
ARTIFACT_DIR = RUNTIME / 'artifacts'
PROJECT_DIR = RUNTIME / 'projects'
JOB_DIR = RUNTIME / 'jobs'
MODEL_DIR = RUNTIME / 'models'

for path in (RUNTIME, ARTIFACT_DIR, PROJECT_DIR, JOB_DIR, MODEL_DIR):
    path.mkdir(parents=True, exist_ok=True)

HARNESS_URL = os.environ.get('FIDELIS_HARNESS_URL', '').strip()
HARNESS_TOKEN = os.environ.get('FIDELIS_HARNESS_TOKEN', '').strip()
DEMUCS_MODEL = os.environ.get('FIDELIS_DEMUCS_MODEL', 'htdemucs').strip() or 'htdemucs'
DEMUCS_DEVICE = os.environ.get('FIDELIS_DEMUCS_DEVICE', 'cpu').strip() or 'cpu'
DEMUCS_ALLOW_DOWNLOAD = os.environ.get('FIDELIS_DEMUCS_ALLOW_DOWNLOAD', '0') == '1'
