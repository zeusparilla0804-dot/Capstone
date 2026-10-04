# LA Chef Booking Capacity And Date Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add paper-aligned, concurrency-safe date availability to customer booking and explicit admin capacity confirmation for 150-499 guest requests.

**Architecture:** A pure backend capacity calculator owns every threshold and status decision. A SQL snapshot repository supplies active booking aggregates with optional serializable locking; customer preview, booking creation, admin summaries, and admin approval all reuse those units. Angular consumes typed summaries and adds inline customer feedback plus an explicit medium-event admin confirmation.

**Tech Stack:** Angular 22 standalone components, RxJS 7, TypeScript, Node.js 22.22.3+, Express 5 ES modules, Microsoft SQL Server 2022, `node:test`, Vitest/Angular TestBed, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-booking-capacity-availability-design.md`

## Global Constraints

- Preserve the existing Angular, Express ES module, repository/service/controller, session, booking-state, and routing architecture.
- Capacity-consuming statuses are `PENDING`, `APPROVED`, `AWAITING_PAYMENT`, `PAYMENT_SUBMITTED`, `PAYMENT_VERIFIED`, and `CONFIRMED`.
- `REJECTED`, `CANCELLED`, and `COMPLETED` do not consume capacity.
- Daily hard ceilings are: below 150 guests = 6 events; 500-999 guests = 3 events; 1,000 or more guests = 1 event.
- Requests from 150-499 guests remain subject to explicit admin confirmation and no narrower numeric limit may be invented.
- The largest active or proposed event determines the date's hard ceiling.
- Availability preview is advisory; booking submission and admin approval must recheck under SQL Server locking.
- Do not expose another customer's identity, venue, event type, or reservation details in availability responses.
- Do not edit the project paper, change payment percentages, add capacity settings, expire pending requests, or add staff/equipment/time-slot scheduling.
- All customer and admin changes must remain responsive at 390, 768, 1024, and 1440 CSS pixels.

## Review Focus

- Boundary guest counts `149`, `150`, `499`, `500`, `999`, and `1000` must enter the correct band and status.
- A proposed large event must reduce the ceiling for a mixed date before accepting the request.
- Two simultaneous requests for the final slot must not both commit.
- A stale preview must preserve the booking draft and show a date-specific conflict instead of a generic submission error.
- Admin capacity confirmation must be required only when approving the selected 150-499 guest booking, even if another medium event makes the date summary `NEEDS_CONFIRMATION`.

## File Structure

### Backend

- Create `backend/src/types/availability.types.ts`: availability enums, snapshot, and response contracts.
- Create `backend/src/services/booking-availability.service.ts`: pure capacity calculation plus dependency-injected preview/write orchestration.
- Create `backend/src/services/booking-availability.service.test.ts`: capacity boundary and orchestration tests.
- Create `backend/src/repositories/booking-availability.repository.ts`: aggregate date snapshot query and write-lock behavior.
- Create `backend/src/repositories/booking-availability.repository.test.ts`: query, parameter, status, and lock-hint tests.
- Create `backend/migrations/010_booking_capacity_availability.sql`: idempotent supporting index.
- Modify `backend/src/migrations/admin-operations-schema.test.ts`: migration contract test.
- Modify `backend/src/utils/app-error.ts` and `backend/src/middleware/error.middleware.ts`: optional safe machine-readable error code.
- Create `backend/src/middleware/error.middleware.test.ts`: coded and uncoded error response tests.
- Modify booking controller/service/repository/routes: availability endpoint and transactional submission enforcement.
- Modify admin controller/service/repository/types and booking-status service/repository/tests: summaries and approval confirmation.
- Modify `backend/e2e/phase81.e2e.ts`: SQL-backed capacity, status release, and concurrency coverage.

### Frontend

- Create `frontend/src/app/core/models/availability.model.ts`: typed availability response.
- Modify `frontend/src/app/core/models/index.ts`: export the availability model.
- Modify booking service/spec: availability request and coded conflicts.
- Modify booking page TS/HTML/SCSS/spec: debounced status feedback, blocking, retry, and conflict recovery.
- Modify admin model/service/specs and booking detail TS/HTML/SCSS/spec: capacity summary and explicit confirmation.
- Modify browser fixture and Playwright journey: real customer/admin capacity flow and responsive checks.

---

### Task 1: Capacity Domain Model And Calculator

**Files:**
- Create: `backend/src/types/availability.types.ts`
- Create: `backend/src/services/booking-availability.service.ts`
- Create: `backend/src/services/booking-availability.service.test.ts`

**Interfaces:**
- Produces: `AvailabilityStatus = 'AVAILABLE' | 'LIMITED' | 'NEEDS_CONFIRMATION' | 'FULL'`.
- Produces: `CapacitySnapshot { activeBookingCount: number; largestGuestCount: number; hasMediumEvent: boolean }`.
- Produces: `BookingAvailability { date; guestCount; status; activeBookingCount; capacityLimit; remainingRequestSlots; requiresAdminConfirmation; message }`.
- Produces: `assessDateAvailability(input: { date: string; guestCount: number; snapshot: CapacitySnapshot; includeProposed: boolean }): BookingAvailability`.
- Consumes: no database or framework dependencies.

- [ ] **Step 1: Write failing boundary and mixed-date tests**

Add tests named for the `149/150/499/500/999/1000` boundaries. Assert ceilings `6/6/6/3/3/1`, medium requests return `NEEDS_CONFIRMATION`, a proposed request that fills the final slot returns `LIMITED` with `remainingRequestSlots: 0`, and a request exceeding the recalculated largest-event ceiling returns `FULL`.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm.cmd exec -- tsx --test src/services/booking-availability.service.test.ts`

