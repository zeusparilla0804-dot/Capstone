# LA Chef Production Readiness Audit

Current working-tree evidence: [November 11 verification](READINESS_VERIFICATION_2026-11-11.md). This supersedes the historical test counts below; deployment gates remain subject to actual staging verification.

Latest application-flow verification: [November 1 flow hardening results](SYSTEM_FLOW_FIXES_2026-11-01.md). The older audit and deployment gates below are retained for context; use the linked report for current application test/build evidence.

Date: 2026-10-18
Release baseline: local `v1.0.0-rc.1`; current hardening changes are post-tag and require a new release commit/tag
Verdict: **NOT READY FOR PRODUCTION**

## Current Evidence

- Backend unit and route suites pass: 356 executed, 354 passed, and 2 expected platform-specific permission tests skipped on Windows. Coverage includes customer account status enforcement, reservation/payment reports and CSV safety, the exact 50% reservation-deposit boundary, cumulative proof/manual-payment credit, password recovery, session revocation and cleanup, upload validation, ownership boundaries, package pricing, retired quotation endpoints and queued-message handling, booking-state transactions, payment concurrency, outbox retries, and stream failure handling.
- Four active SQL-backed E2E journeys pass for session security, password recovery, registration/login, booking, invoices, proof rejection/resubmission, exact-threshold payment verification, final-slot capacity locking, status history, outbox records, and fixture cleanup.
- All 178 Angular tests pass across 42 files for customer maintenance, report APIs and workspace behavior, keyboard-operable report tabs, Messenger route/configuration safety, public About/Contact content, recovery APIs and screens, session-security controls, services, forms, approved-scope routing, package pricing and galleries, booking-success presentation, the 50% billing presentation, proof submission/review UI, and responsive customer/admin portals.
- All 19 Playwright tests pass, including About/Contact content and overflow, authenticated report filtering and CSV export, Messenger visibility boundaries, customer/admin recovery and logout controls, package-to-reservation navigation, exact 50% deposit math, supported manual payment labels, retired `/custom-event` redirect, keyboard operation, the admin-to-customer proof journey, and responsive checks at `390`, `768`, `1024`, and `1440` pixels.
- Backend and Angular production builds pass under Node.js `22.22.3`.
- Frontend and backend production dependency audits report zero known vulnerabilities after the backend SQL driver patch update.
- No real environment file, uploaded proof, build output, test screenshot, or obvious credential is intended for source control.
- Fresh disposable-database verification passed on 2026-10-16 through migrations `000`-`006` and `008`-`015`. The verifier applied migrations in order, confirmed an idempotent runner pass, validated the complete schema and empty business-data boundary, passed all four configured SQL-backed E2E journeys, preserved business-row counts through the forward-compatible baseline rerun, and removed the disposable database.
- Migration `015_customer_account_status.sql` is present, ordered, idempotent, and now covered by both the local integration suite and the clean-room disposable-database rehearsal.
- Static deployment-control checks pass for the Nginx security/caching directives and guarded SQL operations templates. Local Docker/WSL2 validation also passes: both images build, both containers become healthy, `nginx -t` succeeds, the API connects to SQL Server, the backend runs as a non-root user with writable private proof storage, and the JSON-contract smoke suite passes through the same-origin Nginx proxy at `http://127.0.0.1:8080`. Live local responses confirm the expected security/cache headers and dotfile denial. Validation through the real public HTTPS edge remains open.

## Critical

No unresolved Critical finding is currently recorded. This does not make the release production-ready while the High and Medium deployment gates below remain open.

## High

### H-03 Production least-privilege database access is not proven

- Location: deployment SQL principal and secret-store configuration; the guarded template is `operations/sql-server/least-privilege.sql`.
- Impact: an over-privileged API credential increases the effect of compromise.
- Current state: separate runtime/migration grants and a read-only effective-permission probe are scripted and regression-tested, but they have not been executed against the real staging principals.
- Required fix: apply the template in staging, run `operations/sql-server/verify-runtime-permissions.sql` as the runtime account, and record that the account has application data access but cannot alter schema, create databases, or manage logins.

### H-04 Recovery rehearsal for private proofs is incomplete

