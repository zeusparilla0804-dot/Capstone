# Paper Scope Alignment Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the visible LA Chef product and its billing state machine with the approved reservation-and-billing scope, including an enforced 50% reservation deposit and non-destructive retirement of new custom-quotation requests.

**Architecture:** Introduce one backend reservation-deposit policy and use it in both payment-proof verification and administrator-recorded payments. Keep frontend preview calculations local but pin them to the same 50% rule with contract tests. Remove quotation creation and navigation entry points while preserving existing quotation data and authenticated read/history routes until data classification is complete.

**Tech Stack:** Angular 22 standalone components, TypeScript, Vitest, Playwright, Node.js/Express ES modules, node:test, Microsoft SQL Server 2022.

**Spec:** `docs/superpowers/specs/2026-10-15-approved-paper-scope-alignment-design.md`

## Global Constraints

- The canonical product boundary is **Web-Based Reservation and Billing System for LA Chef Event Catering Services**.
- Standard reservation down payment is exactly **50% of the reservation total**, rounded to currency cents.
- Backend payment state is authoritative; a verified partial payment below 50% must not make a reservation confirmable.
- Supported release payment methods remain cash, bank transfer, and e-wallet/GCash with manual verification.
- Do not add or imply a live payment gateway.
- Do not drop quotation tables, rewrite applied migrations, or delete quotation records in this batch.
- Keep password recovery, session security, audit writes, outbox retries, proof privacy, and transaction locking intact.
- Preserve responsive behavior at 390, 768, 1024, and 1440 pixels.
- Use Node.js `>=22.22.3`.

## Review Focus

- A payment one cent below the required deposit must remain awaiting payment; the exact threshold must advance to payment verified.
- Multiple verified partial payments must use the cumulative paid amount, not only the newest proof amount.
- Administrator-recorded payment and customer proof verification must follow the same threshold and lock order.
- Old direct quotation-creation URLs must not create records, while existing authenticated quotation details remain readable.
- Navigation removal must not break package selection, pending reservation editing, invoices, proof upload, or contextual email/audit links.

---

## File Structure

### New Files

- `backend/src/services/reservation-billing-policy.ts` - 50% deposit constants and cent-safe threshold functions.
- `backend/src/services/reservation-billing-policy.test.ts` - boundary and rounding tests for the policy.

### Billing Files To Modify

- `backend/src/services/payment-verification.service.ts` - choose the post-review reservation status using cumulative verified payments.
- `backend/src/services/payment-verification.service.test.ts` - proof verification below, at, and above the threshold.
- `backend/src/repositories/admin.repository.ts` - apply the same threshold to manual payments.
- `backend/src/repositories/manual-payment.repository.test.ts` - manual payment threshold and state tests.
- `backend/src/types/admin.types.ts` - expose required and remaining deposit in payment review context.
- `frontend/src/app/core/services/booking-calculation.service.ts` - default all standard estimates to 50%.
- `frontend/src/app/core/services/booking-calculation.service.spec.ts` - 50% package-pricing expectations.
- `frontend/src/app/core/models/admin.model.ts` - type authoritative proof-review deposit fields.
- `frontend/src/app/features/admin-payment-review/admin-payment-review.page.html` - show required and remaining deposit.
- `frontend/src/app/features/admin-payment-review/admin-payment-review.page.spec.ts` - render threshold guidance.
- `frontend/src/app/features/booking/booking.page.html` - display the 50% requirement.
- `frontend/src/app/features/booking/booking.page.spec.ts` - assert billing copy and supported methods.
- `frontend/src/app/features/checkout/checkout.page.html` - display the 50% requirement.

### Scope And Navigation Files To Modify