Expected: FAIL because the availability types/calculator do not exist.

- [ ] **Step 3: Implement the pure calculator**

Implement `assessDateAvailability` with precedence `FULL`, then `NEEDS_CONFIRMATION`, then `LIMITED`, then `AVAILABLE`. `includeProposed: true` adds one request and includes `guestCount` when choosing the largest event; `false` treats the snapshot as already containing the selected booking. `requiresAdminConfirmation` depends on the selected `guestCount` being 150-499, while `hasMediumEvent` may still make the date status `NEEDS_CONFIRMATION`.

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npm.cmd exec -- tsx --test src/services/booking-availability.service.test.ts`

Expected: all capacity-domain tests PASS.

- [ ] **Step 5: Commit the domain unit**

```powershell
git add backend/src/types/availability.types.ts backend/src/services/booking-availability.service.ts backend/src/services/booking-availability.service.test.ts
git commit -m "feat: define booking capacity rules"
```

### Task 2: SQL Snapshot, Locking Index, And Coded Errors

**Files:**
- Create: `backend/src/repositories/booking-availability.repository.ts`
- Create: `backend/src/repositories/booking-availability.repository.test.ts`
- Create: `backend/migrations/010_booking_capacity_availability.sql`
- Modify: `backend/src/migrations/admin-operations-schema.test.ts`
- Modify: `backend/src/services/booking-availability.service.ts`
- Modify: `backend/src/services/booking-availability.service.test.ts`
- Modify: `backend/src/utils/app-error.ts`
- Modify: `backend/src/middleware/error.middleware.ts`
- Create: `backend/src/middleware/error.middleware.test.ts`

**Interfaces:**
- Consumes: `CapacitySnapshot`, `BookingAvailability`, and `assessDateAvailability` from Task 1.
- Produces: `readCapacitySnapshot(eventDate: string, options?: { request?: sql.Request; lock?: boolean }): Promise<CapacitySnapshot>`.
- Produces: `createBookingAvailabilityService(deps)` and singleton `bookingAvailabilityService` with `preview(date, guestCount)`, `assertCanAccept(date, guestCount, request)`, and `summarizeExisting(date, guestCount, request?)`.
- Produces: `AppError(statusCode: number, message: string, code?: string)`; middleware includes `code` only when present.

- [ ] **Step 1: Write failing repository, migration, orchestration, and error-response tests**

Use a fake `sql.Request` to assert the locked snapshot query contains `UPDLOCK,HOLDLOCK`, binds the date, counts only the six active statuses, and returns count/largest/medium aggregates. Extend the migration test to require `IX_RESERVATION_event_capacity` on `event_date,status` including `guest_count`. Test that `preview` converts dependency failures to `503 AVAILABILITY_UNAVAILABLE`, `assertCanAccept` throws `409 BOOKING_DATE_FULL`, and the error middleware serializes safe codes without changing legacy uncoded responses.

- [ ] **Step 2: Run focused backend tests and verify failure**

Run: `npm.cmd exec -- tsx --test src/repositories/booking-availability.repository.test.ts src/services/booking-availability.service.test.ts src/middleware/error.middleware.test.ts src/migrations/admin-operations-schema.test.ts`

Expected: FAIL for missing repository, migration, orchestration methods, and error code.

- [ ] **Step 3: Add the idempotent capacity index migration**

Create `IX_RESERVATION_event_capacity` on `dbo.RESERVATION(event_date,status)` with `guest_count` included, guarded by `sys.indexes`, inside the repository's established `XACT_ABORT` transaction style.

- [ ] **Step 4: Implement snapshot persistence and orchestration**

Implement one parameterized aggregate query. Add lock hints only for write checks with a supplied transaction request. Wire the dependency-injected service methods so previews do unlocked reads, submission checks use locked reads, and existing-booking summaries do not add a second proposed event.

- [ ] **Step 5: Add optional safe error codes**

Extend `AppError` and `errorHandler` without changing current status/message behavior. Keep unexpected errors as the existing generic `500` response with no internal code.

- [ ] **Step 6: Run focused tests and verify pass**

Run: `npm.cmd exec -- tsx --test src/repositories/booking-availability.repository.test.ts src/services/booking-availability.service.test.ts src/middleware/error.middleware.test.ts src/migrations/admin-operations-schema.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit persistence and error contracts**

