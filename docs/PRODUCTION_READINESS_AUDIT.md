# LA Chef Production Readiness Audit

Date: 2026-10-11
Release candidate: `v1.0.0-rc.1`
Verdict: **NOT READY FOR PRODUCTION**

## Current Evidence

- Backend unit and route suites pass: 266 executed, 264 passed, and 2 expected platform-specific permission tests skipped on Windows. Coverage includes password recovery, upload validation, ownership boundaries, booking-state transactions, payment concurrency, outbox retries, and stream failure handling.
- Three SQL-backed E2E journeys pass for password recovery, registration/login, booking, invoice, proof rejection/resubmission, cross-customer denial, concurrent single-use operations, status history, outbox records, and fixture cleanup.
- All 89 Angular tests pass for recovery APIs and screens, services, forms, navigation, admin operations, proof submission, and review UI.
- All 9 Playwright tests pass, including customer/admin recovery, keyboard operation, generic anti-enumeration copy, token removal after success, the admin-to-customer proof journey, and responsive checks at `390`, `768`, `1024`, and `1440` pixels.
- Backend and Angular production builds pass under Node.js `22.22.3`.
- Production dependency audits report no known high or critical vulnerabilities.
- No real environment file, uploaded proof, build output, test screenshot, or obvious credential is intended for source control.
- Empty-database verification provisions a generated database from tracked migrations `000`-`006` and `008`-`011`, validates the current catalog and data boundary, runs all backend SQL E2E journeys, rechecks baseline idempotency, and drops the generated database.

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

### M-03 Session maintenance is incomplete

- Location: customer/admin session repositories and operations.
- Current behavior: password changes revoke all sessions atomically and the deployment runbook includes incident response.
- Fix: add scheduled expired-session cleanup for routine maintenance.

### M-04 Live SMTP delivery is unverified

- Location: optional outbox worker deployment configuration.
- Current behavior: with SMTP disabled, messages correctly remain `PENDING` and do not break business transactions.
- Required fix: configure staging SMTP, verify delivery/retry/failure monitoring, and obtain approved sender-domain settings before enabling production email.

## Explicit Product Constraint

LA Chef does not process live online payments in this release. Cash, bank transfer, and e-wallet selections record the intended manual method; uploaded evidence requires administrator verification. The product must not claim instant GCash/card processing until a compliant provider, signed webhooks, idempotency, reconciliation, refunds, and dispute handling are implemented.

The untracked `backend/fixtures/starter-catalog.provisional.sql` contains provisional package/add-on content and remains outside automatic migrations and the release until LA Chef approves names, inclusions, prices, and availability.

## Resolved Since The Previous Audit

- C-01 is resolved: the fresh verifier creates an allow-listed disposable database, applies `000`-`006` and `008`-`011` twice, validates the complete schema and empty business-data boundary, runs all backend SQL E2E journeys, rechecks baseline idempotency, and removes the database.
- H-01 is resolved: customer and active-administrator recovery use separate public routes, generic request responses, dedicated rate limits, 15-minute single-use role-scoped links, protected email rendering, atomic password rotation, all-session revocation, and confirmation intent. SQL and browser E2E cover both account types; live SMTP remains open under M-04.
- H-02 is resolved for the client-approved booking rules: submission enforces the daily slot/capacity policy transactionally, medium events require explicit administrator confirmation, and concurrent final-slot tests permit exactly one success.
- Customer login no longer validates hidden registration fields; login also accepts existing shorter passwords while registration still requires 12 characters.
- Customer/admin session state persists correctly across protected navigation.
- Customer and admin session expiry now compares against the SQL Server UTC clock, matching application-issued UTC timestamps.
- Package selection, category normalization, gallery navigation, booking statuses, billing routes, and customer history were aligned.
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
5. Configure and test SMTP; self-service recovery cannot deliver links while email is disabled.
6. Enforce shared recovery rate limits before scaling the API beyond one instance.
7. Complete manual browser/accessibility/device QA and staging fault/load checks.
8. Repeat this audit and do not promote while an unresolved Critical issue exists.