- `frontend/src/app/shared/navigation/customer-navigation.ts` - remove Custom Event and rename My Bookings to My Reservations.
- `frontend/src/app/shared/components/admin-shell/admin-shell.ts` - focus primary navigation on reservations and billing; hide technical modules.
- `frontend/src/app/features/admin-packages/admin-packages.page.html` - expose Packages and Add-ons as one catalog workspace.
- `frontend/src/app/features/admin-addons/admin-addons.page.html` - expose the same catalog workspace navigation.
- `frontend/src/app/features/packages/packages.page.ts` - send every selectable package into the standard reservation flow.
- `frontend/src/app/features/packages/packages.page.html` - remove quotation promotions and use special-request-oriented reservation copy.
- `frontend/src/app/features/packages/packages.page.spec.ts` - assert there are no quotation creation links.
- `frontend/src/app/app.routes.ts` - redirect the retired `/custom-event` creation page to `/packages`; preserve authenticated history detail routes.
- `backend/src/routes/custom-event.routes.ts` - return `410 Gone` for new request creation while retaining authenticated detail and existing-record decision routes.
- `backend/src/routes/custom-event.routes.test.ts` - prove creation is retired and authenticated detail behavior is preserved.
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.html` - replace quotation terminology with review, billing, and payment terminology.
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.ts` - rename progress semantics without changing reservation status behavior.
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.spec.ts` - verify the paper-aligned progress labels.
- `frontend/src/app/features/my-bookings/my-bookings.page.html` - use My Reservations and reservation copy.
- `frontend/src/app/features/booking/components/booking-stepper/booking-stepper.html` - use Reservation progress in accessible text.
- `frontend/src/app/features/admin-bookings/admin-bookings.page.html` - use Reservations in visible headings.
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html` - use reservation terminology in visible actions and guidance.

### Regression And Documentation Files To Modify

- `frontend/e2e/admin-operations.spec.ts` - assert focused admin navigation and absence of quotation entry points.
- `frontend/e2e/app.spec.ts` - assert 50% estimate, supported payment choices, and no custom quotation CTA.
- `docs/PRODUCTION_READINESS_AUDIT.md` - record the scope alignment and remaining batches only after verification passes.
- `docs/RELEASE.md` - record the 50% billing rule and retired quotation creation.

---

### Task 1: Establish The Authoritative 50% Deposit Policy

**Files:**
- Create: `backend/src/services/reservation-billing-policy.ts`
- Create: `backend/src/services/reservation-billing-policy.test.ts`

**Interfaces:**
- Produces: `RESERVATION_DEPOSIT_RATE: 0.5`
- Produces: `requiredReservationDeposit(total: number): number`
- Produces: `hasRequiredReservationDeposit(total: number, amountPaid: number): boolean`

- [ ] **Step 1: Write the failing policy tests**

Cover `requiredReservationDeposit(1000) === 500`, cent rounding for an odd-cent total, one cent below the threshold returning `false`, the exact threshold returning `true`, and cumulative overpayment returning `true`.

- [ ] **Step 2: Run the focused backend test and verify RED**

Run: `npm.cmd test -- --test-name-pattern="reservation billing policy"`

Working directory: `backend`

Expected: FAIL because `reservation-billing-policy.ts` does not exist.

- [ ] **Step 3: Implement the policy**

Use integer-cent comparisons. Reject non-finite or negative inputs with `AppError(500, ...)` because these helpers consume already-validated server values and invalid values indicate an internal contract violation.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --test-name-pattern="reservation billing policy"`

Expected: all policy tests pass.

- [ ] **Step 5: Commit the policy unit**

```bash
git add backend/src/services/reservation-billing-policy.ts backend/src/services/reservation-billing-policy.test.ts
git commit -m "feat: enforce reservation deposit policy"
```

### Task 2: Enforce The Threshold In Proof And Manual Payment Workflows

**Files:**
- Modify: `backend/src/services/payment-verification.service.ts`
- Modify: `backend/src/services/payment-verification.service.test.ts`
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/repositories/manual-payment.repository.test.ts`
- Modify: `backend/src/types/admin.types.ts`

**Interfaces:**
- Consumes: `requiredReservationDeposit(total)` and `hasRequiredReservationDeposit(total, amountPaid)` from Task 1.
- Produces: proof-review payment context fields `requiredDeposit: number` and `remainingDeposit: number`.
- Produces: reservation status `PAYMENT_VERIFIED` only when cumulative verified/recorded payment reaches 50%; otherwise `AWAITING_PAYMENT`.

- [ ] **Step 1: Add failing proof-verification tests**

Add named cases proving that cumulative paid amount one cent below 50% returns the reservation to `AWAITING_PAYMENT`, the exact threshold advances it to `PAYMENT_VERIFIED`, and a second proof uses the pre-existing paid amount in the threshold decision. Assert proof status is still `VERIFIED` for a valid partial credit.

- [ ] **Step 2: Add failing administrator-recorded payment tests**

