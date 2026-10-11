# LA Chef Release Candidate

## Release

- Identifier: `v1.0.0-rc.1`
- Status: release commit verified locally; not tagged, pushed, or deployed; not ready for production deployment
- Runtime: Angular 22 frontend, Node.js/Express backend, Microsoft SQL Server 2022

## Included

- Customer catering, ordering, booking, payment, and account flows
- Customer and administrator password recovery with protected email delivery and all-session revocation
- Administrative operations and reporting interfaces
- Tracked empty-database schema migrations `000`-`006` and `008`-`011`
- Container, reverse-proxy, CI, backup, restore, and smoke-test templates

## Validation

Run `npm run build` and `npm test` in both application directories. Run `npm run db:verify:fresh` with a dedicated non-production provisioner, then run frontend browser E2E against the isolated integration environment. Apply migrations in filename order before starting the application.

Fresh-database verification includes migrations `000`-`006` and `008`-`011`, an idempotent second migration pass, all backend SQL E2E journeys, baseline rerun checks, disposable-database cleanup, and the five approved system event-type reference rows only.

Verification completed on 2026-10-11 from the isolated password-recovery worktree under Node.js `22.22.3`:

- Backend: 266 tests executed, 264 passed, 2 expected Windows permission skips; production build passed.
- SQL E2E: Phase 8.1, Admin Operations, and Password Recovery journeys passed with fixture cleanup.
- Fresh database: migrations `000`-`006` and `008`-`011` applied twice, schema/data contracts and all three SQL journeys passed, and the disposable database was removed.
- Frontend: 89 Angular tests passed; production build passed with only the pre-existing booking stylesheet budget warning.
- Browser E2E: 9 Playwright tests passed, including recovery and operational checks at `390`, `768`, `1024`, and `1440` pixels.
- Candidate scan: no complete reset token or populated recovery secret is tracked; documented environment values are placeholders only.
- No dependency version changed in this feature. The previous clean-install and production dependency-audit evidence remains applicable to the unchanged lockfiles.

## Configuration

Copy the appropriate committed `.env.*.example` file to a secret-managed runtime environment. Never commit populated `.env` files. Production and staging credentials must be supplied by the deployment platform.

## Known Constraints

- The frontend requires Node.js `22.22.3` or newer.
- Any change after the verified release commit requires the complete release matrix to be rerun before tagging.
- Local `backend/fixtures/starter-catalog.provisional.sql` contains provisional business data and is excluded pending client approval.
- Payments are manual and proof-based; no live card or GCash gateway is included.
- Payment-proof storage must be durable and backed up with its matching SQL metadata.
- Container execution requires Docker and must be validated on a Docker-capable host.
- No production deployment is part of this release preparation.
- Live SMTP delivery remains a staging gate; local tests prove outbox safety and rendering boundaries, not real mailbox receipt.
- Recovery rate limits are process-local and require a shared proxy/store before multi-instance API scaling.
