# Admin Operations Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved LA Chef admin operations workflow for booking review, secure manual payment-proof verification, truthful email notification tracking, customer history, and the responsive editorial dashboard.

**Architecture:** Extend the existing Express/MSSQL repository-service-controller layers with transaction-safe payment-proof and booking-history domains. Keep uploaded files behind an authorization-checked storage interface, persist notification intent in an SQL outbox, and expose typed Angular services to focused customer and admin pages. Existing routes and session boundaries remain intact.

**Tech Stack:** Angular 22 standalone components and signals, TypeScript 6, Node.js/Express 5 ES modules, Microsoft SQL Server 2022, `multer` for bounded multipart parsing, `file-type` for content-signature validation, and `nodemailer` behind an optional SMTP transport.

**Spec:** `docs/superpowers/specs/2026-10-01-admin-operations-core-design.md`

## Global Constraints

- Preserve existing customer/admin session-cookie separation and route guards.
- Support `CASH`, `BANK_TRANSFER`, and `E_WALLET`; do not claim automatic GCash/card processing.
- Accept only JPG, PNG, and WebP payment proofs up to exactly 5 MB.
- Store proof files outside public frontend assets and serve them only through authorized endpoints.
- Use the approved booking sequence: `PENDING -> APPROVED -> AWAITING_PAYMENT -> PAYMENT_SUBMITTED -> PAYMENT_VERIFIED -> CONFIRMED -> COMPLETED`, plus `REJECTED` and `CANCELLED`.
- A rejected proof returns its booking to `AWAITING_PAYMENT`; it does not reject the booking.
- Email transport may be absent; queued messages must remain truthfully `PENDING`.
- Follow existing Angular, Express, SQL repository, and audit-log patterns; no unrelated architecture rewrite.
- Run backend tests/build, Angular tests/production build, SQL-backed E2E, and responsive browser checks before completion.

## Review Focus

- A JPEG renamed to `.png` must be rejected and the temporary file deleted; Task 2 owns this test.
- Two admins verifying the same proof concurrently must credit the balance once; Task 5 owns this SQL-backed concurrency test.
- A customer requesting another customer's proof file must receive a non-disclosing `404`; Task 4 owns this authorization test.
- Missing SMTP configuration must leave outbox rows `PENDING` without failing the booking/payment transaction; Task 6 owns this test.
- A stale admin page submitting an invalid status transition must receive `409` and refresh to the current state; Tasks 3 and 9 own the API and UI tests.

---

### Task 1: Migration And Domain Contracts

**Files:**
- Create: `backend/migrations/008_admin_operations_core.sql`
- Create: `backend/src/types/payment-proof.types.ts`
- Create: `backend/src/types/notification.types.ts`
- Modify: `backend/src/types/admin.types.ts`
- Test: `backend/src/migrations/admin-operations-schema.test.ts`

**Interfaces:**
- Produces: `PaymentProofStatus`, `PaymentProofMethod`, `PaymentProofRecord`, `PaymentProofSubmission`, `EmailOutboxStatus`, `EmailTemplateKey`, and SQL tables `PAYMENT_PROOF`, `BOOKING_STATUS_HISTORY`, `EMAIL_OUTBOX`.
- Consumes: Existing `RESERVATION`, `CUSTOMER`, `ADMIN`, `PAYMENT`, `PAYMENT_TRANSACTION`, and `INVOICE` tables.

- [ ] **Step 1: Write the failing schema-contract test**

Assert that migration 008 contains the three required tables, allowed status/method constraints, 5 MB byte-size constraint, foreign keys, useful queue/history indexes, and a filtered unique non-null transaction-reference index.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --test-name-pattern="admin operations schema"`

Expected: FAIL because migration 008 and contracts do not exist.

- [ ] **Step 3: Implement migration 008 and the shared backend types**

Use idempotent `OBJECT_ID` guards, `XACT_ABORT ON`, one transaction, UTC-compatible `datetime2`, and exact enum strings from the specification. Add a constraint ensuring review fields are populated only for `VERIFIED`/`REJECTED` records.

- [ ] **Step 4: Run focused test and backend build**

Run: `npm.cmd test -- --test-name-pattern="admin operations schema"`

Run: `npm.cmd run build`

Expected: PASS and TypeScript exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/008_admin_operations_core.sql backend/src/types
git commit -m "feat: add admin operations data model"
```

