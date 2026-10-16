# LA Chef Release Candidate

## Release

- Identifier: `v1.0.0-rc.1`
- Status: verified local release commit and tag created; not pushed or deployed; not ready for production deployment
- Runtime: Angular 22 frontend, Node.js/Express backend, Microsoft SQL Server 2022

## Included

- Customer package discovery, reservation, billing, payment-proof, and account flows
- Customer and administrator password recovery, confirmed logout, administrator all-device logout, and scheduled expired-session cleanup
- Reservation, customer, billing, and package/menu administration interfaces
- Customer account activation/deactivation with transactional session revocation and preserved business history
- Administrator reservation/payment reports with responsive views, CSV export, and print output
- Configurable public Messenger contact action hidden from administrator routes
- Tracked empty-database schema migrations `000`-`006` and `008`-`015`
- Container, reverse-proxy, CI, backup, restore, and smoke-test templates

## Validation

Run `npm run build` and `npm test` in both application directories. Run `npm run db:verify:fresh` with a dedicated non-production provisioner, then run frontend browser E2E against the isolated integration environment. Apply migrations in filename order before starting the application.

Fresh-database verification includes migrations `000`-`006` and `008`-`015`, an idempotent second migration pass, all four configured backend SQL E2E journeys, forward-compatible baseline rerun checks, disposable-database cleanup, and the five approved system event-type reference rows only.

Migration `015_customer_account_status.sql` is covered by idempotency/schema-contract tests, the local integration suite, and the clean-room disposable-database rehearsal completed on 2026-10-16.

Batch 1 scope-alignment verification completed on 2026-10-15 under Node.js `22.22.3`:

- Backend: 348 tests executed, 346 passed, 2 expected Windows permission skips; production build passed.
- SQL E2E: Phase 8.1, Admin Operations, Password Recovery, and Session Security journeys passed with fixture cleanup.
- Fresh database: migrations `000`-`006` and `008`-`014` applied in order, the migration runner completed a second idempotent pass, schema/data contracts and all five SQL journeys passed, the baseline rerun preserved business-row counts, and the disposable database was removed.
- Frontend: 154 Angular tests passed; production build passed with only the pre-existing booking stylesheet budget warning.
- Browser E2E: 16 Playwright tests passed, including recovery, logout controls, package-to-reservation navigation, the exact 50% deposit calculation, supported manual payment choices, retired quotation-entry redirect, focused customer/admin navigation, and responsive checks at `390`, `768`, `1024`, and `1440` pixels.
- Candidate scan: no complete reset token or populated recovery secret is tracked; documented environment values are placeholders only.
- No dependency version changed in this feature. The previous clean-install and production dependency-audit evidence remains applicable to the unchanged lockfiles.
- The 2026-10-13 fresh-database run used the configured local SQL provisioner only through process-scoped `VERIFY_DB_*` values. No credential or disposable confirmation was written to a tracked environment file.

Batch 2 approved-scope verification completed on 2026-10-16 under Node.js `22.22.3`:

- Backend: production TypeScript build passed; 369 tests executed, 367 passed, and 2 expected Windows permission tests skipped.
- SQL E2E: Phase 8.1, Admin Operations (including customer lifecycle and reports), Password Recovery, and Session Security journeys passed with fixture cleanup.
- Frontend: production build passed; all 178 Angular tests passed. The existing booking stylesheet remains 992 bytes over its component budget.
- Browser E2E: all 18 Playwright tests passed, including protected reports, filters, CSV downloads, Messenger route visibility, and responsive assertions at `390`, `768`, `1024`, and `1440` pixels.
- Responsive screenshots for reports and Messenger were inspected in Chromium. Physical-phone, Firefox, WebKit, screen-reader, and 200% zoom checks remain deployment QA gates.
- Scoped secret and product-scope scans returned no findings. The Messenger URL is intentional public configuration, not a credential.
- Fresh database: migrations `000`-`006` and `008`-`015` applied in order on a generated allow-listed database, the migration runner completed a second idempotent pass, schema/data contracts and all four configured SQL journeys passed, the baseline rerun preserved business-row counts, and the disposable database was removed.

## Configuration

Copy the appropriate committed `.env.*.example` file to a secret-managed runtime environment. Never commit populated `.env` files. Production and staging credentials must be supplied by the deployment platform.

## Known Constraints

- The frontend requires Node.js `22.22.3` or newer.
- Any change after this verified working tree requires the complete release matrix to be rerun before creating the release commit or tag.
- Client catalog data is applied separately through the default-safe `db:catalog:sync` command; migrations remain free of package, add-on, account, and transaction seed data.
- Payments are manual and proof-based; no live card or GCash gateway is included.
- A standard reservation requires cumulative verified payments equal to 50% of its server-authoritative total before it can enter `PAYMENT_VERIFIED`. One cent below the threshold remains `AWAITING_PAYMENT`.
- New custom-quotation creation is retired: authenticated `POST /api/custom-events` returns `410 CUSTOM_QUOTATION_RETIRED`, and `/custom-event` redirects to package selection. Existing quotation records, migrations, and authenticated history routes remain unchanged pending Batch 4 classification.
- Payment-proof storage must be durable and backed up with its matching SQL metadata.
- Container execution requires Docker and must be validated on a Docker-capable host.
- No production deployment is part of this release preparation.
- Live SMTP delivery remains a staging gate; local tests prove outbox safety and rendering boundaries, not real mailbox receipt.
- Recovery rate limits are process-local and require a shared proxy/store before multi-instance API scaling.

## Remaining Product Batches

- Batch 3: registration and upcoming-event notifications plus live SMTP staging verification.
- Batch 4: classify retained quotation data/code, obtain explicit approval before any destructive retirement, and repeat release verification.
