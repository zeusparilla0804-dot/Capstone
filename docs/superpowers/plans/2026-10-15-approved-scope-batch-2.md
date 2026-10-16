# Approved Scope Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add paper-aligned customer account administration, reservation/payment reporting, and a configurable Messenger contact action without expanding beyond the LA Chef reservation and billing system.

**Architecture:** Add one forward-only customer-status migration, focused customer-admin and admin-report backend modules behind the existing admin middleware, and matching Angular extensions. Backend queries own validation, filtering, totals, and CSV content; Angular owns responsive presentation and print styling. Messenger is a public frontend configuration rendered globally except on admin routes.

**Tech Stack:** Angular 22 standalone components, TypeScript, RxJS, Express 5 ES modules, Microsoft SQL Server 2022, Node test runner through `tsx`, Vitest/Angular TestBed, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-approved-scope-batch-2-design.md`

## Global Constraints

- Preserve the established Angular, Express, and SQL Server architecture.
- Keep every new administration endpoint behind `requireAdmin`.
- Never return password hashes, session tokens, or password-reset tokens.
- Preserve all reservation, invoice, payment, notification, and audit history when a customer is deactivated.
- Do not add inventory, payroll, staff scheduling, delivery, profit, general-ledger, or automated gateway functionality.
- Use the existing white, near-black, and restrained-gold visual system and verify phone, tablet, laptop, and desktop layouts.
- Add no real credentials; the Messenger URL is public configuration, not a secret.
- Do not push, deploy, or create a release commit during implementation. The current worktree is shared and already contains uncommitted work.

## Review Focus

- A duplicate or case-variant email update must return `409` without partially changing the customer or audit history; covered by Task 2 service/repository tests.
- A deactivation failure during session revocation or audit insertion must roll back the status change; covered by Task 2 transaction tests.
- Missing, reversed, malformed, or over-366-day report ranges must return `400`, while a valid empty range returns zero totals and an empty list; covered by Task 4 service tests.
- Payment totals must count each billing record once even when several payment transactions exist; covered by Task 4 repository and SQL E2E tests.
- Messenger configuration that is empty, malformed, or used on an `/admin/*` route must render no floating action; covered by Task 6 component tests.

---

### Task 1: Customer Account Status Schema And Authentication Enforcement

**Files:**
- Create: `backend/migrations/015_customer_account_status.sql`
- Create: `backend/src/migrations/customer-account-status-schema.test.ts`
- Modify: `backend/src/migrations/schema-contract.ts`
- Modify: `backend/src/migrations/schema-contract.test.ts`
- Modify: `backend/src/repositories/auth.repository.ts`
- Modify: `backend/src/repositories/auth.repository.test.ts`

**Interfaces:**
- Produces: `dbo.CUSTOMER.status nvarchar(20) NOT NULL`, constrained to `ACTIVE | INACTIVE`, defaulting existing and new rows to `ACTIVE`.
- Produces: authentication repository behavior that accepts only active customers for password login and session lookup.

- [x] **Step 1: Write failing migration-contract tests**

Add assertions that migration `015` is forward-only and idempotent, creates `DF_CUSTOMER_status`, `CK_CUSTOMER_status`, and `IX_CUSTOMER_status`, and that `schema-contract.ts` expects the new column, constraints, and index.

- [x] **Step 2: Run the focused schema tests and confirm failure**

Run: `npx tsx --test src/migrations/customer-account-status-schema.test.ts src/migrations/schema-contract.test.ts` from `backend`.

Expected: FAIL because migration `015` and the CUSTOMER status contract do not exist.

- [x] **Step 3: Add migration `015_customer_account_status.sql` and update the schema contract**

The migration adds `status` with `WITH VALUES`, default `ACTIVE`, an allowed-value check, and a status index without modifying business records.

- [x] **Step 4: Write failing authentication repository tests**

Assert that both credential lookup and session lookup SQL include `c.status='ACTIVE'`, and that inactive records resolve as unauthenticated.

- [x] **Step 5: Enforce active-customer authentication**

Modify `findCustomerCredentials(email)` and `findCustomerBySession(tokenHash)` to require an active customer while leaving registration inserts dependent on the database default.

- [x] **Step 6: Run focused tests**

Run: `npx tsx --test src/migrations/customer-account-status-schema.test.ts src/migrations/schema-contract.test.ts src/repositories/auth.repository.test.ts` from `backend`.

Expected: all focused tests PASS.

### Task 2: Administrator Customer Maintenance API

**Files:**
- Create: `backend/src/types/customer-admin.types.ts`
- Create: `backend/src/repositories/customer-admin.repository.ts`
- Create: `backend/src/repositories/customer-admin.repository.test.ts`
- Create: `backend/src/services/customer-admin.service.ts`
- Create: `backend/src/services/customer-admin.service.test.ts`
- Create: `backend/src/controllers/customer-admin.controller.ts`
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/routes/admin.routes.ts`
- Modify: `backend/src/types/admin.types.ts`
- Modify: `backend/src/services/admin-operations.service.test.ts`
- Modify: `backend/e2e/admin-operations.e2e.ts`

**Interfaces:**
- Produces: `CustomerAccountStatus = 'ACTIVE' | 'INACTIVE'`.
- Produces: `CustomerProfileUpdateInput { firstName; lastName; phone; email }`.
- Produces: `customerAdminService.updateProfile(adminId, customerId, raw)` and `customerAdminService.setStatus(adminId, customerId, rawStatus)`.
- Produces: `PATCH /api/admin/customers/:id` and `PATCH /api/admin/customers/:id/status`.
- Changes: admin customer list/detail records include `status`.

- [x] **Step 1: Write failing service tests for validation and repository outcomes**

Cover normalized names, lowercase email, trimmed phone, invalid fields, invalid status, unknown customer `404`, duplicate email `409`, and successful results that never contain password data.

- [x] **Step 2: Run the service test and confirm failure**

Run: `npx tsx --test src/services/customer-admin.service.test.ts` from `backend`.

Expected: FAIL because the service and types do not exist.

- [x] **Step 3: Implement customer input types and `createCustomerAdminService(deps)`**

Use existing `identifier`, `text`, and `emailAddress` validators. Limit first/last names to 100 characters and phone to 30 characters. Map duplicate-key repository errors to `409 Email is already in use.`.

- [x] **Step 4: Write failing repository transaction tests**

Assert `updateProfile(adminId, customerId, input)` locks the customer, updates allowed fields only, and writes `CUSTOMER_UPDATED`; assert `setStatus(...)` writes `CUSTOMER_DEACTIVATED` or `CUSTOMER_ACTIVATED`, deletes only that customer's `AUTH_SESSION` rows when becoming inactive, and rolls back every change on failure.

- [x] **Step 5: Implement `createCustomerAdminRepository(deps)` and production dependencies**

Use `sql.Transaction`, `UPDLOCK,HOLDLOCK`, parameterized queries, and `writeAdminAudit(..., request)`. Return `undefined` for a missing customer and the sanitized updated record otherwise.

- [x] **Step 6: Wire controllers and admin routes**

Add controller handlers returning the established `{ success, data }` envelope. Register the two PATCH routes before `GET /customers/:id`, and retain the router-wide `requireAdmin` guard.

- [x] **Step 7: Include status in existing customer reads**

Update `admin.repository.ts` customer list/detail SELECTs and shared backend types so list and detail responses expose only `ACTIVE | INACTIVE`.

- [x] **Step 8: Add SQL E2E coverage**

Exercise profile update, duplicate email rejection, deactivation, revoked session rejection, preserved reservation/payment history, and reactivation. Clean up only test-owned rows using existing E2E cleanup conventions.

- [x] **Step 9: Run focused and integration tests**

Run: `npx tsx --test src/services/customer-admin.service.test.ts src/repositories/customer-admin.repository.test.ts src/services/admin-operations.service.test.ts` from `backend`.

Run: `npx tsx e2e/admin-operations.e2e.ts` from `backend` against the migrated local test database.

Expected: all focused tests and customer-maintenance E2E journeys PASS.

### Task 3: Administrator Customer Maintenance UI

**Files:**
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/core/services/admin.service.ts`
- Modify: `frontend/src/app/core/services/admin.service.spec.ts`
- Modify: `frontend/src/app/features/admin-customers/admin-customers.page.html`
- Modify: `frontend/src/app/features/admin-customer-detail/admin-customer-detail.page.ts`
- Modify: `frontend/src/app/features/admin-customer-detail/admin-customer-detail.page.html`
- Modify: `frontend/src/app/features/admin-customer-detail/admin-customer-detail.page.scss`
- Modify: `frontend/src/app/features/admin-customer-detail/admin-customer-detail.page.spec.ts`

**Interfaces:**
- Consumes: Task 2 customer profile and status endpoints.
- Produces: `AdminCustomerStatus`, `AdminCustomerUpdateInput`, `AdminService.updateCustomer(...)`, and `AdminService.updateCustomerStatus(...)`.

- [x] **Step 1: Write failing HTTP service tests**

Assert profile updates send PATCH to `/admin/customers/:id` and status updates send `{ status: 'ACTIVE' | 'INACTIVE' }` to `/admin/customers/:id/status`, both with credentials.

- [x] **Step 2: Add frontend types and AdminService methods**

Extend `AdminCustomer` and `AdminCustomerProfile` with `status`, then implement the two typed service methods.

- [x] **Step 3: Write failing page tests**

Cover populated editable fields, valid save payload, duplicate/server error copy, confirmation cancellation, disabled/loading status action, successful deactivation state refresh, and absence of password controls.

- [x] **Step 4: Implement the customer maintenance interface**

Use Angular reactive forms on the existing detail page. Place account status and edit actions above immutable booking/payment history, use an accessible confirmation dialog for activation changes, and keep profile/history error states independent.

- [x] **Step 5: Add status visibility to the customer list**

Add a compact status column/badge without adding row-level destructive controls; account changes remain on the detail screen.

- [x] **Step 6: Make the detail controls responsive**

Use stable two-column desktop fields and one-column mobile fields; ensure dialog buttons and status controls do not overflow at 390px.

- [x] **Step 7: Run focused Angular tests**

Run: `npm.cmd test -- --watch=false --include=src/app/core/services/admin.service.spec.ts --include=src/app/features/admin-customer-detail/admin-customer-detail.page.spec.ts` from `frontend`.

Expected: all selected tests PASS.

### Task 4: Reservation And Payment Report APIs

**Files:**
- Create: `backend/src/types/admin-report.types.ts`
- Create: `backend/src/repositories/admin-report.repository.ts`
- Create: `backend/src/repositories/admin-report.repository.test.ts`
- Create: `backend/src/services/admin-report.service.ts`
- Create: `backend/src/services/admin-report.service.test.ts`
- Create: `backend/src/controllers/admin-report.controller.ts`
- Create: `backend/src/controllers/admin-report.controller.test.ts`
- Modify: `backend/src/routes/admin.routes.ts`
- Modify: `backend/e2e/admin-operations.e2e.ts`

**Interfaces:**
- Produces: `ReservationReportQuery { dateFrom; dateTo; status; eventType }`.
- Produces: `PaymentReportQuery { dateFrom; dateTo; status; method }`.
- Produces: `AdminReservationReport` with filters, `{ reservationCount, totalGuests }`, filtered detail items, and a dedicated `upcomingItems` list limited to future `APPROVED | CONFIRMED` reservations in the selected range.
- Produces: `AdminPaymentReport` with filters, `{ totalBilled, verifiedPayments, outstandingBalance }`, and detail items.
- Produces: JSON endpoints `/api/admin/reports/reservations` and `/api/admin/reports/payments`.
- Produces: CSV endpoints `/api/admin/reports/reservations/export` and `/api/admin/reports/payments/export`.

- [x] **Step 1: Write failing report-query validation tests**

Assert strict ISO dates, required paired boundaries, inclusive ranges, `dateFrom <= dateTo`, maximum 366 days, allowed statuses/methods, default current-month range when both dates are omitted, and zeroed valid empty results.

- [x] **Step 2: Implement report types and `parseReservationReportQuery` / `parsePaymentReportQuery`**

Inject a clock for deterministic current-month defaults. Keep event type as normalized text and validate status/method against database enums.

- [x] **Step 3: Write failing repository tests for parameterization and aggregation**

Reservation filtering uses `RESERVATION.event_date`. Payment filtering uses `INVOICE.issued_at` as the billing-period date and returns one row per reservation/payment aggregate; `PAYMENT_TRANSACTION` must not multiply billed or outstanding totals. Verify all SQL values are parameters.

- [x] **Step 4: Implement the report repository**

Reservation rows contain reference, customer, event date/time, event type, guest count, venue, package, and status; the upcoming query reuses that row shape and adds only future `APPROVED | CONFIRMED` rows within the selected range. Payment rows contain invoice/reference, customer, invoice issued date, latest payment date, method, amount due, amount paid, outstanding balance, and payment status. Convert decimal values to finite numbers at the repository boundary.

- [x] **Step 5: Write failing CSV tests**

Assert stable headers, UTF-8 text, CRLF rows, escaped quotes/commas/newlines, formula-injection neutralization for cells beginning with `=`, `+`, `-`, or `@`, and no secret fields.

- [x] **Step 6: Implement JSON and CSV report service methods**

Expose `reservationReport(raw)`, `paymentReport(raw)`, `reservationCsv(raw)`, and `paymentCsv(raw)`. CSV methods consume the same normalized report objects returned by JSON methods.

- [x] **Step 7: Wire report controllers and routes**

JSON handlers return the standard envelope. Export handlers set `Content-Type: text/csv; charset=utf-8` and a dated attachment filename. Register `/export` before any parameterized report route.

- [x] **Step 8: Add SQL E2E report assertions**

Seed test-owned reservations, invoices, and multiple payment transactions. Verify date/status/type/method filters, boundary inclusion, non-duplicated totals, outstanding balance, empty ranges, authorization, and CSV output.

- [x] **Step 9: Run focused and E2E tests**

Run: `npx tsx --test src/services/admin-report.service.test.ts src/repositories/admin-report.repository.test.ts src/controllers/admin-report.controller.test.ts` from `backend`.

Run: `npx tsx e2e/admin-operations.e2e.ts` from `backend`.

Expected: report unit tests and SQL journeys PASS.

### Task 5: Responsive Admin Reports Workspace

**Files:**
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/core/services/admin.service.ts`
- Modify: `frontend/src/app/core/services/admin.service.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.ts`
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.html`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.ts`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.spec.ts`
- Create: `frontend/src/app/features/admin-reports/admin-reports.page.ts`
- Create: `frontend/src/app/features/admin-reports/admin-reports.page.html`
- Create: `frontend/src/app/features/admin-reports/admin-reports.page.scss`
- Create: `frontend/src/app/features/admin-reports/admin-reports.page.spec.ts`
- Modify: `frontend/e2e/admin-operations.spec.ts`

**Interfaces:**
- Consumes: Task 4 report JSON and CSV endpoints.
- Produces: `/admin/reports`, guarded by `adminGuard`, with Reservation and Payment tabs.
- Produces: `AdminService.reservationReport`, `paymentReport`, `exportReservationReport`, and `exportPaymentReport`.

- [x] **Step 1: Write failing service and route tests**

Assert typed filter parameters, credentialed JSON calls, blob export calls, and an admin-guarded lazy `/admin/reports` route.

- [x] **Step 2: Add report models and service methods**

Mirror Task 4 response contracts exactly. Export methods use `responseType: 'blob'` and never encode filters into unsafe path segments.

- [x] **Step 3: Write failing page behavior tests**

Cover current-month defaults, tab switching, filter submission, validation response, loading lock, independent empty/error/retry states, summary totals, CSV filename/download cleanup, and `window.print()`.

- [x] **Step 4: Implement the Reports page**

Use one page with an accessible tablist and tab panels. Each tab has its own filter state and request state. Reservation reports show count, guest total, a compact upcoming-events section, and the filtered table; payment reports show three financial metrics and the filtered table. Preserve active filters when switching tabs.

- [x] **Step 5: Add CSV and print actions**

Create/revoke object URLs for downloads. Add print-only report title, selected filters, generation timestamp, summaries, and rows while hiding admin navigation and controls.

- [x] **Step 6: Add responsive report presentation**

Use standard tables on desktop and labeled stacked records on narrow screens. Keep filters and action controls usable at 390px, 768px, 1024px, and 1440px without horizontal page overflow.

- [x] **Step 7: Add Reports to admin navigation**

Extend the dashboard icon union/template with a report icon and add `{ label: 'Reports', route: '/admin/reports', icon: 'reports' }` after Billing & Payments. Update the exact primary-navigation expectation.

- [x] **Step 8: Add browser coverage**

Mock or seed authenticated admin report responses, verify filters/tabs/empty/error states and CSV request behavior, and capture responsive assertions at the existing Playwright viewports.

- [x] **Step 9: Run focused Angular and Playwright tests**

Run: `npm.cmd test -- --watch=false --include=src/app/features/admin-reports/admin-reports.page.spec.ts --include=src/app/core/services/admin.service.spec.ts --include=src/app/shared/components/admin-shell/admin-shell.spec.ts --include=src/app/app.routes.spec.ts` from `frontend`.

Run: `npx playwright test e2e/admin-operations.spec.ts` from `frontend` with the existing fixture services.

Expected: selected unit tests and admin browser workflows PASS.

### Task 6: Configurable Messenger Contact Action

**Files:**
- Modify: `frontend/src/environments/environment.ts`
- Modify: `frontend/src/environments/environment.development.ts`
- Create: `frontend/src/app/shared/components/messenger-contact/messenger-contact.ts`
- Create: `frontend/src/app/shared/components/messenger-contact/messenger-contact.html`
- Create: `frontend/src/app/shared/components/messenger-contact/messenger-contact.scss`
- Create: `frontend/src/app/shared/components/messenger-contact/messenger-contact.spec.ts`
- Modify: `frontend/src/app/app.ts`
- Modify: `frontend/src/app/app.html`
- Modify: `frontend/src/app/app.spec.ts`
- Modify: `frontend/e2e/app.spec.ts`

**Interfaces:**
- Produces: public `environment.messengerUrl`, initially `https://www.facebook.com/share/1F8DnqJnB9/`.
- Produces: `MessengerContactComponent`, visible only when the URL is valid HTTPS and the current route does not begin with `/admin`.

- [x] **Step 1: Write failing component tests**

Assert correct href, `_blank`, `rel="noopener noreferrer"`, accessible name, hiding on admin routes, hiding for invalid/empty configuration, and route-change updates without reload.

- [x] **Step 2: Implement the shared component**

Use `Router` navigation events with lifecycle-safe cleanup. Render a compact Messenger-branded action with concise visible copy on larger screens and an icon-only accessible presentation on narrow screens.

- [x] **Step 3: Mount it once at the application root**

Import it into `App`, place it after `router-outlet`, and update root tests so public/customer pages render it while admin pages do not.

- [x] **Step 4: Implement collision-safe responsive styling**

Respect safe-area insets, use a fixed hit target of at least 44px, avoid mobile navigation/form actions, include focus-visible styles, and disable nonessential transition under reduced motion.

- [x] **Step 5: Add browser assertions**

Verify visibility and destination on a public page and customer route, invisibility on an admin route, and no overlap with viewport edges at 390px and 1440px.

- [x] **Step 6: Run focused tests**

Run: `npm.cmd test -- --watch=false --include=src/app/shared/components/messenger-contact/messenger-contact.spec.ts --include=src/app/app.spec.ts` from `frontend`.

Run: `npx playwright test e2e/app.spec.ts` from `frontend`.

Expected: component, root, and browser tests PASS.

### Task 7: Full Verification And Documentation Reconciliation

**Files:**
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`
- Modify: `docs/RELEASE.md`
- Create: `.superpowers/sdd/2026-10-15-approved-scope-batch-2/progress.md`

**Interfaces:**
- Consumes: completed Tasks 1-6.
- Produces: reproducible verification evidence and an honest remaining-risk assessment.

- [x] **Step 1: Run all backend verification**

Run: `npm.cmd run build` from `backend`.

Run: `npm.cmd test` from `backend`.

Run: `npm.cmd run test:e2e` from `backend` against the migrated local test database.

Expected: build and all applicable backend tests PASS; intentional skips are recorded exactly.

- [x] **Step 2: Run all frontend verification**

Run: `npm.cmd run build` from `frontend`.

Run: `npm.cmd test -- --watch=false` from `frontend`.

Run: `npm.cmd run test:e2e` from `frontend` with fixture services running.

Expected: production build, Angular tests, and Playwright suite PASS. Existing budget warnings are reported rather than hidden.

- [x] **Step 3: Perform targeted responsive and accessibility inspection**

Inspect customer detail, both report tabs, confirmation dialog, CSV/print controls, and Messenger at 390x844, 768x1024, 1024x768, and 1440x900. Confirm no clipping, overlap, inaccessible focus, or unintended horizontal page scrolling.

- [x] **Step 4: Re-scan security and scope**

Run secret-pattern and scope scans over changed files. Confirm no credentials, password fields, non-admin report access, out-of-scope modules, or Messenger conversation storage were introduced.

- [x] **Step 5: Update release evidence**

Record commands, counts, warnings, migration `015` status, responsive results, and unresolved blockers in the progress ledger and production-readiness documents. Do not declare production readiness if any critical flow remains unverified.

- [x] **Step 6: Review the final diff without committing**

Use `git status --short` and scoped diffs to separate Batch 2 files from pre-existing worktree changes. Do not stage, commit, push, or deploy unless the user explicitly requests it later.