### Task 2: Private Proof Storage And Upload Validation

**Files:**
- Create: `backend/src/config/uploads.ts`
- Create: `backend/src/services/proof-storage.service.ts`
- Create: `backend/src/middleware/payment-proof-upload.middleware.ts`
- Create: `backend/src/services/proof-storage.service.test.ts`
- Modify: `backend/src/config/environment.ts`
- Modify: `backend/.env.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.production.example`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `ProofStorage` with `save(tempFile): Promise<StoredProof>`, `open(storageKey): Promise<Readable>`, and `delete(storageKey): Promise<void>`; `paymentProofUpload` middleware; `validateProofFile(file): Promise<ValidatedProofFile>`.
- Consumes: `PaymentProofSubmission` from Task 1 and `PAYMENT_PROOF_UPLOAD_ROOT` configuration.

- [ ] **Step 1: Add dependencies and write failing storage tests**

Install `multer`, `@types/multer`, and `file-type`. Test valid JPEG/PNG/WebP signatures, exact 5 MB acceptance, over-limit rejection, extension/signature mismatch rejection, random-byte rejection, server-generated storage keys, path traversal resistance, and temporary-file cleanup on every rejection.

- [ ] **Step 2: Run the focused storage test and verify RED**

Run: `npm.cmd test -- --test-name-pattern="proof storage"`

Expected: FAIL because storage and validation modules do not exist.

- [ ] **Step 3: Implement environment validation, private local storage, and bounded multipart middleware**

Store files under `<uploadRoot>/payment-proofs/<generated-id>.<validated-extension>`. Never use the original filename in a path. Configure one file per request and a 5 MB parser limit.

- [ ] **Step 4: Run focused tests, dependency audit, and backend build**

Run: `npm.cmd test -- --test-name-pattern="proof storage"`

Run: `npm.cmd audit --omit=dev`

Run: `npm.cmd run build`

Expected: Tests pass, zero high/critical production vulnerabilities, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add .gitignore backend/package.json backend/package-lock.json backend/.env*.example backend/src/config backend/src/middleware backend/src/services/proof-storage*
git commit -m "feat: add private payment proof storage"
```

### Task 3: Booking State History And Transition Service

**Files:**
- Create: `backend/src/services/booking-status.service.ts`
- Create: `backend/src/services/booking-status.service.test.ts`
- Create: `backend/src/repositories/booking-status.repository.ts`
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/controllers/admin.controller.ts`
- Modify: `backend/src/types/admin.types.ts`

**Interfaces:**
- Produces: `allowedBookingTransitions(status): readonly BookingStatus[]` and `transitionBooking({reservationId, nextStatus, actor, reason?, request?}): Promise<void>`; booking-detail history collection.
- Consumes: `BOOKING_STATUS_HISTORY` from Task 1 and existing `writeAdminAudit`.

- [ ] **Step 1: Write failing state-machine tests**

Cover every approved forward transition, required reasons for `REJECTED`/`CANCELLED`, invalid/stale transitions returning `409`, and insertion of both status history and admin audit records.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --test-name-pattern="booking status"`

Expected: FAIL because the transition module does not exist.

- [ ] **Step 3: Implement the state machine and route existing admin status changes through it**

Keep transaction ownership explicit: accept an optional `sql.Request`/transaction context so payment verification can compose the same transition atomically in Task 5.

- [ ] **Step 4: Run focused tests and backend build**

Run: `npm.cmd test -- --test-name-pattern="booking status"`

Run: `npm.cmd run build`

Expected: PASS and build exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/admin.controller.ts backend/src/repositories backend/src/services backend/src/types/admin.types.ts
git commit -m "feat: enforce auditable booking transitions"
```

