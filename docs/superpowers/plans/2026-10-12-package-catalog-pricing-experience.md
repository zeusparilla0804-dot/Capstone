# Package Catalog, Pricing, And Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent LA Chef's supplied pricing accurately, support editable estimated guests for pending package bookings, and replace the product-card catalog with a responsive editorial package experience.

**Architecture:** Introduce a typed package-pricing domain shared conceptually by backend authority and frontend preview, persist immutable reservation pricing snapshots, and keep date capacity independent from package constraints. Preserve the existing Angular services, Express route/service/repository layers, and SQL migration system while adding a dedicated editorial package component for the public catalog.

**Tech Stack:** Angular 22 signals and reactive forms, TypeScript, Express 5 ES modules, Microsoft SQL Server 2022, Vitest, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-package-catalog-pricing-experience-design.md`

## Global Constraints

- Use the prices transcribed in `docs/CLIENT_CATALOG_REFERENCE.md`; do not invent rates or package capacities.
- Guest input remains an estimate from 1 through 10,000 and date-capacity rules remain separate.
- Backend calculations are authoritative and existing reservations retain immutable pricing snapshots.
- Preserve existing authentication, routing conventions, audit logging, and payment approval behavior.
- Customer UI must work without overlap or horizontal scrolling at 390, 768, 1024, and 1440 pixels.
- Do not add a new frontend dependency for layout, galleries, or currency calculation.

## Review Focus

- Exactly `includedGuests` and one guest above it must produce base-only and base-plus-one-excess totals respectively; Task 2 pins both boundaries.
- Null package minimum or maximum must not become zero or block valid guests; Tasks 1, 3, and 6 cover nullable constraints.
- Concurrent pending-booking edits must recheck date capacity and cannot overwrite a non-pending transition; Task 5 covers transaction locks and expected status.
- Old bookings must display their snapshot after an admin changes the package; Tasks 4 and 5 cover snapshot persistence and reads.
- Touch gallery gestures must not block vertical page scrolling and reduced-motion users must not receive forced transitions; Task 7 covers interaction tests.

---

### Task 1: Package Pricing Schema

**Files:**
- Create: `backend/migrations/012_package_pricing_models.sql`
- Create: `backend/src/migrations/package-pricing-schema.test.ts`
- Modify: `backend/src/migrations/schema-contract.ts`
- Modify: `backend/src/types/domain.types.ts`

**Interfaces:**
- Produces: `PackagePricingType = 'PER_HEAD' | 'BASE_PLUS_EXCESS'` and nullable pricing/guest-limit fields on `PackageRecord`.
- Produces: reservation snapshot columns for pricing type, base price, included guests, excess rate, and package total.

- [ ] **Step 1: Write the failing migration and schema-contract tests** asserting idempotent package pricing columns, nullable guest limits, pricing-type check constraints, reservation snapshot columns, and expected indexes.
- [ ] **Step 2: Run `npm.cmd test -- --test-name-pattern="package pricing schema|schema contract"` in `backend`; expect failures for missing migration fields.**
- [ ] **Step 3: Add migration `012_package_pricing_models.sql`** to drop incompatible legacy checks safely, add `pricing_type`, `base_price`, `included_guests`, `excess_guest_price`, nullable limits, and reservation snapshot fields with mutually exclusive pricing checks.
- [ ] **Step 4: Extend `schema-contract.ts` and `domain.types.ts`** with the exact database and TypeScript shapes from the spec.
- [ ] **Step 5: Rerun the focused tests; expect PASS.**
- [ ] **Step 6: Commit `feat: add package pricing models`.**

### Task 2: Authoritative Package Pricing Domain

**Files:**
- Create: `backend/src/services/package-pricing.service.ts`
- Create: `backend/src/services/package-pricing.service.test.ts`

**Interfaces:**
- Consumes: `PackageRecord` from Task 1.
- Produces: `calculatePackagePrice(pkg: PackageRecord, guestCount: number): { packageTotal: number; pricingSnapshot: PackagePricingSnapshot }`.
- Produces: `assertGuestCountAllowed(pkg: PackageRecord, guestCount: number): void`.

- [ ] **Step 1: Write failing tests** for PHP 480/580/680 per-head totals, Amethyst/Diamond/Ruby included boundaries, excess guests, cent rounding, null limits, and confirmed min/max violations.
- [ ] **Step 2: Run `npm.cmd test -- --test-name-pattern="package pricing"`; expect failures because the service is absent.**
- [ ] **Step 3: Implement the two exported functions** using integer-cent-safe rounding and stable `AppError` messages.
- [ ] **Step 4: Rerun the focused tests; expect PASS.**
- [ ] **Step 5: Commit `feat: calculate package pricing by model`.**

### Task 3: Catalog And Admin Package Contracts

**Files:**
- Modify: `backend/src/repositories/catalog.repository.ts`
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/types/admin.types.ts`
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/src/controllers/admin.controller.ts`
- Create: `backend/src/repositories/catalog.repository.test.ts`
- Modify: `backend/src/services/admin-operations.service.test.ts`

**Interfaces:**
- Produces: public/admin package JSON with `pricingType`, `pricePerGuest`, `basePrice`, `includedGuests`, `excessGuestPrice`, nullable `minGuests`, and nullable `maxGuests`.
- Produces: `PackageInput` using the same discriminated pricing fields.

- [ ] **Step 1: Write failing repository and service tests** for both pricing types, null guest bounds, invalid field combinations, and audit-safe pricing values.
- [ ] **Step 2: Run the focused backend tests; expect contract failures.**
- [ ] **Step 3: Update catalog mapping and package-by-id queries** to return the new fields without coercing null to zero.
- [ ] **Step 4: Update admin repository, controller parsing, validation, and audit payloads** for discriminated pricing inputs and optional guest bounds.
- [ ] **Step 5: Run the focused tests; expect PASS.**
- [ ] **Step 6: Commit `feat: expose configurable package pricing`.**

### Task 4: Client Catalog Synchronization

**Files:**
- Create: `backend/src/scripts/sync-client-catalog.ts`
- Create: `backend/src/scripts/sync-client-catalog.test.ts`
- Modify: `backend/package.json`
- Modify: `docs/CLIENT_CATALOG_REFERENCE.md`

**Interfaces:**
- Produces: `npm run db:catalog:sync -- --dry-run` and explicit `--apply` modes.
- Consumes: pricing fields and existing event/menu tables; never deletes unknown client data.

- [ ] **Step 1: Write failing tests** that the sync definition contains exactly the three supplied per-head rates and three supplied debut formulas, is idempotent, and defaults to dry-run.
- [ ] **Step 2: Run the script tests; expect failure because the script is absent.**
- [ ] **Step 3: Implement parameterized upserts** for literal tier labels and structured inclusions, preserving unrelated packages and requiring `--apply` to mutate data.
- [ ] **Step 4: Document client confirmation flags for package names, current prices, and guest limits.**
- [ ] **Step 5: Run the focused tests and a dry-run against the configured local database; expect no mutation.**
- [ ] **Step 6: Commit `feat: add controlled client catalog sync`.**

### Task 5: Booking Snapshots And Pending Estimate Updates

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/src/controllers/booking.controller.ts`
- Modify: `backend/src/routes/booking.routes.ts`
- Modify: `backend/src/repositories/invoice.repository.ts`
- Modify: `backend/src/controllers/booking.controller.test.ts`
- Create: `backend/src/repositories/booking-pricing.repository.test.ts`