Extend the manual-payment database double so `amount_due` and `amount_paid` are configurable. Prove a partial amount below 50% remains `AWAITING_PAYMENT`, the exact cumulative threshold advances to `PAYMENT_VERIFIED`, and a payment recorded on an already verified/confirmed reservation does not regress status.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm.cmd test -- --test-name-pattern="deposit|manual payment|payment proof"`

Working directory: `backend`

Expected: threshold assertions fail because both workflows currently advance any positive verified amount.

- [ ] **Step 4: Update proof verification**

After calculating `paidCents + verifiedCents`, choose `PAYMENT_VERIFIED` only when the cumulative amount satisfies `hasRequiredReservationDeposit(amountDue, cumulativePaid)`. Otherwise transition `PAYMENT_SUBMITTED -> AWAITING_PAYMENT`. Keep the proof credit, invoice partial-payment state, notification, audit record, and transaction atomic.

- [ ] **Step 5: Update administrator-recorded payments**

Within the existing reservation-then-payment lock order, compute cumulative payment and transition only when required: `AWAITING_PAYMENT/PAYMENT_SUBMITTED -> PAYMENT_VERIFIED` at the threshold, `PAYMENT_SUBMITTED -> AWAITING_PAYMENT` below it, and no booking transition for below-threshold `AWAITING_PAYMENT` or already later statuses. Preserve proof superseding and audit/outbox writes.

- [ ] **Step 6: Return authoritative deposit guidance for proof review**

Extend `ProofReviewDetail.payment` with `requiredDeposit` and `remainingDeposit`. Calculate both from locked/read payment totals with cent-safe helpers; never trust a browser-supplied threshold.

- [ ] **Step 7: Run focused and complete backend tests**

Run: `npm.cmd test -- --test-name-pattern="deposit|manual payment|payment proof"`

Then: `npm.cmd test`

Expected: focused cases pass and the full backend suite has no regression.

- [ ] **Step 8: Commit the backend workflow**

```bash
git add backend/src/services/payment-verification.service.ts backend/src/services/payment-verification.service.test.ts backend/src/repositories/admin.repository.ts backend/src/repositories/manual-payment.repository.test.ts backend/src/types/admin.types.ts
git commit -m "fix: require half deposit before confirmation"
```

### Task 3: Align Frontend Billing Estimates And Payment Guidance

**Files:**
- Modify: `frontend/src/app/core/services/booking-calculation.service.ts`
- Modify: `frontend/src/app/core/services/booking-calculation.service.spec.ts`
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/features/booking/booking.page.html`
- Modify: `frontend/src/app/features/booking/booking.page.spec.ts`
- Modify: `frontend/src/app/features/checkout/checkout.page.html`
- Modify: `frontend/src/app/features/admin-payment-review/admin-payment-review.page.html`
- Modify: `frontend/src/app/features/admin-payment-review/admin-payment-review.page.spec.ts`

**Interfaces:**
- Produces: frontend `RESERVATION_DEPOSIT_RATE = 0.5` used as the default calculation rate.
- Consumes: `requiredDeposit` and `remainingDeposit` from the admin proof-review API.

- [ ] **Step 1: Change tests to the approved 50% expectations**

For a PHP 70,000 total, assert PHP 35,000 required deposit and PHP 35,000 remaining balance. Add a booking-page rendering assertion for `Down Payment (50%)`. Assert the payment choices are exactly Cash, Bank Transfer, and GCash, with no credit/debit-card option.

- [ ] **Step 2: Add a failing admin-review rendering test**

Supply `amountDue`, `amountPaid`, `requiredDeposit`, and `remainingDeposit`; assert the review screen distinguishes total outstanding balance from the amount still required to secure the reservation.

- [ ] **Step 3: Run focused Angular tests and verify RED**

Run: `npm.cmd test -- --watch=false --include="src/app/core/services/booking-calculation.service.spec.ts" --include="src/app/features/booking/booking.page.spec.ts" --include="src/app/features/admin-payment-review/admin-payment-review.page.spec.ts"`

Working directory: `frontend`

Expected: old 30% defaults/copy and missing proof context fail.

- [ ] **Step 4: Implement the 50% frontend default and copy**

Keep the optional rate parameter for explicit calculation tests, but make the exported/default standard rate 0.5. Update booking review and checkout text. Do not change package base/per-head price formulas.

- [ ] **Step 5: Render authoritative admin deposit guidance**