### Task 4: Customer Payment-Proof API

**Files:**
- Create: `backend/src/repositories/payment-proof.repository.ts`
- Create: `backend/src/services/payment-proof.service.ts`
- Create: `backend/src/controllers/payment-proof.controller.ts`
- Create: `backend/src/routes/payment-proof.routes.ts`
- Create: `backend/src/services/payment-proof.service.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/middleware/auth.middleware.ts` only if a reusable ownership helper is needed

**Interfaces:**
- Produces: `submitCustomerProof(customerId, reservationId, input, file): Promise<PaymentProofRecord>`, `listCustomerProofs(customerId, reservationId)`, and `openAuthorizedProof(actor, proofId)`; customer API routes from the spec.
- Consumes: `ProofStorage` from Task 2 and booking transition service from Task 3.

- [ ] **Step 1: Write failing service/API tests**

Test eligible owner submission, another customer receiving `404`, ineligible booking status receiving `409`, claimed amount above balance receiving `409`, duplicate active reference receiving `409`, successful transition to `PAYMENT_SUBMITTED`, replacement marking the old pending proof `SUPERSEDED`, and file cleanup after database failure.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --test-name-pattern="customer payment proof"`

Expected: FAIL because proof repository/service/routes do not exist.

- [ ] **Step 3: Implement customer endpoints and authorized file streaming**

Return `404` for non-owned records. Set `Content-Type` from validated metadata, `X-Content-Type-Options: nosniff`, private cache controls, and a sanitized download filename.

- [ ] **Step 4: Run focused tests and backend build**

Run: `npm.cmd test -- --test-name-pattern="customer payment proof"`

Run: `npm.cmd run build`

Expected: PASS and build exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.ts backend/src/controllers/payment-proof.controller.ts backend/src/routes/payment-proof.routes.ts backend/src/repositories/payment-proof.repository.ts backend/src/services/payment-proof*
git commit -m "feat: add customer payment proof submission"
```

### Task 5: Admin Proof Review And Atomic Payment Verification

**Files:**
- Create: `backend/src/services/payment-verification.service.ts`
- Create: `backend/src/services/payment-verification.service.test.ts`
- Modify: `backend/src/repositories/payment-proof.repository.ts`
- Modify: `backend/src/controllers/admin.controller.ts`
- Modify: `backend/src/routes/admin.routes.ts`
- Modify: `backend/src/types/admin.types.ts`

**Interfaces:**
- Produces: `listPendingProofs(query)`, `getProofForReview(id)`, `verifyProof(adminId, proofId, verifiedAmount, reason?)`, and `rejectProof(adminId, proofId, reason)`.
- Consumes: payment proof repository, booking transition service, existing payment/invoice tables, and admin audit writer.

- [ ] **Step 1: Write failing verification tests**

Test full verification, corrected amount with required reason, required rejection reason, rejected proof returning booking to `AWAITING_PAYMENT`, partial/full invoice status updates, overpayment rejection, duplicate verification conflict, and one-credit-only behavior under two concurrent verification calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --test-name-pattern="payment verification"`

Expected: FAIL because verification service/endpoints do not exist.

- [ ] **Step 3: Implement admin list/detail/verify/reject endpoints**

Use one SQL transaction with `UPDLOCK,HOLDLOCK` on proof and payment aggregate rows. Insert `PAYMENT_TRANSACTION`, update `PAYMENT`, `INVOICE`, proof status, booking status/history, and audit records before commit.

- [ ] **Step 4: Run focused tests and backend build**

Run: `npm.cmd test -- --test-name-pattern="payment verification"`

Run: `npm.cmd run build`

Expected: PASS and build exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/admin.controller.ts backend/src/routes/admin.routes.ts backend/src/repositories/payment-proof.repository.ts backend/src/services/payment-verification* backend/src/types/admin.types.ts
git commit -m "feat: add atomic payment proof verification"
```

