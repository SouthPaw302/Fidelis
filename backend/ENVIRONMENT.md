# Backend environment

## Core

- `FIDELIS_RUNTIME` — SQLite/artifact runtime directory.
- `FIDELIS_API_TOKEN` — optional Bearer token required by REST API.

## Demucs

- `FIDELIS_DEMUCS_MODEL` — default `htdemucs`.
- `FIDELIS_DEMUCS_DEVICE` — default `cpu`.
- `FIDELIS_DEMUCS_ALLOW_DOWNLOAD=1` — allow Demucs to hydrate weights. Default is off so a sandbox cannot silently download models.
- `FIDELIS_DEMUCS_URL` — optional remote Demucs/source-separation worker. When configured, it overrides the blocked local preflight.

## DeepSeek Harness

- `FIDELIS_HARNESS_URL` — optional external planning endpoint.
- `FIDELIS_HARNESS_TOKEN` — optional bearer token.

Without an endpoint, the backend uses a deterministic planning fallback while the MCP bridge remains available to an external Harness process.

## External model workers

Exact Fidelis worker-protocol endpoints:

- `FIDELIS_DEMUCS_URL`
- `FIDELIS_BASIC_PITCH_URL`
- `FIDELIS_STRADI_URL`
- `FIDELIS_DDSP_URL`
- `FIDELIS_RAVE_URL`
- `FIDELIS_BRAVE_URL`
- `FIDELIS_SONY_DTT_URL`
- `FIDELIS_WAVETRANSFER_URL`
- `FIDELIS_INSTRUDIO_URL`

Optional source-tree discovery (informational / experimental until an adapter is validated):

- `FIDELIS_STRADI_PATH`
- `FIDELIS_RAVE_PATH`
- `FIDELIS_BRAVE_PATH`
- `FIDELIS_SONY_DTT_PATH`
- `FIDELIS_WAVETRANSFER_PATH`
- `FIDELIS_INSTRUDIO_PATH`