- Location: `PAYMENT_PROOF_UPLOAD_ROOT` and `dbo.PAYMENT_PROOF` recovery process.
- Impact: restoring only one side can create missing evidence or unreferenced sensitive files.
- Current state: guarded backup and full isolated-restore templates are present under `operations/sql-server`, including checksum and integrity checks. A tested preflight now pairs new SQL/proof destinations in an immutable, non-secret `PLANNED` manifest and refuses unsafe or existing paths, but no real proof-storage snapshot has been rehearsed with them.
- Required fix: perform and document a coordinated SQL plus proof-storage restore drill in staging.

## Medium

### M-04 Live SMTP delivery is unverified

- Location: optional outbox worker deployment configuration.
- Current behavior: with SMTP disabled, messages correctly remain `PENDING` and do not break business transactions.
- Required fix: configure staging SMTP, verify delivery/retry/failure monitoring, and obtain approved sender-domain settings before enabling production email.

## Low

No unresolved Low finding is currently recorded.

## Explicit Product Constraint

LA Chef does not process live online payments in this release. Cash, bank transfer, and e-wallet selections record the intended manual method; uploaded evidence requires administrator verification. The product must not claim instant GCash/card processing until a compliant provider, signed webhooks, idempotency, reconciliation, refunds, and dispute handling are implemented.

Standard reservation billing now requires 50% of the server-authoritative reservation total. Customer proof verification and administrator-recorded payments both use cumulative verified credits; an amount one cent below the required deposit remains `AWAITING_PAYMENT`, while the exact threshold can advance to `PAYMENT_VERIFIED`.

The approved client catalog is maintained by the tested `db:catalog:sync` command. It imports the six poster-based packages and 17 published add-ons without placing business data in schema migrations. Unknown guest limits remain `NULL` until the client confirms them.

## Resolved Since The Previous Audit