### Task 6: Transactional Email Outbox And Optional Sender

**Files:**
- Create: `backend/src/repositories/email-outbox.repository.ts`
- Create: `backend/src/services/notification.service.ts`
- Create: `backend/src/services/email-worker.service.ts`
- Create: `backend/src/services/email-worker.service.test.ts`
- Create: `backend/src/templates/email-templates.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/config/environment.ts`
- Modify: `backend/.env.example`
- Modify: `backend/.env.staging.example`
- Modify: `backend/.env.production.example`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: booking/payment/invoice services at their successful transaction boundaries

**Interfaces:**
- Produces: `queueNotification(input, request?): Promise<number>`, `processEmailBatch(now): Promise<BatchResult>`, and a development `renderEmailPreview(outboxId)` path used by admin APIs.
- Consumes: `EMAIL_OUTBOX` from Task 1 and domain events from Tasks 3-5.

- [ ] **Step 1: Install Nodemailer and write failing outbox tests**

Test booking operations succeeding with SMTP absent, rows remaining `PENDING`, configured send marking `SENT`, transient failure scheduling bounded exponential retry, permanent/max-attempt failure marking `FAILED`, and two workers not claiming the same row.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --test-name-pattern="email outbox"`

Expected: FAIL because outbox worker and templates do not exist.

- [ ] **Step 3: Implement templates, queue service, optional transport, and worker lifecycle**

Use sender name `LA Chef Event Catering Services`. Never attach proof images or include passwords/secrets. Start/stop the worker with server bootstrap/shutdown only when transport is configured; otherwise preserve pending rows and previews.

- [ ] **Step 4: Queue all specified domain notifications inside successful operations**

Cover booking received/approved/rejected, invoice issued, proof submitted/verified/rejected, and booking confirmed/cancelled/completed.

- [ ] **Step 5: Run focused/full backend tests, audit, and build**

Run: `npm.cmd test`

Run: `npm.cmd audit --omit=dev`

Run: `npm.cmd run build`

Expected: All backend tests pass, no high/critical production vulnerabilities, build exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/package* backend/.env*.example backend/src/config backend/src/repositories/email-outbox.repository.ts backend/src/services backend/src/templates backend/src/server.ts
git commit -m "feat: add transactional email outbox"
```

### Task 7: Dashboard, Customer History, Outbox, And Audit APIs

**Files:**
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/src/controllers/admin.controller.ts`
- Modify: `backend/src/routes/admin.routes.ts`
- Modify: `backend/src/types/admin.types.ts`
- Create: `backend/src/services/admin-operations.service.test.ts`

**Interfaces:**
- Produces: period-based dashboard summary/ledger/queues, paginated `customerBookings(customerId, query)`, paginated email-outbox list/retry/preview, and paginated audit-log list.
- Consumes: tables/services from Tasks 1-6.

- [ ] **Step 1: Write failing admin operations query tests**

Assert dashboard values distinguish verified revenue from submitted proofs, current-month period boundaries are correct, attention queue ordering is deterministic, customer history queries by `customer_id` beyond 100 global records, pagination limits are bounded, and outbox/audit filters work.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --test-name-pattern="admin operations queries"`

Expected: FAIL against the current summary/global-filter implementation.

- [ ] **Step 3: Implement set-based repository queries and typed endpoints**

Remove the current global 100-booking in-memory customer filter. Use explicit reporting dates and SQL aggregation without N+1 queries.

- [ ] **Step 4: Run focused tests and backend build**

Run: `npm.cmd test -- --test-name-pattern="admin operations queries"`

Run: `npm.cmd run build`