```powershell
git add backend/migrations/010_booking_capacity_availability.sql backend/src/migrations/admin-operations-schema.test.ts backend/src/repositories/booking-availability.repository.ts backend/src/repositories/booking-availability.repository.test.ts backend/src/services/booking-availability.service.ts backend/src/services/booking-availability.service.test.ts backend/src/utils/app-error.ts backend/src/middleware/error.middleware.ts backend/src/middleware/error.middleware.test.ts
git commit -m "feat: persist booking capacity checks"
```

### Task 3: Customer Availability API And Atomic Booking Submission

**Files:**
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/repositories/booking.repository.ts`
- Create: `backend/src/controllers/booking.controller.test.ts`
- Modify: `backend/e2e/phase81.e2e.ts`

**Interfaces:**
- Consumes: `bookingAvailabilityService.preview` and `bookingAvailabilityService.assertCanAccept` from Task 2.
- Produces: authenticated `GET /api/bookings/availability?date=YYYY-MM-DD&guestCount=NUMBER`.
- Preserves: existing `POST /api/bookings` request and success response.

- [ ] **Step 1: Write failing controller contract tests**

Test a valid future ISO date and integer guest count reach `bookingService.availability`; malformed, past, zero, decimal, and over-10,000 guest inputs return `400` before service calls. Assert the route order places `/availability` before `/:id`.

- [ ] **Step 2: Extend SQL-backed E2E with failing capacity assertions**

Create a disposable package supporting 1-1,000 guests. Assert authenticated preview shape and privacy, unauthenticated `401`, the sixth sub-150 request succeeds, the seventh returns `409 BOOKING_DATE_FULL`, cancelled/rejected requests release capacity, a proposed 500-999 event applies the three-event ceiling, and a 1,000-guest request requires an empty date.

- [ ] **Step 3: Run focused tests and verify failure**

Run unit test: `npm.cmd exec -- tsx --test src/controllers/booking.controller.test.ts`

Run SQL E2E with backend started against the test database: `npm.cmd run test:e2e`

Expected: new availability assertions FAIL before implementation.

- [ ] **Step 4: Implement the customer endpoint**

Add strict query parsing, `bookingService.availability(date, guestCount)`, and the route before `/:id`. Return only the approved `BookingAvailability` fields.

- [ ] **Step 5: Enforce capacity in booking creation**

Inside the existing `createBooking` transaction, call `assertCanAccept(dto.eventDate, dto.guestCount, new sql.Request(transaction))` after package/guest validation and before inserting `RESERVATION`. Preserve rollback behavior and all existing pricing, payment, add-on, and notification writes.

- [ ] **Step 6: Run customer API and E2E tests**

Run: `npm.cmd exec -- tsx --test src/controllers/booking.controller.test.ts`

Run: `npm.cmd run test:e2e`

Expected: unit and SQL-backed capacity tests PASS.

- [ ] **Step 7: Commit customer backend behavior**

```powershell
git add backend/src/controllers/booking.controller.ts backend/src/controllers/booking.controller.test.ts backend/src/routes/booking.routes.ts backend/src/services/booking.service.ts backend/src/repositories/booking.repository.ts backend/e2e/phase81.e2e.ts
git commit -m "feat: enforce booking date availability"
```

### Task 4: Admin Capacity Summary And Approval Confirmation

**Files:**
- Modify: `backend/src/types/admin.types.ts`
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/repositories/booking-status.repository.ts`
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/src/services/booking-status.service.ts`
- Modify: `backend/src/controllers/admin.controller.ts`
- Modify: `backend/src/services/booking-status.service.test.ts`
- Modify: `backend/e2e/admin-operations.e2e.ts`

**Interfaces:**
- Consumes: `assessDateAvailability`, snapshot fields, and coded conflicts from Tasks 1-2.
- Produces: `AdminBookingCapacitySummary` on admin booking list/detail responses.
- Changes: `adminService.updateStatus(adminId, id, status, reason?, capacityConfirmed?)`.
- Changes: admin status body accepts optional literal boolean `capacityConfirmed`.

- [ ] **Step 1: Write failing status-service and controller tests**

Extend the fake locked booking row with `eventDate` and `guestCount`. Assert 150 and 499 guest approvals require literal `capacityConfirmed: true`; 149 and 500 do not. Assert over-capacity approval returns `409 CAPACITY_CHANGED`, medium approval records `capacityConfirmed: true` in admin audit values, and strings such as `"true"` are rejected.

- [ ] **Step 2: Write failing admin response tests**

Assert list/detail records include active count, hard ceiling, remaining slots, status, and selected-booking `requiresAdminConfirmation`. Include the review-focus case where another medium event makes the date status `NEEDS_CONFIRMATION` but a selected 100-guest booking does not require the special confirmation action.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm.cmd exec -- tsx --test src/services/booking-status.service.test.ts`

