#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python -m compileall -q backend/fidelis_backend
PYTHONPATH=backend python backend/tests/core_freeze.py
PYTHONPATH=backend python backend/tests/backend_gate.py
PYTHONPATH=backend python backend/tests/mcp_selftest.py
PYTHONPATH=backend python backend/tests/remote_worker_gate.py
