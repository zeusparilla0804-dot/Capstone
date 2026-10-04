# LA Chef Release Candidate

## Release

- Identifier: `v1.0.0-rc.1`
- Status: release commit verified locally; not tagged, pushed, or deployed; not ready for production deployment
- Runtime: Angular 22 frontend, Node.js/Express backend, Microsoft SQL Server 2022

## Included

- Customer catering, ordering, booking, payment, and account flows
- Administrative operations and reporting interfaces
- Intended tracked schema migrations `001`-`006`, `008`, and `009`
- Container, reverse-proxy, CI, backup, restore, and smoke-test templates

## Validation

Run `npm run build` and `npm test` in both application directories. Run backend SQL E2E and frontend browser E2E against an isolated, pre-baselined SQL Server database. Apply migrations in numeric order before starting the application.

Verification completed on 2026-10-04 from an exported, credential-free candidate snapshot:

- Clean dependency installation: backend `175` packages and frontend `331` packages installed with `npm ci` under Node.js `22.22.3`.
- Backend: 175 tests executed, 173 passed, 2 expected platform-specific skips; production build passed.
- SQL E2E: Phase 8.1 and Admin Operations workflows passed with fixture cleanup.
- Frontend: 52 Angular tests passed; production build passed under Node.js `22.22.3`.
- Browser E2E: 5 Playwright tests passed, including `390`, `768`, `1024`, and `1440` pixel checks.
- Production dependency audits: 0 known vulnerabilities in both applications.
- Candidate secret scan: no production credential signatures; no populated environment file included.
- Candidate business-data scan: no provisional catalog fixture or production mock/seed insertion included.

## Configuration

Copy the appropriate committed `.env.*.example` file to a secret-managed runtime environment. Never commit populated `.env` files. Production and staging credentials must be supplied by the deployment platform.

## Known Constraints

- The frontend requires Node.js `22.22.3` or newer.
- Schema migrations `001`-`006`, `008`, and `009` upgrade the existing LA Chef schema; an empty-database baseline is not yet tracked.
- Any change after the verified release commit requires the complete release matrix to be rerun before tagging.
- Local `backend/fixtures/starter-catalog.provisional.sql` contains provisional business data and is excluded pending client approval.
- Payments are manual and proof-based; no live card or GCash gateway is included.
- Payment-proof storage must be durable and backed up with its matching SQL metadata.
- Container execution requires Docker and must be validated on a Docker-capable host.
- No production deployment is part of this release preparation.