Expected: FAIL for missing capacity data and confirmation handling.

- [ ] **Step 4: Add admin aggregate data and response mapping**

Extend existing paginated booking/detail SQL with one date aggregate (`activeBookingCount`, `largestGuestCount`, `hasMediumEvent`) using the same active statuses. Map those fields through `assessDateAvailability(..., includeProposed: false)` and remove raw aggregate fields from API responses.

- [ ] **Step 5: Enforce approval confirmation transactionally**

Extend the locked booking read with event date and guest count. During `PENDING -> APPROVED`, read the locked capacity snapshot using the same transaction, reject `FULL`, require `capacityConfirmed === true` only for 150-499 guests, and add the confirmation value to the existing admin audit payload. Other transitions retain current behavior.

- [ ] **Step 6: Add SQL-backed admin approval coverage**

In `admin-operations.e2e.ts`, submit a medium booking, assert approval without confirmation is `400 CAPACITY_CONFIRMATION_REQUIRED`, approve with confirmation, and verify status history/audit plus capacity detail. Add a stale over-capacity approval conflict fixture.

- [ ] **Step 7: Run backend tests and E2E**

Run: `npm.cmd test`

Run: `npm.cmd run test:e2e`

Expected: all backend unit and SQL-backed E2E tests PASS.

- [ ] **Step 8: Commit admin backend behavior**

```powershell
git add backend/src/types/admin.types.ts backend/src/repositories/admin.repository.ts backend/src/repositories/booking-status.repository.ts backend/src/services/admin.service.ts backend/src/services/booking-status.service.ts backend/src/controllers/admin.controller.ts backend/src/services/booking-status.service.test.ts backend/e2e/admin-operations.e2e.ts
git commit -m "feat: add admin capacity confirmation"
```

### Task 5: Customer Availability UI And Conflict Recovery

