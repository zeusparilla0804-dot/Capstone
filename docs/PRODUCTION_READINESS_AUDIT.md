# LA Chef Production Readiness Audit

Date: 2026-10-16
Release candidate: `v1.0.0-rc.1`
Verdict: **NOT READY FOR PRODUCTION**

## Current Evidence

- Backend unit and route suites pass: 369 executed, 367 passed, and 2 expected platform-specific permission tests skipped on Windows. Coverage includes customer account status enforcement, reservation/payment reports and CSV safety, the exact 50% reservation-deposit boundary, cumulative proof/manual-payment credit, password recovery, session revocation and cleanup, upload validation, ownership boundaries, package pricing, retired quotation creation, booking-state transactions, payment concurrency, outbox retries, and stream failure handling.
- Four active SQL-backed E2E journeys pass for session security, password recovery, registration/login, booking, invoices, proof rejection/resubmission, exact-threshold payment verification, final-slot capacity locking, status history, outbox records, and fixture cleanup.
- All 178 Angular tests pass for customer maintenance, report APIs and workspace behavior, keyboard-operable report tabs, Messenger route/configuration safety, recovery APIs and screens, session-security controls, services, forms, focused navigation, package pricing, the 50% billing presentation, proof submission/review UI, and responsive customer/admin portals.
- All 18 Playwright tests pass, including authenticated report filtering and CSV export, Messenger visibility boundaries, customer/admin recovery and logout controls, package-to-reservation navigation, exact 50% deposit math, supported manual payment labels, retired `/custom-event` redirect, keyboard operation, the admin-to-customer proof journey, and responsive checks at `390`, `768`, `1024`, and `1440` pixels.
- Backend and Angular production builds pass under Node.js `22.22.3`.
- Production dependency audits report no known high or critical vulnerabilities.
- No real environment file, uploaded proof, build output, test screenshot, or obvious credential is intended for source control.
- Fresh disposable-database verification passed on 2026-10-16 through migrations `000`-`006` and `008`-`015`. The verifier applied migrations in order, confirmed an idempotent runner pass, validated the complete schema and empty business-data boundary, passed all four configured SQL-backed E2E journeys, preserved business-row counts through the forward-compatible baseline rerun, and removed the disposable database.
- Migration `015_customer_account_status.sql` is present, ordered, idempotent, and now covered by both the local integration suite and the clean-room disposable-database rehearsal.

## Critical

No unresolved Critical finding is currently recorded. This does not make the release production-ready while the High and Medium deployment gates below remain open.

## High

### H-03 Production least-privilege database access is not proven

- Location: deployment SQL principal and secret-store configuration.
- Impact: an over-privileged API credential increases the effect of compromise.
- Required fix: use separate migration/runtime principals and verify the runtime account cannot alter schema or manage logins.

### H-04 Recovery rehearsal for private proofs is incomplete

- Location: `PAYMENT_PROOF_UPLOAD_ROOT` and `dbo.PAYMENT_PROOF` recovery process.
- Impact: restoring only one side can create missing evidence or unreferenced sensitive files.
- Required fix: perform and document a coordinated SQL plus proof-storage restore drill in staging.

## Medium

### M-01 Public About and Contact routes still contain placeholder copy

- Location: `frontend/src/app/features/home/simple-info.page.ts`.
- Fix: add client-approved business details, service area, contact channels, privacy information, and final copy.

### M-02 Frontend document security headers are not configured in repository Nginx

- Location: `frontend/deploy/nginx.conf`.
- Fix: add and validate CSP, frame protection, referrer policy, permissions policy, and `X-Content-Type-Options`; configure HSTS at the HTTPS edge.

### M-04 Live SMTP delivery is unverified

- Location: optional outbox worker deployment configuration.
- Current behavior: with SMTP disabled, messages correctly remain `PENDING` and do not break business transactions.
- Required fix: configure staging SMTP, verify delivery/retry/failure monitoring, and obtain approved sender-domain settings before enabling production email.

