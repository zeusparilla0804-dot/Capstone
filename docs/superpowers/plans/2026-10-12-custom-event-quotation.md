# Custom Event Quotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate custom-event request and versioned quotation workflow in which payment becomes available only after secure customer acceptance.

**Architecture:** A custom request creates a capacity-consuming `PENDING` reservation without payment, then stores planning preferences in dedicated tables. Admin quote versions carry immutable line items; accepting the current valid version transactionally snapshots totals, creates invoice/payment records, and advances the existing booking lifecycle.

**Tech Stack:** Angular 22, TypeScript, Express 5 ES modules, SQL Server 2022 transactions and row locks, existing email outbox, Vitest, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-custom-event-quotation-design.md`

## Global Constraints

- The custom route and form remain separate from automatic package booking.
- A source package is inspiration only and never supplies an automatic final quote.
- Custom requests consume date capacity from submission but create no payment or invoice before quote acceptance.
- Customer identifiers use ownership checks; administrator mutations use existing admin authorization and audit logging.
- All monetary values are validated and computed server-side with transactional acceptance.
- Customer and admin pages must be responsive at 390, 768, 1024, and 1440 pixels.

## Review Focus

- Two simultaneous accept requests must create exactly one payment and invoice; Task 5 pins row-lock/idempotency behavior.
- A superseded or expired quote must remain visible historically but cannot be accepted; Tasks 2 and 5 cover it.
- A custom request submission that loses the final date slot must roll back both reservation and request; Task 3 covers it.
- A customer probing another request identifier must receive the same safe 404 behavior as a missing record; Tasks 3 and 5 cover ownership.
- Email delivery failure must not roll back a request or accepted quote; Task 6 covers outbox isolation and retry state.

---

### Task 1: Custom Request And Quote Schema

**Files:**
- Create: `backend/migrations/013_custom_event_quotation.sql`
- Create: `backend/src/migrations/custom-event-quotation-schema.test.ts`
- Modify: `backend/src/migrations/schema-contract.ts`
- Create: `backend/src/types/custom-event.types.ts`

**Interfaces:**
- Produces: request, quote, and quote-item tables/statuses from the spec plus nullable `RESERVATION.accepted_quote_id`.
- Produces: `CustomEventRequest`, `CustomQuote`, `CustomQuoteItem`, and status types.

- [ ] **Step 1: Write failing schema tests** for columns, foreign keys, status and monetary checks, unique request/version key, accepted-quote link, and queue indexes.
- [ ] **Step 2: Run focused backend schema tests; expect failure.**
- [ ] **Step 3: Implement idempotent migration `013_custom_event_quotation.sql`** and update the schema contract.
- [ ] **Step 4: Add exact TypeScript domain interfaces and status unions.**
- [ ] **Step 5: Rerun focused tests; expect PASS.**
- [ ] **Step 6: Commit `feat: add custom quotation schema`.**

### Task 2: Quote Domain Rules

**Files:**
- Create: `backend/src/services/custom-quote-domain.service.ts`
- Create: `backend/src/services/custom-quote-domain.service.test.ts`

**Interfaces:**
- Produces: `calculateQuoteTotals(items, requiredDownPayment): QuoteTotals`.
- Produces: `assertQuoteAcceptable(quote, now): void` and state-transition guards.

- [ ] **Step 1: Write failing tests** for decimal line totals, invalid quantities/amounts, down payment bounds, current/superseded/expired states, and deterministic version transitions.
- [ ] **Step 2: Run focused tests; expect failure because the service is absent.**
- [ ] **Step 3: Implement the pure domain functions** without database or Express dependencies.
- [ ] **Step 4: Rerun focused tests; expect PASS.**
- [ ] **Step 5: Commit `feat: define custom quote rules`.**

### Task 3: Customer Custom-Event Submission API

**Files:**
- Create: `backend/src/repositories/custom-event.repository.ts`
- Create: `backend/src/services/custom-event.service.ts`
- Create: `backend/src/controllers/custom-event.controller.ts`
- Create: `backend/src/routes/custom-event.routes.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/src/controllers/custom-event.controller.test.ts`
- Create: `backend/src/repositories/custom-event.repository.test.ts`

**Interfaces:**
- Produces: `POST /api/custom-events` and owner-scoped `GET /api/custom-events/:id`.
- Consumes: existing availability service and optional active `sourcePackageId`.

- [ ] **Step 1: Write failing controller/repository tests** for blank and package-derived requests, all field bounds, safe ownership 404, capacity conflict, no payment/invoice creation, and transaction rollback.
- [ ] **Step 2: Run focused tests; expect failures.**
- [ ] **Step 3: Implement request parsing and customer routes** using existing validation and authentication middleware.
- [ ] **Step 4: Implement transactional submission** that locks capacity, inserts a `PENDING` reservation with nullable financials, inserts the request, and queues receipt notification.
- [ ] **Step 5: Implement owner-scoped detail retrieval** including current quote and history without administrative fields.
- [ ] **Step 6: Rerun focused tests; expect PASS.**
- [ ] **Step 7: Commit `feat: submit custom event requests`.**

### Task 4: Admin Request Queue And Quote Creation

**Files:**
- Modify: `backend/src/repositories/custom-event.repository.ts`
- Modify: `backend/src/services/custom-event.service.ts`
- Modify: `backend/src/controllers/admin.controller.ts`
- Modify: `backend/src/routes/admin.routes.ts`
- Create: `backend/src/services/custom-event-admin.service.test.ts`

**Interfaces:**
- Produces: admin list/detail, quote creation, clarification, and rejection endpoints from the spec.
- Consumes: Task 2 totals and existing audit/outbox APIs.

- [ ] **Step 1: Write failing service tests** for paginated queue filters, quote version creation, superseding old sent quotes, clarification/rejection reasons, authorization boundary, audit entries, and notification queueing.
- [ ] **Step 2: Run focused tests; expect failures.**
- [ ] **Step 3: Implement list/detail repository queries** with current quote summary and source-package metadata.
- [ ] **Step 4: Implement transactional quote creation** with ordered immutable lines and version locking.
- [ ] **Step 5: Implement clarification and rejection transitions** through existing booking history/audit mechanisms.
- [ ] **Step 6: Rerun focused tests; expect PASS.**
- [ ] **Step 7: Commit `feat: manage custom quotations`.**

### Task 5: Customer Quote Acceptance And Decline

**Files:**
- Modify: `backend/src/repositories/custom-event.repository.ts`
- Modify: `backend/src/services/custom-event.service.ts`
- Modify: `backend/src/controllers/custom-event.controller.ts`
- Modify: `backend/src/routes/custom-event.routes.ts`
- Create: `backend/src/services/custom-quote-acceptance.service.test.ts`

**Interfaces:**
- Produces: customer accept/decline endpoints from the spec.
- Produces: accepted quotation conversion to the existing invoice, payment, and booking lifecycle.

- [ ] **Step 1: Write failing tests** for ownership, accepted current version, expired/superseded/declined versions, stale date capacity, double acceptance, exact invoice lines, and one payment record.
- [ ] **Step 2: Run focused tests; expect failures.**
- [ ] **Step 3: Implement transactional acceptance** with request/quote/reservation row locks, domain guards, capacity recheck, reservation totals, payment, invoice, accepted link, status history, audit, and outbox writes.
- [ ] **Step 4: Implement decline** for the current sent quote with optional bounded reason and no financial records.
- [ ] **Step 5: Rerun focused tests; expect PASS.**
- [ ] **Step 6: Commit `feat: accept or decline custom quotes`.**

### Task 6: Notification Templates

**Files:**
- Modify: `backend/src/services/notification.service.ts`
- Modify: `backend/src/services/notification-domain.service.test.ts`
- Modify: `backend/src/repositories/email-outbox.repository.ts`

**Interfaces:**
- Produces: templates for request receipt, clarification, quote sent, quote accepted, quote declined, and quote expiry.

- [ ] **Step 1: Write failing tests** for safe template payloads, customer/admin recipients, retryable delivery failure, and links that use configured frontend origin.
- [ ] **Step 2: Implement templates and event-to-outbox mappings** without embedding credentials or internal database fields.
- [ ] **Step 3: Run notification tests; expect PASS.**
- [ ] **Step 4: Commit `feat: notify custom quote changes`.**

### Task 7: Angular Customer Request And Quote Review

**Files:**
- Create: `frontend/src/app/core/models/custom-event.model.ts`
- Create: `frontend/src/app/core/services/custom-event.service.ts`
- Create: `frontend/src/app/core/services/custom-event.service.spec.ts`
- Create: `frontend/src/app/features/custom-event/custom-event.page.ts`
- Create: `frontend/src/app/features/custom-event/custom-event.page.html`
- Create: `frontend/src/app/features/custom-event/custom-event.page.scss`
- Create: `frontend/src/app/features/custom-event/custom-event.page.spec.ts`
- Create: `frontend/src/app/features/custom-event-detail/custom-event-detail.page.ts`
- Create: `frontend/src/app/features/custom-event-detail/custom-event-detail.page.html`
- Create: `frontend/src/app/features/custom-event-detail/custom-event-detail.page.scss`
- Create: `frontend/src/app/features/custom-event-detail/custom-event-detail.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/navigation/customer-navigation.ts`

**Interfaces:**
- Produces: authenticated `/custom-event` and `/custom-events/:id` routes.
- Consumes: optional `sourcePackage` query parameter from the editorial package experience.

- [ ] **Step 1: Write failing service/component tests** for package-derived and blank forms, availability states, validation, loading, duplicate-submit prevention, draft preservation, status language, quote history, accept/decline, and hidden payment controls before acceptance.
- [ ] **Step 2: Run focused Angular tests; expect failures.**
- [ ] **Step 3: Implement typed service and dedicated request form** without reusing the automatic-pricing checkout stepper.
- [ ] **Step 4: Implement customer detail and quotation review** with readable lines, validity, terms, confirmation dialog, and resilient error states.
- [ ] **Step 5: Add routes and customer navigation entries.**
- [ ] **Step 6: Run focused Angular tests; expect PASS.**
- [ ] **Step 7: Commit `feat: add customer custom quote flow`.**

### Task 8: Angular Admin Quotation Workspace

**Files:**
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/core/services/admin.service.ts`
- Create: `frontend/src/app/features/admin-custom-events/admin-custom-events.page.ts`
- Create: `frontend/src/app/features/admin-custom-events/admin-custom-events.page.html`
- Create: `frontend/src/app/features/admin-custom-events/admin-custom-events.page.scss`
- Create: `frontend/src/app/features/admin-custom-events/admin-custom-events.page.spec.ts`
- Create: `frontend/src/app/features/admin-custom-event-detail/admin-custom-event-detail.page.ts`
- Create: `frontend/src/app/features/admin-custom-event-detail/admin-custom-event-detail.page.html`
- Create: `frontend/src/app/features/admin-custom-event-detail/admin-custom-event-detail.page.scss`
- Create: `frontend/src/app/features/admin-custom-event-detail/admin-custom-event-detail.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.ts`