**Interfaces:**
- Consumes: Task 2 pricing functions.
- Produces: `UpdatePendingBookingDto` and `PATCH /api/bookings/:id/details`.
- Produces: booking responses with a complete package-pricing snapshot and `packageTotal`.

- [ ] **Step 1: Write failing tests** for authoritative create totals, immutable snapshots, `specialRequest`, owner-only pending edits, price recalculation, capacity recheck, invalid state conflict, and invoice lines for both pricing types.
- [ ] **Step 2: Run the focused booking tests; expect failures.**
- [ ] **Step 3: Refactor creation to use `calculatePackagePrice`** and persist all snapshot fields in the existing transaction.
- [ ] **Step 4: Implement `updatePendingBooking(customerId, reservationId, dto)`** with ownership and `PENDING` row locks, capacity recheck, add-on replacement, price recalculation, and updated response.
- [ ] **Step 5: Add controller parsing and `PATCH /:id/details` route** with existing validation helpers and safe conflict codes.
- [ ] **Step 6: Update invoice creation** so base-plus-excess packages produce truthful package line descriptions and totals.
- [ ] **Step 7: Rerun focused tests; expect PASS.**
- [ ] **Step 8: Commit `feat: support estimated guest updates`.**

### Task 6: Angular Pricing And Booking Forms

**Files:**
- Modify: `frontend/src/app/core/models/package.model.ts`
- Modify: `frontend/src/app/core/models/booking.model.ts`
- Modify: `frontend/src/app/core/services/booking-calculation.service.ts`
- Modify: `frontend/src/app/core/services/booking-draft.service.ts`
- Modify: `frontend/src/app/core/services/booking.service.ts`
- Modify: `frontend/src/app/features/booking/booking.page.ts`
- Modify: `frontend/src/app/features/booking/booking.page.html`
- Modify: `frontend/src/app/features/booking/booking.page.scss`
- Modify: corresponding `*.spec.ts` files.

