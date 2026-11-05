# LA Chef Release Candidate

## Release

- Baseline identifier: `v1.0.0-rc.1` at local commit `218a72f`
- Status: post-tag hardening is verified in the working tree and requires a new release commit/tag; nothing is pushed or deployed; not ready for production deployment
- Runtime: Angular 22 frontend, Node.js/Express backend, Microsoft SQL Server 2022

## Included

- Customer package discovery, reservation, billing, payment-proof, and account flows
- Customer and administrator password recovery, confirmed logout, administrator all-device logout, and scheduled expired-session cleanup
- Reservation, customer, billing, and package/menu administration interfaces
- Customer account activation/deactivation with transactional session revocation and preserved business history
- Administrator reservation/payment reports with responsive views, CSV export, and print output
- Configurable public Messenger contact action hidden from administrator routes
- Responsive About and Contact pages using confirmed LA Chef business and contact details
- Tracked empty-database schema migrations `000`-`006` and `008`-`015`
- Hardened Nginx headers/caching plus guarded least-privilege provisioning, read-only runtime permission verification, backup, restore, CI, and smoke-test templates

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

Post-tag deployment and public-content hardening verification completed on 2026-10-17 under Node.js `22.22.3`:

- Backend: production TypeScript build passed; 369 tests executed, 367 passed, and 2 expected Windows permission tests skipped.
- Frontend: production build passed without component-style budget warnings; all 182 Angular tests passed.
- Browser E2E: all 19 Playwright tests passed, including About/Contact responsive content, the Contact-page Messenger overlap regression, package discovery, booking confirmation, and the full customer/admin operation journeys.
- Visual QA: About, Contact, and booking-success captures were inspected at `390` and `1440` pixels; the duplicate floating Messenger action is suppressed on the dedicated Contact route and the booking-success actions remain aligned without horizontal overflow.
- Staging smoke checks require JSON API contracts in addition to HTTP status codes, preventing an Angular/Nginx SPA fallback page from being mistaken for a healthy backend. The regression test and the complete same-origin smoke run pass through the local Docker/Nginx stack at `http://127.0.0.1:8080`; a real HTTPS-edge run remains required.
- Docker validation: frontend and backend images build, both containers become healthy, `nginx -t` passes, the API connects to SQL Server, the backend runs as the non-root `node` user, and the private proof volume is writable. Live responses include the expected security headers, no-store app-shell policy, immutable hashed-asset caching, JSON API content type, and dotfile denial.
- Production dependency audits report zero known vulnerabilities after updating `mssql` to `12.7.9` and its transitive `tedious` driver to `20.3.7`. The isolated SQL/proof-storage restore and public HTTPS-edge checks remain staging gates.

Batch 4 non-destructive quotation retirement verification completed on 2026-10-18 under Node.js `22.22.3`:

- Backend: production TypeScript build passed; 356 tests executed, 354 passed, and 2 expected Windows permission tests skipped.
- Frontend: production build passed without budget warnings; all 178 Angular tests passed across 42 files.
- Browser E2E: all 19 Playwright journeys passed, including the retired quotation entry redirect, package-to-reservation flow, manual billing/proof review, administrator operations, and release-width responsive checks.
- Every authenticated legacy customer and administrator quotation endpoint returns `410 CUSTOM_QUOTATION_RETIRED`; `/custom-event` still redirects to package selection, while quotation detail and administration workspaces are no longer bundled.
- Queued legacy quotation email messages fail closed with `CUSTOM_QUOTATION_RETIRED` and cannot deliver links to removed pages.
- Migration `013`, schema-contract checks, and historical quotation rows remain intact. No destructive database operation was introduced.

## Configuration

Copy the appropriate committed `.env.*.example` file to a secret-managed runtime environment. Never commit populated `.env` files. Production and staging credentials must be supplied by the deployment platform.

## Known Constraints

- The frontend requires Node.js `22.22.3` or newer.
- Any change after this verified working tree requires the complete release matrix to be rerun before creating the release commit or tag.
- Client catalog data is applied separately through the default-safe `db:catalog:sync` command; migrations remain free of package, add-on, account, and transaction seed data.
- Payments are manual and proof-based; no live card or GCash gateway is included.
- A standard reservation requires cumulative verified payments equal to 50% of its server-authoritative total before it can enter `PAYMENT_VERIFIED`. One cent below the threshold remains `AWAITING_PAYMENT`.
- The custom-quotation runtime is retired: authenticated legacy customer and administrator endpoints return `410 CUSTOM_QUOTATION_RETIRED`, and `/custom-event` redirects to package selection. Historical quotation records and migration/schema compatibility remain intact, but no quotation workspace or command endpoint remains active.
- Payment-proof storage must be durable and backed up with its matching SQL metadata.
- Local container execution is verified with Docker Desktop/WSL2; each deployment host must still repeat image, health, header, and smoke validation in its own environment.
- The local `v1.0.0-rc.1` tag predates the 2026-10-17 hardening changes and must not be published as though it contains them.
- No production deployment is part of this release preparation.
- Live SMTP delivery remains a staging gate; local tests prove outbox safety and rendering boundaries, not real mailbox receipt.
- Recovery rate limits are process-local and require a shared proxy/store before multi-instance API scaling.

## Remaining Product Batches

- Batch 3 application work is complete: registration confirmation intents and one upcoming-event reminder per confirmed booking are implemented and SQL-tested. Live SMTP staging verification remains open.
- Batch 4 application cleanup is complete through non-destructive runtime retirement. No database table or historical quotation row was deleted.
- Remaining work is operational: staging SMTP, least-privilege SQL proof, coordinated SQL/private-proof restore rehearsal, real HTTPS-edge validation, and final device/accessibility QA.
