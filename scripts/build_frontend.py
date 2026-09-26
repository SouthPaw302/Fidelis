from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'

if DIST.exists():
    shutil.rmtree(DIST)

# The browser-local Fidelis frontend imports modules across src/audio, src/core,
# src/orchestrator and src/ui. Copy the complete frontend module tree so Vercel's
# generated dist matches the working pre-backend file-intake path.
shutil.copytree(ROOT / 'src', DIST / 'src')

for name in ('index.html', 'styles.css'):
    shutil.copy2(ROOT / name, DIST / name)

print(f'FIDELIS FRONTEND BUILD: {DIST}')