Display required deposit, verified amount, remaining amount to secure the reservation, and full outstanding balance as distinct labeled values. Keep currency formatting and mobile layout behavior.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the same focused Angular command.

Expected: all selected tests pass.

- [ ] **Step 7: Commit the frontend billing alignment**

```bash
git add frontend/src/app/core/services/booking-calculation.service.ts frontend/src/app/core/services/booking-calculation.service.spec.ts frontend/src/app/core/models/admin.model.ts frontend/src/app/features/booking frontend/src/app/features/checkout/checkout.page.html frontend/src/app/features/admin-payment-review
git commit -m "feat: show approved fifty percent deposit"
```

### Task 4: Retire New Custom-Quotation Requests Without Data Loss

**Files:**
- Modify: `backend/src/routes/custom-event.routes.ts`
- Create: `backend/src/routes/custom-event.routes.test.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/features/packages/packages.page.ts`
- Modify: `frontend/src/app/features/packages/packages.page.html`
- Modify: `frontend/src/app/features/packages/packages.page.spec.ts`
- Modify: `frontend/src/app/shared/navigation/customer-navigation.ts`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.ts`

**Interfaces:**
- Produces: `POST /api/custom-events` response `410` with code `CUSTOM_QUOTATION_RETIRED` and a reservation-focused message.
- Preserves: authenticated `GET /api/custom-events/:id` and existing quote decision/history endpoints until Batch 4 data classification.
- Produces: `/custom-event` frontend redirect to `/packages`; authenticated `/custom-events/:id` remains available for existing history.

- [ ] **Step 1: Write failing backend retirement tests**

Assert authenticated and unauthenticated creation cannot reach the former controller: authenticated requests receive `410 CUSTOM_QUOTATION_RETIRED`, authentication is still required, no repository mutation occurs, and the existing owner-only detail route remains registered.

- [ ] **Step 2: Write failing package/navigation tests**

Assert customer navigation has no Custom Event item, admin primary navigation has no Quotations item, package cards route to `/book-event?package=<id>`, and the packages page contains no `/custom-event` link or quotation CTA.

- [ ] **Step 3: Run focused backend and Angular tests and verify RED**

Run backend: `npm.cmd test -- --test-name-pattern="custom quotation retired|custom event routes"`

Run frontend: `npm.cmd test -- --watch=false --include="src/app/features/packages/packages.page.spec.ts" --include="src/app/shared/components/admin-shell/admin-shell.spec.ts"`

Expected: creation and navigation assertions fail against the active workflow.

- [ ] **Step 4: Retire creation at the API boundary**

Keep `requireCustomer` before the retired handler so unauthenticated callers still receive the normal authentication response. Return `410` only for authenticated `POST /api/custom-events`. Do not touch migrations, tables, records, or existing authenticated detail/history endpoints.

- [ ] **Step 5: Remove frontend creation entry points**

Redirect `/custom-event` to `/packages`, remove quotation CTAs, route all package selection through the standard reservation flow, remove Custom Event and Quotations from primary navigation, and preserve the existing detail route for historical records.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the commands from Step 3.

Expected: all selected tests pass.

- [ ] **Step 7: Commit non-destructive retirement**

```bash
git add backend/src/routes/custom-event.routes.ts backend/src/routes/custom-event.routes.test.ts frontend/src/app/app.routes.ts frontend/src/app/features/packages frontend/src/app/shared/navigation/customer-navigation.ts frontend/src/app/shared/components/admin-shell/admin-shell.ts
git commit -m "refactor: focus product on reservations and billing"
```

### Task 5: Simplify Portal Language And Catalog Navigation

**Files:**
- Modify: `frontend/src/app/shared/navigation/customer-navigation.ts`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.ts`
- Modify: `frontend/src/app/features/admin-packages/admin-packages.page.html`
- Modify: `frontend/src/app/features/admin-addons/admin-addons.page.html`
- Modify: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.html`
- Modify: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.ts`
- Modify: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.spec.ts`
- Modify: `frontend/src/app/features/my-bookings/my-bookings.page.html`
- Modify: `frontend/src/app/features/booking/components/booking-stepper/booking-stepper.html`
- Modify: `frontend/src/app/features/admin-bookings/admin-bookings.page.html`
- Modify: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html`