Expected: PASS and build exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/admin.controller.ts backend/src/repositories/admin.repository.ts backend/src/routes/admin.routes.ts backend/src/services/admin* backend/src/types/admin.types.ts
git commit -m "feat: expose admin operations data"
```

### Task 8: Angular Contracts And Customer Proof Submission

**Files:**
- Create: `frontend/src/app/core/models/payment-proof.model.ts`
- Modify: `frontend/src/app/core/models/index.ts`
- Create: `frontend/src/app/core/services/payment-proof.service.ts`
- Create: `frontend/src/app/core/services/payment-proof.service.spec.ts`
- Create: `frontend/src/app/features/payment-proof/payment-proof.page.ts`
- Create: `frontend/src/app/features/payment-proof/payment-proof.page.html`
- Create: `frontend/src/app/features/payment-proof/payment-proof.page.scss`
- Create: `frontend/src/app/features/payment-proof/payment-proof.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: customer booking/dashboard navigation files

**Interfaces:**
- Produces: customer route `/my-bookings/:id/payment`, typed upload/list APIs, validation state, progress/submit/retry UI, and proof history.
- Consumes: Task 4 endpoints and existing `authGuard`/customer navigation.

- [ ] **Step 1: Write failing service and component tests**

Test multipart field names, accepted types, exact 5 MB client validation, unavailable/ineligible action hiding, duplicate submission prevention, API-specific conflict messages, and successful “For verification” history rendering.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd run test -- --watch=false`

Expected: New tests fail because models/service/page do not exist.

- [ ] **Step 3: Implement typed models/service and the responsive submission page**

Use native file input with visible label, file summary, remove control, field-level errors, loading state, and no claim of instant payment success.

- [ ] **Step 4: Run Angular tests and production build**

Run: `npm.cmd run test -- --watch=false`

Run: `npm.cmd run build`

Expected: All frontend tests pass and production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/core frontend/src/app/features/payment-proof frontend/src/app/features/customer-dashboard frontend/src/app/features/my-bookings
git commit -m "feat: add customer payment proof flow"
```

### Task 9: Admin Booking Detail And Payment Review UI