## Low

### L-01 Existing frontend performance warnings remain

- Location: `frontend/src/app/features/booking/booking.page.scss` and the package image used as LCP in browser verification.
- Current behavior: production build succeeds, but the booking stylesheet exceeds its component budget by 992 bytes; Angular also reports that one LCP package image is lazy-loaded.
- Fix: reduce or split the booking stylesheet and mark the first visible package image eager/priority without eagerly loading every gallery image.

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
- New custom-quotation creation is retired non-destructively. The API returns `410 CUSTOM_QUOTATION_RETIRED` after customer authentication, the old frontend creation URL redirects to Packages, and no primary navigation or package CTA starts a quotation. Existing quotation records, schema migrations, and authenticated history/detail routes remain intact for Batch 4 classification.
- Customer proofs and administrator-recorded payments now share the same cumulative 50% deposit policy, and administrator proof review distinguishes the full outstanding balance from the amount still needed to secure the reservation.
- The provisional catalog fixture was retired. The controlled catalog sync is repeatable, defaults to dry-run, and requires an explicit apply plus cleanup flag before known sample entries are deactivated.
- Payment proofs are signature-validated, private, owner/admin authorized, and protected against cross-customer disclosure.
- Rejection/resubmission and atomic one-credit-only verification are implemented with history and audit records.
- Notification intent is transactionally queued even when SMTP is absent.
- Admin dashboard, booking detail, customer detail, payment review, outbox, and audit interfaces are implemented responsively.
- Private inline proof previews work across the local frontend/API ports with `same-site` resource policy.
- Manual payments now reject terminal bookings, supersede stale submitted proofs, and commit credit, invoice state, booking history, audit, and notification intent atomically.
- Invoice issuance now locks and revalidates the booking and commits invoice, audit, and notification intent together.
- Customer invoice authorization returns the same non-disclosing `404` for missing and other-customer invoice identifiers.
- Rejected and superseded proof references are archived by migration `009`, allowing a corrected submission to reuse the real transaction reference without permitting duplicate active/verified credits.
- Mobile admin navigation is inert while closed, contains focus while open, and restores focus on Escape; the proof viewer has keyboard-accessible bounded zoom controls.
- Playwright pins both backend and frontend test ports, preventing inherited local `PORT` values from redirecting either server.
- Historical custom-quotation code and records are deliberately retained but are no longer part of the active customer creation flow. Destructive cleanup is deferred until records are classified and explicitly approved.
- The foundational migration validation recognizes both its original package columns and the pricing model introduced by migration `012`, preserving baseline rerun verification after the complete migration chain.
- Administrators can edit customer contact details and activate or deactivate accounts without deleting reservation, invoice, payment, notification, or audit history. Inactive customer login/session lookup is rejected, and deactivation revokes that customer's sessions transactionally.
- Administrator reservation and payment reports are available behind `adminGuard`, with strict date/filter validation, non-duplicated billing totals, responsive table/record views, safe CSV export, and print styling.
- The client-approved Messenger destination is configured as a public HTTPS value and mounted once at the application root. It is available on public/customer routes, hidden throughout `/admin/*`, and uses safe external-link attributes.

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
4. Replace placeholder public content and validate frontend security headers.
5. Configure and test SMTP; self-service recovery and reservation notifications cannot deliver while email is disabled.
6. Enforce shared recovery rate limits before scaling the API beyond one instance.
7. Complete manual browser/accessibility/device QA and staging fault/load checks.
8. Repeat this audit and do not promote while an unresolved Critical issue exists.

## Remaining Approved-Scope Work

- Batch 3: add registration and upcoming-event reminder notifications, then prove live SMTP delivery in staging.
- Batch 4: classify retained quotation data/code, obtain explicit approval before destructive retirement, and rerun the full release matrix.
