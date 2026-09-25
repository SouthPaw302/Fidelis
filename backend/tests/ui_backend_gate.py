from __future__ import annotations

import base64
import os
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'test-fiddle.wav'
if not FIXTURE.is_file():
    from fixture import ensure_test_wav
    FIXTURE = ensure_test_wav(FIXTURE)

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'styles.css').read_text(encoding='utf-8')
client_js = (ROOT / 'src/backend-client.js').read_text(encoding='utf-8')
wave_js = (ROOT / 'src/ui/waveform.js').read_text(encoding='utf-8')
app_js = (ROOT / 'src/app.js').read_text(encoding='utf-8')

# Preserve exact module bytes except replacing relative module specifiers with data URLs.
def data_module(source: str) -> str:
    return 'data:text/javascript;base64,' + base64.b64encode(source.encode()).decode()

app_js = app_js.replace("'./backend-client.js'", repr(data_module(client_js))).replace("'./ui/waveform.js'", repr(data_module(wave_js)))
app_url = data_module(app_js)
html = html.replace('<link rel="stylesheet" href="./styles.css" />', f'<base href="http://fidelis.local/"><style>{css}</style>')
html = html.replace('<script type="module" src="./src/app.js"></script>', f'<script type="module" src="{app_url}"></script>')

errors: list[str] = []
console_errors: list[str] = []
client = httpx.Client(base_url='http://127.0.0.1:8787', timeout=120.0)


def proxy(route):
    req = route.request
    u = urlsplit(req.url)
    path = u.path + (('?' + u.query) if u.query else '')
    headers = dict(req.all_headers())
    for key in ['host', 'content-length', 'accept-encoding', 'connection']:
        headers.pop(key, None)
    try:
        # Playwright exposes multipart metadata but omits file bytes from intercepted
        # browser requests. Rehydrate the known synthetic fixture for this UI gate;
        # backend_gate.py separately verifies true multipart file bytes end-to-end.
        if req.method == 'POST' and path.endswith('/source'):
            raw = (req.post_data_buffer or b'').decode('utf-8', errors='ignore')
            source_kind = 'full_mix' if '\r\nfull_mix\r\n' in raw else 'stem'
            instrument = 'unknown'
            for candidate in ['fiddle','guitar','bass','piano','drums','vocals','unknown']:
                if f'\r\n{candidate}\r\n' in raw:
                    instrument = candidate
            with FIXTURE.open('rb') as fh:
                resp = client.post(path, data={'sourceKind': source_kind, 'instrument': instrument}, files={'file': (FIXTURE.name, fh, 'audio/wav')})
        else:
            resp = client.request(req.method, path, headers=headers, content=req.post_data_buffer or None)
        out_headers = dict(resp.headers)
        out_headers['access-control-allow-origin'] = '*'
        route.fulfill(status=resp.status_code, headers=out_headers, body=resp.content)
    except Exception as exc:
        route.abort('failed')
        errors.append(f'proxy {req.method} {path}: {type(exc).__name__}: {exc}')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page.route('http://fidelis.local/**', proxy)
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    page.set_content(html, wait_until='load')
    page.wait_for_function("document.querySelector('#backendState')?.textContent.includes('BACKEND 0.3.0-prealpha')", timeout=20000)

    assert page.locator('.engine').count() >= 10
    assert page.locator('#backendState').inner_text().startswith('BACKEND 0.3.0-prealpha')
    assert page.locator('.capability-blocked').count() >= 1  # Demucs in this sandbox.
    assert page.locator('.engine', has_text='Fidelis Physical Violin').count() == 1
    assert page.locator('.engine', has_text='Instrudio Studio Violin (native backend adapter)').count() == 1
    assert not page.locator('#demucsImportBtn').is_disabled()
    assert page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')

    # Isolated-stem path: real multipart upload -> analysis -> Jev -> render -> QC -> reassembly.
    page.locator('#audioFile').set_input_files(str(FIXTURE))
    page.wait_for_function("document.querySelector('#waveState')?.textContent === 'SOURCE LOCKED'", timeout=30000)
    page.wait_for_function("document.querySelector('#projectParts')?.textContent === '1'", timeout=10000)
    assert page.locator('#analyzeBtn').inner_text() == 'ANALYZE SELECTED PART'
    page.locator('#analyzeBtn').click()
    page.wait_for_function("document.querySelectorAll('.route-card').length === 3", timeout=90000)
    assert page.locator('#routeState').inner_text().startswith('ARMED:')
    assert page.locator('[data-route-select="physical"]').count() == 1
    page.locator('[data-route-select="physical"]').click()
    page.wait_for_function("document.querySelector('#renderState')?.textContent.includes('ARMED')", timeout=20000)
    assert 'instrudio-native' in page.locator('#renderPlan').inner_text()
    assert not page.locator('#renderCandidateBtn').is_disabled()
    page.locator('#renderCandidateBtn').click()
    page.wait_for_function("document.querySelector('#compareState')?.textContent === 'A/B READY'", timeout=90000)
    assert not page.locator('#reassembleBtn').is_disabled()
    assert '/api/artifacts/' in (page.locator('#candidateAudio').get_attribute('src') or '')
    page.locator('#reassembleBtn').click()
    page.wait_for_function("document.querySelector('#masterState')?.textContent.startsWith('MASTER:')", timeout=90000)
    assert not page.locator('#downloadMasterBtn').is_disabled()
    assert page.locator('#projectReassembly').inner_text() == 'CANDIDATE'
    page.screenshot(path=str(ROOT / 'backend-authority-step5.png'), full_page=True)

    # Mobile rendering of the same authoritative state.
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(250)
    assert page.evaluate('document.documentElement.scrollWidth === document.documentElement.clientWidth')
    page.screenshot(path=str(ROOT / 'backend-authority-mobile.png'), full_page=True)

    # Full-mix truth gate: Demucs blocked => zero fabricated parts.
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#instrumentType').select_option('unknown')
    page.locator('#audioFile').set_input_files([])
    page.locator('#audioFile').set_input_files(str(FIXTURE))
    page.wait_for_function("document.querySelector('#waveState')?.textContent === 'SOURCE LOCKED'", timeout=30000)
    page.wait_for_function("document.querySelector('#projectSource')?.textContent === 'FULL MIX'", timeout=10000)
    assert page.locator('#projectParts').inner_text() == '0'
    assert page.locator('#analyzeBtn').inner_text() == 'DECOMPILE FULL MIX'
    page.locator('#analyzeBtn').click()
    page.wait_for_function("document.querySelector('#routeState')?.textContent === 'SOURCE DECOMP BLOCKED'", timeout=30000)
    assert page.locator('#projectParts').inner_text() == '0'
    assert page.locator('.engine', has_text='Fidelis Physical Violin').count() == 1
    assert page.locator('.engine', has_text='Instrudio Studio Violin (native backend adapter)').count() == 1
    page.screenshot(path=str(ROOT / 'backend-authority-fullmix-blocked.png'), full_page=True)

    browser.close()

client.close()
assert not errors, f'page/proxy errors: {errors}'
assert not console_errors, f'console errors: {console_errors}'
print('FIDELIS BACKEND-AUTHORITY UI GATE: PASS')