**Files:**
- Create: `frontend/src/app/core/models/availability.model.ts`
- Modify: `frontend/src/app/core/models/index.ts`
- Modify: `frontend/src/app/core/services/booking.service.ts`
- Modify: `frontend/src/app/core/services/booking.service.spec.ts`
- Modify: `frontend/src/app/features/booking/booking.page.ts`
- Modify: `frontend/src/app/features/booking/booking.page.html`
- Modify: `frontend/src/app/features/booking/booking.page.scss`
- Modify: `frontend/src/app/features/booking/booking.page.spec.ts`
- Modify: `frontend/src/app/features/booking/booking-submission-error.ts`

**Interfaces:**
- Produces: frontend `BookingAvailability` matching the backend response.
- Produces: `BookingService.checkAvailability(date: string, guestCount: number)` returning the typed HTTP observable.
- Consumes: backend safe error codes `BOOKING_DATE_FULL`, `CAPACITY_CHANGED`, and `AVAILABILITY_UNAVAILABLE`.

- [ ] **Step 1: Write failing booking-service request tests**

Assert the service sends encoded `date` and integer `guestCount`, includes credentials, and maps the typed response without exposing unrelated data.

- [ ] **Step 2: Write failing component state tests**

Use controlled observables to cover debounced checking, stale-response cancellation, all four states, failed-check retry, final-slot `LIMITED`, and `NEEDS_CONFIRMATION` allowing continuation. Assert `Continue to Add-ons` is disabled until the current date/guest pair has a non-full successful result.

- [ ] **Step 3: Write failing stale-submission recovery test**

Make `submitDraft` reject with `409` and code `CAPACITY_CHANGED`. Assert the draft remains intact, the component returns to step 1, date feedback is focused/announced, and the backend message is shown instead of the generic error.

- [ ] **Step 4: Run focused frontend tests and verify failure**

Run: `npm.cmd test -- --watch=false`

Expected: new service/component assertions FAIL before implementation.

- [ ] **Step 5: Implement typed service and reactive page state**

Combine date and guest-count form changes with `startWith`, `debounceTime`, `distinctUntilChanged`, `switchMap`, and lifecycle-safe teardown. Track the query key with each result so an old success cannot authorize a changed form. Keep package-range validation independent of date capacity.

- [ ] **Step 6: Implement accessible responsive feedback**

Add a stable-height inline status region adjacent to date/guest controls, text plus icon for every state, `aria-live` loading/errors, and a retry button for failures. Preserve the existing editorial form design and avoid page-level horizontal overflow.

- [ ] **Step 7: Implement coded conflict recovery**

On `BOOKING_DATE_FULL` or `CAPACITY_CHANGED`, keep the draft, return to event details, invalidate/recheck the selected date, and show the server message. Preserve current behavior for validation and network failures.

- [ ] **Step 8: Run frontend tests and build**

Run: `npm.cmd test -- --watch=false`

Run: `npm.cmd run build`

Expected: all frontend tests and the Angular production build PASS.

- [ ] **Step 9: Commit customer frontend behavior**

```powershell
git add frontend/src/app/core/models/availability.model.ts frontend/src/app/core/models/index.ts frontend/src/app/core/services/booking.service.ts frontend/src/app/core/services/booking.service.spec.ts frontend/src/app/features/booking/booking.page.ts frontend/src/app/features/booking/booking.page.html frontend/src/app/features/booking/booking.page.scss frontend/src/app/features/booking/booking.page.spec.ts frontend/src/app/features/booking/booking-submission-error.ts
git commit -m "feat: show customer date availability"
```

### Task 6: Admin Capacity Review UI

**Files:**
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/core/services/admin.service.ts`
- Modify: `frontend/src/app/core/services/admin.service.spec.ts`
- Modify: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.ts`
- Modify: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html`
- Modify: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.scss`
- Modify: `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts`
- Modify: `frontend/src/app/features/admin-bookings/admin-bookings.page.ts`
- Modify: `frontend/src/app/features/admin-bookings/admin-bookings.page.html`
- Modify: `frontend/src/app/features/admin-bookings/admin-bookings.page.scss`
- Modify: `frontend/src/app/features/admin-bookings/admin-bookings.page.spec.ts`

**Interfaces:**
- Consumes: admin `capacity` summary and `capacityConfirmed` API body from Task 4.
- Changes: `AdminService.updateBookingStatus(id, status, reason?, capacityConfirmed?)`.

