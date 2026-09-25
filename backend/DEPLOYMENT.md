# Deployment topology

Fidelis is independent of where models execute.

## Recommended topology

```text
Vercel / Netlify static deck
        |
        | HTTPS
        v
Fidelis FastAPI control plane
        |
   +----+----------------------------+
   |                                 |
native CPU adapters            GPU/model workers
performance / physical         Demucs / RAVE / BRAVE /
violin / QC / reassembly       DDSP / STRAdi / etc.
```

The web host does not define the model runtime.

## Static deck deployment

The repository includes:

- `scripts/build_frontend.py`
- `vercel.json`
- `netlify.toml`

Both publish only `dist/`, generated from the exact tested frontend sources. This avoids publishing backend source, SQLite files, audio artifacts or model weights as static files.

Point the deck at a separate API either with:

```text
https://your-deck.example/?api=https://your-fidelis-api.example
```

or before application boot:

```js
window.FIDELIS_CONFIG = { apiBaseUrl: 'https://your-fidelis-api.example' };
```

The query value is saved in browser local storage for later sessions.

## FastAPI deployment

Run a persistent/container backend when you want local CPU adapters, durable project state or managed model files:

```bash
PYTHONPATH=backend uvicorn fidelis_backend.api:app --host 0.0.0.0 --port 8787
```

The backend currently uses SQLite + filesystem artifacts. Production should put the runtime directory on durable storage or replace the storage seam with a durable DB/object store.

`api/index.py` remains a FastAPI entrypoint for environments that support Python functions, but long audio jobs, model binaries and local SQLite/filesystem state should not be assumed durable in a serverless function.

## Full-mix decomposition

Two supported modes:

1. **Managed local HTDemucs** — import the verified checkpoint through the Engine Bay or `POST /api/models/demucs/checkpoint`.
2. **Remote Demucs worker** — set `FIDELIS_DEMUCS_URL` to a worker-protocol execute endpoint.

Remote is the preferred topology when the control plane is lightweight/serverless.

## Specialized engines

Configure any combination of remote workers through the environment variables documented in `ENVIRONMENT.md`. Jev sees their actual capability state and can select them without changing core project logic.

## Security before public deployment

- set `FIDELIS_API_TOKEN`;
- restrict CORS instead of `*`;
- use TLS between deck/API/workers;
- use signed/private artifact access;
- protect model-import endpoints;
- put DB/artifacts on durable storage;
- add quotas/job isolation before multi-user exposure.