**Files:**
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/core/services/admin.service.ts`
- Create: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.ts`
- Create: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html`
- Create: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.scss`
- Create: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts`
- Create: `frontend/src/app/features/admin-payment-review/admin-payment-review.page.ts`
- Create: `frontend/src/app/features/admin-payment-review/admin-payment-review.page.html`
- Create: `frontend/src/app/features/admin-payment-review/admin-payment-review.page.scss`
- Create: `frontend/src/app/features/admin-payment-review/admin-payment-review.page.spec.ts`
- Modify: `frontend/src/app/features/admin-bookings/*`
- Modify: `frontend/src/app/features/admin-payments/*`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Produces: `/admin/bookings/:id` and `/admin/payments/proofs/:id` screens with valid actions, status history, invoice/payment summary, proof zoom/download, verify/correct/reject forms, and specific conflict recovery.
- Consumes: Tasks 3, 5, and 7 admin endpoints.

- [ ] **Step 1: Write failing booking-detail and proof-review component tests**

Assert action buttons match every booking status, reasons are required, stale `409` refreshes current data, proof metadata/image are accessible, corrected amounts require a reason, overpayment errors preserve form data, and mutation buttons lock during submission.

- [ ] **Step 2: Run Angular tests and verify RED**

Run: `npm.cmd run test -- --watch=false`

Expected: New tests fail because pages/routes do not exist.

- [ ] **Step 3: Implement typed service methods and the two responsive pages**

Use full-width unframed page sections, one proof viewer tool, concise confirmation dialogs, 44-pixel controls, and mobile record layouts without page-level horizontal scrolling.

- [ ] **Step 4: Run Angular tests and production build**

Run: `npm.cmd run test -- --watch=false`

Run: `npm.cmd run build`

Expected: All tests pass and build exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/core frontend/src/app/features/admin-booking-detail frontend/src/app/features/admin-payment-review frontend/src/app/features/admin-bookings frontend/src/app/features/admin-payments
git commit -m "feat: add admin booking and payment review"
```

### Task 10: Approved Editorial Dashboard, Customer Detail, Outbox, And Audit UI

**Files:**
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.ts`
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.html`
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.scss`
- Create: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.spec.ts`
- Create: `frontend/src/app/features/admin-customer-detail/*`
- Create: `frontend/src/app/features/admin-email-outbox/*`
- Create: `frontend/src/app/features/admin-audit-log/*`
- Modify: `frontend/src/app/features/admin-customers/*`
- Modify: `frontend/src/app/shared/components/admin-shell/*`
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/*`
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Produces: approved action dashboard with Editorial Revenue Ledger, responsive admin navigation, customer history, email outbox preview/retry, and audit-log pages.
- Consumes: Task 7 endpoints and established admin shell.

- [ ] **Step 1: Write failing dashboard and navigation tests**

Test priority counts/links, ledger labels and currency values, no generic chart markup, failed-email action, responsive drawer state, customer pagination links, outbox retry/preview, and audit filters.

- [ ] **Step 2: Run Angular tests and verify RED**

Run: `npm.cmd run test -- --watch=false`

Expected: New tests fail against the current dashboard and routes.

- [ ] **Step 3: Implement the approved visual direction and supporting pages**

Match the approved prototype: dark olive navigation, ivory workspace, restrained gold/red priority accents, compact operational hierarchy, Editorial Revenue Ledger, and essential-field mobile records.

- [ ] **Step 4: Run Angular tests and production build**

Run: `npm.cmd run test -- --watch=false`

Run: `npm.cmd run build`

Expected: All tests pass and production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/features/admin-* frontend/src/app/shared/components/admin-shell frontend/src/app/shared/components/dashboard-sidebar
git commit -m "feat: complete admin operations workspace"
```

### Task 11: End-To-End Verification, Documentation, And Release Review

**Files:**
- Modify: `backend/e2e/phase81.e2e.ts` or create `backend/e2e/admin-operations.e2e.ts`
- Create: `frontend/e2e/admin-operations.spec.ts` if the browser harness is added in this task
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/RESPONSIVE_QA.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: repeatable release evidence and deployment instructions for uploads, outbox worker, and email-disabled behavior.

- [ ] **Step 1: Add failing SQL-backed admin operations E2E coverage**

Cover registration/login, booking creation, proof submission, cross-customer denial, admin rejection/resubmission, concurrent verification, invoice/payment/status/history updates, outbox records, and cleanup.

- [ ] **Step 2: Run E2E and verify RED before finishing missing integration behavior**

Run: `npm.cmd run test:e2e`

Expected: FAIL until every integration boundary is correctly wired.

- [ ] **Step 3: Add browser journey and responsive/accessibility checks**

Verify admin login, dashboard action link, booking detail, proof verification, customer result, keyboard operation, no horizontal overflow, and screenshots at 390, 768, 1024, and 1440 pixels.

- [ ] **Step 4: Update deployment and audit documentation**

Document private upload persistence/backup, environment placeholders, SMTP-disabled behavior, worker monitoring, accepted files, and the explicit absence of live online payment processing.

- [ ] **Step 5: Run the complete verification matrix**

Run in `backend`:

```bash
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --omit=dev
```

Run in `frontend`:

```bash
npm.cmd run test -- --watch=false
npm.cmd run build
npm.cmd audit --omit=dev
```

Expected: zero test failures, both builds exit 0, SQL E2E passes with cleanup, and no high/critical production vulnerabilities.

- [ ] **Step 6: Run final secret and artifact checks**

Verify no `.env`, uploaded proof, SMTP credential, generated screenshot, local log, or build output is staged. Verify migration 008 and safe example files are tracked.

- [ ] **Step 7: Request whole-branch code review and resolve findings**

Review security boundaries, transactional integrity, upload cleanup, truthful payment/email copy, mobile overflow, and missing tests before declaring readiness.

- [ ] **Step 8: Commit verification/docs changes**

```bash
git add .github/workflows/ci.yml backend/e2e frontend/e2e docs
git commit -m "test: verify admin operations workflows"
```