**Interfaces:**
- Produces: `calculatePackagePricing(package, guestCount, addOns, discount?, downPaymentRate?)` matching backend formulas.
- Produces: booking form copy and validation for `Estimated number of guests` and optional confirmed limits.

- [ ] **Step 1: Write failing unit/component tests** for both formulas, null bounds, estimate copy, live formula explanation, validation, pending save loading/error states, and preserved draft data.
- [ ] **Step 2: Run the affected Angular tests with Node 22.22.3; expect failures.**
- [ ] **Step 3: Update models and calculation services** to use the discriminated package pricing contract.
- [ ] **Step 4: Replace unconditional package-range validation** with nullable confirmed-limit checks while preserving the 1-10,000 boundary and availability checks.
- [ ] **Step 5: Add the pending-booking edit API method and form state** without changing approved-booking behavior.
- [ ] **Step 6: Run affected Angular tests; expect PASS.**
- [ ] **Step 7: Commit `feat: preview package pricing and guest estimates`.**

### Task 7: Editorial Package Experience

**Files:**
- Create: `frontend/src/app/shared/components/package-experience/package-experience.ts`
- Create: `frontend/src/app/shared/components/package-experience/package-experience.html`
- Create: `frontend/src/app/shared/components/package-experience/package-experience.scss`
- Create: `frontend/src/app/shared/components/package-experience/package-experience.spec.ts`
- Modify: `frontend/src/app/features/packages/packages.page.ts`
- Modify: `frontend/src/app/features/packages/packages.page.html`
- Modify: `frontend/src/app/features/packages/packages.page.scss`
- Modify: `frontend/src/app/shared/components/package-card/package-card.ts`
- Modify: `frontend/src/app/shared/components/package-card/package-card.html`
- Modify: `frontend/src/app/shared/components/package-card/package-card.scss`

**Interfaces:**
- Produces: `PackageExperienceComponent` outputs `planPackage`, `viewInclusions`, and `customizePackage`.
- Consumes: pricing display helper derived from `CateringPackage`.

- [ ] **Step 1: Write failing component tests** for human-readable pricing, alternating rows, inclusion expansion, plan/customize navigation, gallery click zones, swipe threshold, keyboard navigation, and reduced-motion classes.
- [ ] **Step 2: Run the package component tests; expect failures.**
- [ ] **Step 3: Implement the editorial component** with stable media dimensions, subtle dots, accessible image-region buttons, and no ecommerce sale language.
- [ ] **Step 4: Replace the packages grid with an unframed experience list** and make Custom Events a quotation introduction rather than a fixed-price package category.
- [ ] **Step 5: Limit the old package card to the compact home-page featured variant** so shared markup is not duplicated.
- [ ] **Step 6: Run component tests; expect PASS.**
- [ ] **Step 7: Commit `feat: redesign package discovery experience`.**

### Task 8: Admin Pricing Form And End-To-End Verification

**Files:**
- Modify: `frontend/src/app/core/models/admin.model.ts`
- Modify: `frontend/src/app/features/admin-packages/admin-packages.page.ts`
- Modify: `frontend/src/app/features/admin-packages/admin-packages.page.html`
- Create: `frontend/src/app/features/admin-packages/admin-packages.page.scss`
- Create: `frontend/src/app/features/admin-packages/admin-packages.page.spec.ts`
- Modify: `frontend/e2e/app.spec.ts`

**Interfaces:**
- Consumes: admin package contract from Task 3.
- Produces: conditional package pricing editor and readable pricing summaries.

- [ ] **Step 1: Write failing tests** for pricing-type field switching, stale hidden-value clearing, optional guest bounds, server error messages, and loading/duplicate-submit prevention.
- [ ] **Step 2: Implement the admin form and responsive table/list presentation.**
- [ ] **Step 3: Add Playwright journeys** for per-head booking, base-plus-excess booking, pending guest update, package customization navigation, gallery input modes, and 390/768/1024/1440 viewport overflow checks.
- [ ] **Step 4: Run backend tests and build; expect PASS.**
- [ ] **Step 5: Run Angular tests and production build with Node 22.22.3; expect PASS.**
- [ ] **Step 6: Run Playwright against local backend/frontend and inspect screenshots; expect all journeys PASS with no overlap or horizontal page scroll.**
- [ ] **Step 7: Commit `test: verify package pricing experience`.**