- [ ] **Step 1: Write failing admin-service body tests**

Assert ordinary approval sends `{ status: 'APPROVED' }`, medium confirmation sends `{ status: 'APPROVED', capacityConfirmed: true }`, and existing reason payloads remain unchanged.

- [ ] **Step 2: Write failing list/detail component tests**

Assert capacity counts/status appear in list and detail. For a pending 150-499 booking, assert the action reads `Approve and confirm capacity`, confirmation copy explains the decision, and the API receives `true`. For a 149 or 500 guest booking, assert the normal approval action remains. Test coded `409` copy and refresh behavior.

- [ ] **Step 3: Run frontend tests and verify failure**

Run: `npm.cmd test -- --watch=false`

Expected: new admin assertions FAIL before implementation.

- [ ] **Step 4: Implement typed admin summaries and request body**

Add the capacity model to admin booking records and extend the service body without altering existing callers.

- [ ] **Step 5: Implement list/detail capacity presentation**

Use a compact unframed metadata row on the list and a dedicated operational strip on detail. Show active count versus limit, status text, and the medium confirmation warning. Do not expose other booking details or add a settings screen.

- [ ] **Step 6: Implement explicit medium confirmation**

Derive the special action only from `item.capacity.requiresAdminConfirmation`. Send `capacityConfirmed: true` after the admin accepts the confirmation panel; keep rejection/cancellation reasons and stale-refresh behavior intact.

- [ ] **Step 7: Run frontend tests and build**

Run: `npm.cmd test -- --watch=false`

Run: `npm.cmd run build`

Expected: all frontend tests and build PASS.

- [ ] **Step 8: Commit admin frontend behavior**

```powershell
git add frontend/src/app/core/models/admin.model.ts frontend/src/app/core/services/admin.service.ts frontend/src/app/core/services/admin.service.spec.ts frontend/src/app/features/admin-booking-detail frontend/src/app/features/admin-bookings
git commit -m "feat: add admin capacity review UI"
```

### Task 7: End-To-End Concurrency And Responsive Verification

**Files:**
- Modify: `backend/e2e/browser-fixture.ts`
- Modify: `frontend/e2e/admin-operations.spec.ts`
- Modify as failures require: files already owned by Tasks 1-6 only

**Interfaces:**
- Consumes: complete backend and frontend feature from Tasks 1-6.
- Produces: release-level evidence for database concurrency, real browser behavior, responsive layout, and builds.

- [ ] **Step 1: Add a disposable medium-capacity browser fixture**

Create and clean up a separate package that accepts 150-499 guests and a pending medium booking. Keep existing payment-proof fixture behavior unchanged.

- [ ] **Step 2: Add customer and admin browser journeys**

Verify customer availability text before progressing, medium requests can be submitted, admin sees the count/limit warning, normal approval requires the special confirmation, and successful approval refreshes the capacity summary. At 390, 768, 1024, and 1440 widths, assert no horizontal page overflow and capture screenshots.

- [ ] **Step 3: Add a true concurrent last-slot SQL E2E**

Use two authenticated customers and `Promise.allSettled` to submit against one remaining slot. Assert exactly one `201`, one `409 BOOKING_DATE_FULL`, and one new reservation row. Clean all fixture rows in `finally`.

- [ ] **Step 4: Apply migrations in the test environment**

Run: `npm.cmd run db:migrate`

Expected: `010_booking_capacity_availability.sql` applies once and a second run reports migrations current.

- [ ] **Step 5: Run complete backend verification**

Run: `npm.cmd test`

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e`

Expected: all commands exit `0`.

- [ ] **Step 6: Run complete frontend verification**

Run: `npm.cmd test -- --watch=false`

Run: `npm.cmd run build`

Run: `npm.cmd run test:e2e`

Expected: unit tests, production build, and Playwright pass; screenshots show no overlap or horizontal overflow at all target widths.

- [ ] **Step 7: Review the final diff and repository status**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only intentional source, migration, test, and existing user changes remain.

- [ ] **Step 8: Commit end-to-end verification**

```powershell
git add backend/e2e/browser-fixture.ts backend/e2e/phase81.e2e.ts frontend/e2e/admin-operations.spec.ts
git commit -m "test: verify booking capacity workflows"
```
