function resolveDefaultBase() {
  try {
    const query = new URLSearchParams(globalThis.location?.search || '');
    const queryBase = query.get('api');
    if (queryBase) {
      localStorage.setItem('fidelis.apiBaseUrl', queryBase);
      return queryBase;
    }
    return globalThis.FIDELIS_CONFIG?.apiBaseUrl || localStorage.getItem('fidelis.apiBaseUrl') || '';
  } catch {
    return globalThis.FIDELIS_CONFIG?.apiBaseUrl || '';
  }
}

const DEFAULT_BASE = resolveDefaultBase();

export class BackendError extends Error {
  constructor(message, { status = null, payload = null } = {}) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.payload = payload;
  }
}

export class FidelisBackend {
  constructor({ baseUrl = DEFAULT_BASE, token = '' } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
    this.token = token || '';
  }

  async health() { return this.#json('/api/health'); }
  async capabilities() { return this.#json('/api/capabilities'); }
  async models() { return this.#json('/api/models'); }
  async listProjects() { return this.#json('/api/projects'); }
  async getProject(projectId) { return this.#json(`/api/projects/${encodeURIComponent(projectId)}`); }
  async jobs(projectId) { return this.#json(`/api/projects/${encodeURIComponent(projectId)}/jobs`); }
  async artifacts(projectId) { return this.#json(`/api/projects/${encodeURIComponent(projectId)}/artifacts`); }
  async harnessContext(projectId) { return this.#json(`/api/projects/${encodeURIComponent(projectId)}/harness/context`); }

  async createProject(name, sourceKind = 'full_mix') {
    return this.#json('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, sourceKind }),
    });
  }

  async uploadSource(projectId, file, { sourceKind = 'full_mix', instrument = 'unknown' } = {}) {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('sourceKind', sourceKind);
    form.append('instrument', instrument);
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/source`, { method: 'POST', body: form });
  }

  async uploadStems(projectId, files) {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/stems`, { method: 'POST', body: form });
  }

  async installDemucsCheckpoint(file) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.#json('/api/models/demucs/checkpoint', { method: 'POST', body: form });
  }

  async decompose(projectId, { wait = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/decompose?wait=${wait ? 'true' : 'false'}`, { method: 'POST' });
  }

  async analyzePart(projectId, partId, { adapterId = 'fidelis-native-performance', wait = true } = {}) {
    const params = new URLSearchParams({ adapterId, wait: wait ? 'true' : 'false' });
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/parts/${encodeURIComponent(partId)}/analyze?${params}`, { method: 'POST' });
  }

  async routePart(projectId, partId, { desiredRouteId = null, allowFallback = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/parts/${encodeURIComponent(partId)}/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ desiredRouteId, allowFallback }),
    });
  }

  async renderPart(projectId, partId, { wait = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/parts/${encodeURIComponent(partId)}/render?wait=${wait ? 'true' : 'false'}`, { method: 'POST' });
  }

  async qcPart(projectId, partId, { wait = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/parts/${encodeURIComponent(partId)}/qc?wait=${wait ? 'true' : 'false'}`, { method: 'POST' });
  }

  async pipelinePart(projectId, partId, { desiredRouteId = null, allowFallback = true, runQc = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/parts/${encodeURIComponent(partId)}/pipeline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ desiredRouteId, allowFallback, runQc }),
    });
  }

  async autopilot(projectId, { allowFallback = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/autopilot?allowFallback=${allowFallback ? 'true' : 'false'}`, { method: 'POST' });
  }

  async reassemble(projectId, { wait = true } = {}) {
    return this.#json(`/api/projects/${encodeURIComponent(projectId)}/reassemble?wait=${wait ? 'true' : 'false'}`, { method: 'POST' });
  }

  artifactUrl(artifactId) {
    return `${this.baseUrl}/api/artifacts/${encodeURIComponent(artifactId)}/download`;
  }

  async artifactMeta(artifactId) {
    return this.#json(`/api/artifacts/${encodeURIComponent(artifactId)}`);
  }

  async #json(path, init = {}) {
    const headers = new Headers(init.headers || {});
    if (this.token) headers.set('authorization', `Bearer ${this.token}`);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { text } : null;
    }
    if (!response.ok) {
      const detail = payload?.detail || payload?.error || payload?.text || `${response.status} ${response.statusText}`;
      throw new BackendError(String(detail), { status: response.status, payload });
    }
    return payload;
  }
}
