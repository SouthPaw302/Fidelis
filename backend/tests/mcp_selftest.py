from __future__ import annotations
import json, os, subprocess, sys, tempfile

runtime = tempfile.mkdtemp(prefix='fidelis-mcp-')
env = dict(os.environ, FIDELIS_RUNTIME=runtime, PYTHONPATH=os.path.abspath('backend'))
requests = [
    {'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'selftest','version':'1'}}},
    {'jsonrpc':'2.0','method':'notifications/initialized','params':{}},
    {'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}},
    {'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'harness__status','arguments':{}}},
]
proc=subprocess.run([sys.executable,'-m','fidelis_backend.mcp_server'], input='\n'.join(json.dumps(x) for x in requests)+'\n', text=True, capture_output=True, env=env, timeout=30)
if proc.returncode: raise SystemExit(proc.stderr or proc.stdout)
rows=[json.loads(x) for x in proc.stdout.splitlines() if x.strip()]
by={x.get('id'):x for x in rows if x.get('id') is not None}
assert by[1]['result']['serverInfo']['name']=='fidelis'
names={x['name'] for x in by[2]['result']['tools']}
for required in {'harness__status','harness__context','harness__plan','project__get','part__route','project__autopilot'}: assert required in names
assert by[3]['result']['isError'] is False
print('FIDELIS MCP SELFTEST: PASS', len(names), 'tools')