- C-01 is resolved: the fresh verifier creates an allow-listed disposable database, applies `000`-`006` and `008`-`015`, confirms a second idempotent migration-runner pass, validates the complete schema and empty business-data boundary, runs all configured backend SQL E2E journeys, rechecks the forward-compatible baseline, and removes the database.
- H-01 is resolved: customer and active-administrator recovery use separate public routes, generic request responses, dedicated rate limits, 15-minute single-use role-scoped links, protected email rendering, atomic password rotation, all-session revocation, and confirmation intent. SQL and browser E2E cover both account types; live SMTP remains open under M-04.
- H-02 is resolved for the client-approved booking rules: submission enforces the daily slot/capacity policy transactionally, medium events require explicit administrator confirmation, and concurrent final-slot tests permit exactly one success.
- Customer login no longer validates hidden registration fields; login also accepts existing shorter passwords while registration still requires 12 characters.
- Customer/admin session state persists correctly across protected navigation.
- Customer and admin session expiry now compares against the SQL Server UTC clock, matching application-issued UTC timestamps.
- M-03 is resolved: account-scoped session revocation remains enforced by the backend, the administrator UI exposes all-device revocation, the customer UI uses confirmed current-session logout, and expired customer/admin session rows are removed at startup and hourly without deleting account or business data.
- Package selection, category normalization, gallery navigation, booking statuses, billing routes, and customer history were aligned.
- Customer and administrator primary navigation now centers the approved reservation-and-billing scope. Customer navigation exposes Dashboard, My Reservations, Billing & Payments, Profile, and Logout; administrator navigation exposes Overview, Reservations, Customers, Billing & Payments, and Packages & Menu plus account actions.
- The custom-quotation runtime is retired non-destructively. All authenticated customer and administrator legacy quotation endpoints return `410 CUSTOM_QUOTATION_RETIRED`, the old `/custom-event` entry redirects to Packages, and the Angular quotation workspaces, services, models, and active backend command paths have been removed. Existing quotation tables, migration `013`, schema contracts, and stored historical rows remain intact.
- Customer proofs and administrator-recorded payments now share the same cumulative 50% deposit policy, and administrator proof review distinguishes the full outstanding balance from the amount still needed to secure the reservation.
- The provisional catalog fixture was retired. The controlled catalog sync is repeatable, defaults to dry-run, and requires an explicit apply plus cleanup flag before known sample entries are deactivated.
- Payment proofs are signature-validated, private, owner/admin authorized, and protected against cross-customer disclosure.
- Rejection/resubmission and atomic one-credit-only verification are implemented with history and audit records.
- Notification intent is transactionally queued even when SMTP is absent.
- Customer registration now queues its confirmation intent in the same transaction as account creation. Confirmed bookings queue one upcoming-event reminder during the Manila-calendar window from event day through three days before; repeat scheduler runs are duplicate-safe, and delivery is revalidated against booking date/status and active-customer status.
- Admin dashboard, booking detail, customer detail, payment review, outbox, and audit interfaces are implemented responsively.
- Private inline proof previews work across the local frontend/API ports with `same-site` resource policy.
- Manual payments now reject terminal bookings, supersede stale submitted proofs, and commit credit, invoice state, booking history, audit, and notification intent atomically.
- Invoice issuance now locks and revalidates the booking and commits invoice, audit, and notification intent together.
- Customer invoice authorization returns the same non-disclosing `404` for missing and other-customer invoice identifiers.
- Rejected and superseded proof references are archived by migration `009`, allowing a corrected submission to reuse the real transaction reference without permitting duplicate active/verified credits.
- Mobile admin navigation is inert while closed, contains focus while open, and restores focus on Escape; the proof viewer has keyboard-accessible bounded zoom controls.
- Playwright pins both backend and frontend test ports, preventing inherited local `PORT` values from redirecting either server.
- Legacy custom-quotation email template definitions remain readable for historical outbox records, but the worker now marks queued legacy quotation messages `FAILED` with `CUSTOM_QUOTATION_RETIRED` instead of sending links to removed pages.
- The foundational migration validation recognizes both its original package columns and the pricing model introduced by migration `012`, preserving baseline rerun verification after the complete migration chain.
- Administrators can edit customer contact details and activate or deactivate accounts without deleting reservation, invoice, payment, notification, or audit history. Inactive customer login/session lookup is rejected, and deactivation revokes that customer's sessions transactionally.
- Administrator reservation and payment reports are available behind `adminGuard`, with strict date/filter validation, non-duplicated billing totals, responsive table/record views, safe CSV export, and print styling.
- The client-approved Messenger destination is configured as a public HTTPS value and mounted once at the application root. It is available on public/customer routes, hidden throughout `/admin/*`, and uses safe external-link attributes.
- M-01 placeholder content is resolved: `/about` and `/contact` now present the approved business name, Santa Rosa service base, address, phone channels, Messenger action, and reservation paths in responsive layouts.
- M-02 repository configuration is resolved: Nginx now emits CSP, frame, MIME, referrer, permissions, and cross-origin headers; separates shell, hashed-bundle, and image caching; protects dotfiles; and enforces the proof-upload request ceiling. Public-edge validation and HSTS remain deployment checks.
- L-01 is resolved: the booking confirmation was extracted into a focused standalone component, the production build now completes without component-style budget warnings, and responsive success-state captures at `390` and `1440` pixels show no horizontal overflow.

## Unverified Conditions

- Full coordinated disaster recovery for SQL data and private proof storage.
- Real SMTP delivery and sender reputation/configuration.
- Real production DNS, TLS, proxy headers, secret store, alerts, and log retention.
- Sustained write load, pool exhaustion, and multi-instance worker load.
- Full Firefox/WebKit, screen-reader, 200% zoom, and real-device testing.
- Database outage and storage outage fault injection in an isolated staging environment.

## Deployment Gate

1. Preserve clean-checkout CI verification for every release tag and rerun the matrix after any candidate change.
2. Verify least-privilege SQL permissions, including that the runtime principal cannot create or drop databases.
3. Complete coordinated database/proof-storage backup and restore rehearsal.
4. Validate frontend security headers through the real HTTPS edge and enable HSTS there only after every production subdomain is HTTPS-ready.
5. Configure and test SMTP; self-service recovery and reservation notifications cannot deliver while email is disabled.
6. Enforce shared recovery rate limits before scaling the API beyond one instance.
7. Complete manual browser/accessibility/device QA and staging fault/load checks.
8. Repeat this audit and do not promote while an unresolved Critical issue exists.

## Remaining Approved-Scope Work

- Batch 3 application work is complete. Its remaining external gate is live SMTP delivery verification in staging, already tracked under M-04.
- Batch 4 application cleanup is complete. Runtime quotation code was removed without deleting migrations, schema, or historical rows. No further destructive quotation cleanup is approved or required for this release.
- No approved-scope application batch remains open; the unresolved work is limited to the deployment and staging gates listed above.