**Interfaces:**
- Produces: customer labels `Dashboard`, `My Reservations`, `Billing & Payments`, `Profile`.
- Produces: primary admin labels `Overview`, `Reservations`, `Customers`, `Billing & Payments`, `Packages & Menu` plus existing bottom account actions.
- Preserves: current internal route paths and TypeScript model names to limit risk.

- [ ] **Step 1: Write failing navigation and dashboard-copy tests**

Assert exact visible primary labels, absence of Email Operations and Audit Log from the primary sidebar, absence of quotation language from the customer dashboard, and presence of reservation review/payment progress language.

- [ ] **Step 2: Run focused Angular tests and verify RED**

Run: `npm.cmd test -- --watch=false --include="src/app/features/customer-dashboard/customer-dashboard.page.spec.ts" --include="src/app/shared/components/admin-shell/admin-shell.spec.ts"`

Expected: current Bookings, Quotations, Email Operations, Audit Log, and quotation-progress labels fail.

- [ ] **Step 3: Implement the focused navigation**

Keep Email Operations and Audit Log routes available for contextual/internal access but remove them from primary navigation. Keep administrator all-device sign-out and normal logout as bottom account actions. Link Packages & Menu to `/admin/packages`, and add compact Packages/Add-ons workspace links to both catalog pages.

- [ ] **Step 4: Replace visible commerce/quotation language**

Use reservation, reservation request, package estimate, special requests, billing, deposit, and payment wording. Do not rename internal route paths, database tables, API contracts, or code symbols in this batch.

- [ ] **Step 5: Run focused and complete Angular tests**

Run the command from Step 2, then run: `npm.cmd test -- --watch=false`

Expected: all Angular tests pass.

- [ ] **Step 6: Commit the information architecture change**

```bash
git add frontend/src/app/shared frontend/src/app/features/admin-packages frontend/src/app/features/admin-addons frontend/src/app/features/customer-dashboard frontend/src/app/features/my-bookings frontend/src/app/features/booking frontend/src/app/features/admin-bookings frontend/src/app/features/admin-booking-detail
git commit -m "refactor: align portals with approved scope"
```

### Task 6: End-To-End Scope Regression And Release Notes

**Files:**
- Modify: `frontend/e2e/admin-operations.spec.ts`
- Modify: `frontend/e2e/app.spec.ts`
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`
- Modify: `docs/RELEASE.md`

**Interfaces:**
- Consumes: all Batch 1 behavior.
- Produces: browser evidence for paper-aligned navigation, 50% billing, and retired quotation creation.

- [ ] **Step 1: Add failing browser assertions**

Cover desktop and mobile customer/admin navigation, PHP total-to-50%-deposit math, exact supported payment labels, absence of quotation CTAs, `/custom-event` redirect, and continued package-to-reservation navigation.

- [ ] **Step 2: Run the focused Playwright tests**

Run: `npm.cmd run test:e2e -- --grep "approved scope|fifty percent deposit"`

Working directory: `frontend`

Expected: tests fail before all Batch 1 changes are wired.

- [ ] **Step 3: Fix only integration gaps exposed by the browser tests**

Do not introduce Batch 2 features. Preserve keyboard operation, loading/error states, focus visibility, and no horizontal overflow at all four required widths.

- [ ] **Step 4: Run the complete verification matrix**

Backend:

```bash
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
```

Frontend:

```bash
npm.cmd run build -- --configuration production
npm.cmd test -- --watch=false
npm.cmd run test:e2e
```

Expected: all builds and tests pass. Any style-budget warning is recorded accurately and is not reported as a test failure.

- [ ] **Step 5: Update release documentation**

Record the 50% deposit rule, cumulative threshold enforcement, removed quotation creation entry points, focused navigation, unchanged database records, and remaining Batch 2-4 work. Do not mark the application production-ready while SMTP, customer account controls, reports, and deployment gates remain open.

- [ ] **Step 6: Commit verified Batch 1 documentation and browser coverage**

```bash
git add frontend/e2e docs/PRODUCTION_READINESS_AUDIT.md docs/RELEASE.md
git commit -m "test: verify approved paper scope alignment"
```

---

## Deferred To Later Plans

- **Batch 2:** Messenger contact action, customer update/activation/deactivation, reservation reports, and payment reports.
- **Batch 3:** Registration and upcoming-event reminder notifications plus live SMTP staging verification.
- **Batch 4:** Classify quotation records, remove unused code safely, apply a forward schema-retirement migration only with explicit destructive approval, and repeat release readiness verification.
