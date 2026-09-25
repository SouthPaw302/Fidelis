from __future__ import annotations

from typing import Any


def judge_routes(*, instrument: str, performance: dict[str, Any] | None, capabilities: dict[str, dict[str, Any]]) -> dict[str, Any]:
    note_count = len((performance or {}).get('performance') or [])
    voiced_ratio = float(((performance or {}).get('analysis') or {}).get('voicedRatio') or 0)

    routes = [
        {
            'id': 'physical',
            'label': 'Performance → physical renderer',
            'stack': ['fidelis-native-performance', 'stradi', 'basic-pitch', 'instrudio-native', 'instrudio', 'fidelis-physical-violin'],
            'score': 12 if instrument in {'fiddle', 'violin', 'strings'} else 5,
            'reason': 'Rebuild a new waveform from recovered performance and a physical/sample renderer.',
        },
        {
            'id': 'ddsp',
            'label': 'Structured DDSP reconstruction',
            'stack': ['ddsp'],
            'score': 9 + (2 if voiced_ratio > .2 else 0),
            'reason': 'Preserve continuous pitch/dynamics while replacing the source timbre through structured synthesis.',
        },
        {
            'id': 'direct',
            'label': 'Direct timbre transfer',
            'stack': ['rave', 'brave', 'sony-diffusion', 'wavetransfer'],
            'score': 8 if instrument in {'guitar', 'piano', 'drums', 'unknown'} else 7,
            'reason': 'Preserve source phrasing directly with the least symbolic interpretation.',
        },
    ]
    if note_count >= 3:
        routes[0]['score'] += 2
        routes[1]['score'] += 1

    for route in routes:
        statuses = [(capabilities.get(adapter) or {}).get('status', 'unavailable') for adapter in route['stack']]
        route['adapterStatuses'] = dict(zip(route['stack'], statuses))
        # A route is executable if at least one direct-transfer engine is ready, or all mandatory structured components are ready.
        if route['id'] == 'direct':
            route['executable'] = any(status == 'ready' for status in statuses)
        elif route['id'] == 'physical':
            transcriber_ready = any((capabilities.get(x) or {}).get('status') == 'ready' for x in ('stradi', 'basic-pitch', 'fidelis-native-performance'))
            violin_class = instrument in {'fiddle', 'violin', 'strings'}
            renderer_ready = violin_class and any((capabilities.get(x) or {}).get('status') == 'ready' for x in ('instrudio-native', 'instrudio', 'fidelis-physical-violin'))
            route['executable'] = transcriber_ready and renderer_ready
        else:
            route['executable'] = all(status == 'ready' for status in statuses)

    routes.sort(key=lambda item: item['score'], reverse=True)
    for i, route in enumerate(routes, 1):
        route['rank'] = i

    executable = [route for route in routes if route['executable']]
    fallback = {
        'id': 'reference',
        'label': 'Fidelis reference renderer',
        'adapterId': 'fidelis-reference-synth',
        'executable': (capabilities.get('fidelis-reference-synth') or {}).get('status') == 'ready',
        'reason': 'Pipeline-validation fallback only; it does not represent the target fidelity path.',
    }
    return {
        'schema': 'fidelis.jev-route-decision.v0.1',
        'instrument': instrument,
        'desiredRoutes': routes,
        'preferredRouteId': routes[0]['id'] if routes else None,
        'executableRouteId': executable[0]['id'] if executable else ('reference' if fallback['executable'] else None),
        'fallback': fallback,
    }
