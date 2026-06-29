# CI/CD

EasyLaw uses GitHub Actions for continuous integration. The current pipeline is intentionally conservative for Beta: it validates formatting/lint rules, unit tests, a production build, and a browser smoke test before merge.

## Workflow

The workflow lives at `.github/workflows/ci.yml` and runs on pull requests and pushes to `main`.

Steps:

1. Install Node dependencies with `npm ci`.
2. Install Playwright Chromium.
3. Run `npm run lint`.
4. Run `npm test`.
5. Run `npm run build`.
6. Run `npm run test:browser`.

## Deployment Direction

The target deployment model is VPS/container with a persistent volume mounted for SQLite. Production should set:

- `EASYLAW_DATABASE_PATH`
- `EASYLAW_ENCRYPTION_KEY`
- `RESEND_API_KEY`

The pipeline currently stops at CI. Deployment can be added as a separate job once the target VPS/container registry is chosen.
