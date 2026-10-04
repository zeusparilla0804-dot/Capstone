# LA Chef Release File Inventory

Date: 2026-10-04
Candidate: `v1.0.0-rc.1`

This inventory covers every modified or previously untracked path reviewed for the release candidate. Paths are grouped by release treatment so local tooling, credentials, generated files, and unapproved business data cannot enter the release commit.

## Commit: Required Application Source

- Backend manifests and configuration: `backend/package.json`, `backend/package-lock.json`, `backend/tsconfig.json`, and safe `backend/.env*.example` templates.
- Backend implementation and tests: all candidate files under `backend/src/` and `backend/e2e/`.
- Frontend manifests and configuration: `frontend/package.json`, `frontend/package-lock.json`, Angular/TypeScript/Prettier/editor configuration, `frontend/playwright.config.ts`, and `frontend/public/favicon.ico`.
- Frontend implementation and tests: all candidate files under `frontend/src/` and `frontend/e2e/`.
- Required visual assets: `frontend/src/assets/brand/` and `frontend/src/assets/images/`.
- Repository hygiene: `.gitignore`, `.gitattributes`, and `frontend/.gitignore`.

## Commit: Required Migrations

Apply in filename order:

1. `backend/migrations/001_phase5_data_layer.sql`
2. `backend/migrations/002_phase6_admin.sql`
3. `backend/migrations/003_phase7_invoices.sql`
4. `backend/migrations/004_phase8_production_hardening.sql`
5. `backend/migrations/005_phase81_admin_audit.sql`
6. `backend/migrations/006_phase81_system_event_types.sql`
7. `backend/migrations/008_admin_operations_core.sql`
8. `backend/migrations/009_release_rejected_proof_references.sql`

These are upgrade migrations. They do not replace the missing approved empty-database baseline.

## Commit: Required Deployment Configuration

- `.github/workflows/ci.yml`
- `backend/.dockerignore`
- `backend/Dockerfile`
- `frontend/.dockerignore`
- `frontend/Dockerfile`
- `frontend/deploy/nginx.conf`
- `docker-compose.staging.yml`
- `operations/sql-server/backup.sql`
- `operations/sql-server/restore-verification.sql`
- `scripts/staging-smoke.mjs`

## Commit: Documentation

- `README.md`
- `frontend/README.md`
- `docs/CLIENT_CATALOG_REFERENCE.md`
- `docs/DEPLOYMENT.md`
- `docs/PRODUCTION_READINESS_AUDIT.md`
- `docs/RELEASE.md`
- `docs/RELEASE_FILE_INVENTORY.md`
- `docs/RESPONSIVE_QA.md`
- `docs/SYSTEM_REQUIREMENTS_GUIDE.md`
- `docs/superpowers/specs/2026-10-01-admin-operations-core-design.md`
- `docs/superpowers/plans/2026-10-01-admin-operations-core.md`

## Remain Untracked: Generated Artifacts

- `backend/node_modules/`, `frontend/node_modules/`
- `backend/dist/`, `frontend/dist/`
- `frontend/.angular/`, `frontend/test-results/`, `frontend/playwright-report/`
- `*.log`, coverage output, caches, and temporary test output
- Runtime proof files under `backend/data/payment-proofs/` and `backend/var/uploads/`

These paths are ignored and reproducible or runtime-generated. They are not release inputs.

## Remain Untracked: Secret Or Local-Only Files

- `backend/.env` and any populated `.env.*` files
- `.agents/`, `.superpowers/`, and `skills-lock.json`
- `.vscode/` directories, including local MCP/editor configuration

A populated local `backend/.env` exists and is ignored. Its values were not copied into the candidate snapshot or documentation.

## Remain Untracked: Temporary Or Unapproved Files

- `backend/audit-db.mjs`
- `backend/audit-http.mjs`
- `backend/fixtures/starter-catalog.provisional.sql`
- `.release-candidate.index*`
- `.release-snapshot/`

The provisional catalog fixture is intentionally excluded until LA Chef approves the package names, inclusions, prices, and availability.

## Candidate Scan Result

- No real `.env` file is present in the candidate snapshot.
- No private-key, common cloud-token, GitHub-token, Slack-token, Google-key, or live Stripe-key signature was detected.
- The only credential-like literals are the matching disposable `Browser-QA-2026!` E2E fixture passwords in backend and frontend test files.
- No production mock/seed catalog insertion or provisional catalog fixture is present.
- The candidate contains 284 files before this inventory document and excludes all listed local-tooling categories.