**Interfaces:**
- Produces: admin quotation queue, detail, versioned line-item editor, clarification, send, and rejection controls.

- [ ] **Step 1: Write failing tests** for queue filtering, empty/error/loading states, line math, invalid quote prevention, send confirmation, superseded history, clarification/rejection reasons, and duplicate action prevention.
- [ ] **Step 2: Implement the compact operational queue and detail workspace** using existing admin-shell patterns and accessible tables/forms.
- [ ] **Step 3: Add routes and admin navigation without changing existing booking URLs.**
- [ ] **Step 4: Run focused Angular tests; expect PASS.**
- [ ] **Step 5: Commit `feat: add admin quotation workspace`.**

### Task 9: End-To-End And Release Verification

**Files:**
- Create: `backend/e2e/custom-event-quotation.e2e.ts`
- Modify: `backend/package.json`
- Modify: `frontend/e2e/app.spec.ts`
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`

**Interfaces:**
- Consumes: all preceding APIs and screens.
- Produces: reproducible backend and browser acceptance coverage.

- [ ] **Step 1: Add SQL-backed E2E coverage** for submit, quote, supersede, accept, decline, ownership, capacity rollback, and double-accept concurrency.
- [ ] **Step 2: Add Playwright customer/admin journeys** including loading and failed-request interception plus 390/768/1024/1440 layout checks.
- [ ] **Step 3: Run backend unit tests, E2E tests, and build; expect PASS.**
- [ ] **Step 4: Run Angular tests and production build with Node 22.22.3; expect PASS.**
- [ ] **Step 5: Run Playwright and inspect screenshots for overlap, clipping, and horizontal scroll; expect PASS.**
- [ ] **Step 6: Update the readiness audit with verified behavior and remaining SMTP/payment-gateway limitations.**
- [ ] **Step 7: Commit `test: verify custom quotation workflow`.**
