from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'

if DIST.exists():
    shutil.rmtree(DIST)
(DIST / 'src' / 'ui').mkdir(parents=True, exist_ok=True)

for name in ('index.html', 'styles.css'):
    shutil.copy2(ROOT / name, DIST / name)
for relative in ('src/app.js', 'src/backend-client.js', 'src/ui/waveform.js'):
    source = ROOT / relative
    target = DIST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

print(f'FIDELIS FRONTEND BUILD: {DIST}')
