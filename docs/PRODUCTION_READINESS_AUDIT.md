# LA Chef Production Readiness Audit

Date: 2026-10-10
Release candidate: `v1.0.0-rc.1`
Verdict: **NOT READY FOR PRODUCTION**

## Current Evidence

- Backend unit and route suites pass: 175 executed, 173 passed, and 2 expected platform-specific permission tests skipped on Windows. Coverage includes upload validation, ownership boundaries, booking-state transactions, payment concurrency, outbox retries, and stream failure handling.
- SQL-backed E2E passes for registration/login, booking, invoice, proof rejection/resubmission, cross-customer denial, one-credit-only concurrent verification, status history, outbox records, and cleanup.
- All 52 Angular tests pass for the implemented services, forms, navigation, admin operations, proof submission, and review UI.
- All 5 Playwright tests pass for the full admin-to-customer proof journey plus responsive checks at `390`, `768`, `1024`, and `1440` pixels.
- Backend and Angular production builds pass under Node.js `22.22.3`.
- Production dependency audits report no known high or critical vulnerabilities.
- No real environment file, uploaded proof, build output, test screenshot, or obvious credential is intended for source control.
- A separate Git index exports a 285-file candidate snapshot without changing the existing staging area. Fresh `npm ci`, backend/frontend tests, production builds, SQL E2E, and Playwright E2E are run from that exported snapshot under Node.js `22.22.3`.
- Empty-database verification provisions a generated database from tracked migrations `000`-`006` and `008`-`010`, validates the current catalog and data boundary, runs both backend SQL E2E suites, rechecks baseline idempotency, and drops the generated database.

## Critical

No unresolved Critical finding is currently recorded. This does not make the release production-ready while the High and Medium deployment gates below remain open.

## High

### H-01 Password recovery is absent

- Location: customer/admin authentication routes and login interfaces.
- Impact: users who lose credentials require manual database intervention.
- Required fix: add expiring single-use reset tokens, generic anti-enumeration responses, rate limits, secure delivery, password rotation, and session revocation.

### H-02 Scheduling and capacity conflicts are not enforced

- Location: booking creation and approval workflow.
- Impact: overlapping events can be accepted despite limited staff, equipment, or venue capacity.
- Required fix: obtain client capacity rules and enforce them transactionally during submission/approval with concurrency tests.

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
- Fix: add scheduled expired-session cleanup, all-device revocation, and an incident-response procedure.

### M-04 Live SMTP delivery is unverified

- Location: optional outbox worker deployment configuration.
- Current behavior: with SMTP disabled, messages correctly remain `PENDING` and do not break business transactions.
- Required fix: configure staging SMTP, verify delivery/retry/failure monitoring, and obtain approved sender-domain settings before enabling production email.

## Explicit Product Constraint

LA Chef does not process live online payments in this release. Cash, bank transfer, and e-wallet selections record the intended manual method; uploaded evidence requires administrator verification. The product must not claim instant GCash/card processing until a compliant provider, signed webhooks, idempotency, reconciliation, refunds, and dispute handling are implemented.

The untracked `backend/fixtures/starter-catalog.provisional.sql` contains provisional package/add-on content and remains outside automatic migrations and the release until LA Chef approves names, inclusions, prices, and availability.

## Resolved Since The Previous Audit

- C-01 is resolved: on 2026-10-10, `npm run db:verify:fresh` created an allow-listed disposable database, applied `000`-`006` and `008`-`010` twice, validated the complete schema, confirmed exactly five event-type reference rows and zero business rows before fixtures, passed both backend SQL E2E suites, reran `000` without changing schema or row counts, and removed the database. A follow-up query found zero remaining `LA_CHEF_VERIFY_*` databases.
- The coherent 285-file candidate is captured in a local release commit and passes the complete verification matrix from a clean exported checkout of that commit.
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
2. Implement password recovery or obtain a documented, time-limited launch exception with a secure support procedure.
3. Define and enforce scheduling/capacity rules before accepting real reservations.
4. Verify least-privilege SQL permissions, including that the runtime principal cannot create or drop databases.
5. Complete coordinated database/proof-storage backup and restore rehearsal.
6. Replace placeholder public content and validate frontend security headers.
7. Configure and test SMTP, or launch with email clearly disabled and monitored pending outbox rows.
8. Complete manual browser/accessibility/device QA and staging fault/load checks.
9. Repeat this audit and do not promote while an unresolved Critical issue exists.
