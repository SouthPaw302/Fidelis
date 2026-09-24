# Deployment

## Static control surface (v0.1)

Fidelis v0.1 has no build step and no required backend. This intentionally makes the control surface portable.

### Vercel

Import the repository and deploy the root directory. `vercel.json` supplies basic headers.

### Netlify

Import the repository. `netlify.toml` publishes `.` directly.

## Heavy workers (next milestone)

Timbre-transfer and physical/sampled rendering workers should not be forced into the static host. Use a provider-neutral job contract:

```text
POST /jobs
  source artifact
  adapter id
  performance document
  options

GET /jobs/:id
  queued | running | complete | failed
  artifacts[]
  metrics
  logs
```

Workers may live on:

- GPU container platform;
- CPU container;
- a private/local worker reachable through a secure broker;
- a provider-specific serverless runtime when model size/runtime fits;
- browser WebGPU/WASM when practical.

The Vercel/Netlify app remains the user-facing product regardless of worker location.

## DeepSeek Harness

`src/orchestrator/deepseek.js` defines a simple HTTP planning adapter. Do not embed credentials in the static client. Production deployments should proxy authenticated harness calls through a server-side endpoint or worker.

## Storage

Keep large audio artifacts in object storage rather than Git. A job manifest should reference immutable source and output artifacts plus checksums.
