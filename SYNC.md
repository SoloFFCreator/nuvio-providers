# Source-of-truth and deployment synchronization

The canonical stream resolver source is this repository's `template` branch under `stream-api/`.

Every push to `template` runs `.github/workflows/stream-api.yml`, which installs dependencies, type-checks, runs the full Vitest suite, and builds the service. After those checks pass, the workflow can trigger the Render deployment when the repository secret `RENDER_DEPLOY_HOOK_URL` is configured.

To enable automatic Render updates, copy the Render service's Deploy Hook URL into the GitHub Actions repository secret named exactly:

```text
RENDER_DEPLOY_HOOK_URL
```

Never commit the hook URL to source code. When the secret is absent, CI remains safe but the deployment step intentionally skips.
