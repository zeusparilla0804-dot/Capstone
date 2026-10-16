# LA Chef Portal Dashboard Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved white, near-black, and restrained-gold visual system for the authenticated customer and administrator portals, including an accessible collapsible sidebar, real-data badges, redesigned dashboards, and responsive behavior.

**Architecture:** Extend the existing `DashboardSidebarComponent` and `DashboardNavItem` contract instead of replacing navigation. Use a small root-provided state service for the browser-persisted desktop collapse preference and a focused badge state service populated from data already loaded by the dashboards. Keep customer and admin dashboard composition in their current feature components and preserve every route, API, authentication, and business rule.

**Tech Stack:** Angular 22 standalone components, signals/computed state, Angular Router, RxJS, SCSS, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-10-13-portal-dashboard-visual-system-design.md`

**Implementation status:** Complete and verified on 2026-10-13. The execution evidence is recorded in `.superpowers/sdd/2026-10-13-portal-dashboard-visual-system/progress.md`.

## Global Constraints

- Do not modify backend endpoints, database migrations, authentication, authorization, booking calculations, quotation calculations, or payment rules.
- Do not introduce a UI framework, icon package, charting package, or state library.
- Do not add hardcoded customer, event, balance, notification, or date data.
- Use existing service responses and format monetary values as Philippine pesos.
- Keep existing customer and admin routes and logout confirmation behavior intact.
- Support widths from `320px` upward with no document-level horizontal overflow.
- Preserve focus trapping, Escape handling, focus restoration, and reduced-motion support.
- Use ASCII in source files unless an existing user-facing currency formatter produces the peso symbol.

## Review Focus

- Long customer names, venues, email addresses, booking references, and currency values must not overflow or overlap.
- Zero, unavailable, or failed badge data must omit the badge without blocking navigation.
- A persisted collapsed preference must never collapse the mobile drawer or hide its labels.
- Empty booking and billing data must render intentional empty states rather than preview content.
- Keyboard users must be able to open, close, collapse, expand, and navigate the sidebar with visible focus.

---

### Task 1: Portal Tokens and Navigation State

**Files:**
- Create: `frontend/src/app/core/services/portal-navigation-state.service.ts`
- Create: `frontend/src/app/core/services/portal-navigation-state.service.spec.ts`
- Modify: `frontend/src/styles.scss`

**Interfaces:**
- Produces: `PortalNavigationStateService.collapsed: Signal<boolean>`
- Produces: `PortalNavigationStateService.toggle(): void`
- Produces: `PortalNavigationStateService.setCollapsed(value: boolean): void`
- Persists: local storage key `la-chef.portal-sidebar-collapsed`

- [ ] **Step 1: Write failing state service tests**

Cover default expanded state, valid persisted `true`, invalid storage fallback, toggle persistence, and storage access failure.

- [ ] **Step 2: Run the targeted test and confirm failure**

Run:

```powershell
& "$env:TEMP\lachef-node-runtime\node_modules\node\bin\node.exe" ".\node_modules\@angular\cli\bin\ng.js" test --watch=false --include="src/app/core/services/portal-navigation-state.service.spec.ts"
```

Expected: missing service/test implementation failure.

- [ ] **Step 3: Implement the minimal state service**

Use an Angular signal, defensive browser/storage checks, and no server-side dependency. Persist only the visual collapse preference.

- [ ] **Step 4: Add portal-scoped visual tokens**

Add variables for white canvas, subtle surface, near-black sidebar, sidebar hover, portal text, neutral divider, gold accent, and gold divider. Do not replace public-site variables globally; expose the portal palette through `.portal-surface` or equivalent shell scope.

- [ ] **Step 5: Run the targeted test**

Expected: all state service tests pass.

---

### Task 2: Accessible Collapsible Shared Sidebar

**Files:**
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.ts`
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.html`
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.scss`
- Modify: `frontend/src/app/shared/components/dashboard-sidebar/dashboard-sidebar.spec.ts`

**Interfaces:**
- Extends: `DashboardNavItem` with `badge?: number` and `badgeLabel?: string`
- Consumes: `PortalNavigationStateService`
- Preserves: `navAction: OutputEmitterRef<DashboardNavItem>`
- Preserves: mobile drawer focus and action-confirmation behavior

- [ ] **Step 1: Add failing sidebar tests**

Test that:

- positive badges render with contextual accessible text;
- zero/negative/undefined badges do not render;
- desktop collapse changes `aria-expanded`, applies the collapsed class, and persists through the service;
- collapsed links retain accessible names and tooltips;
- mobile mode ignores desktop collapse visually and keeps full labels;
- existing Escape, focus restoration, action grouping, confirmation, and brand-route tests still pass.

- [ ] **Step 2: Run the targeted sidebar tests and confirm failure**

Run the sidebar spec with Angular's `--include` option.

- [ ] **Step 3: Extend the component contract and template**

Add a desktop collapse/expand icon button, route/action badges, aggregate mobile menu indicator when useful, contextual `aria-label` values, and collapsed-state classes. Continue using the existing inline SVG system so no icon dependency is added.

- [ ] **Step 4: Implement the approved sidebar styling**

Use `272px` expanded and approximately `80px` collapsed widths, near-black surfaces, thin gold rules, clear active states, safe text hiding, `44px` touch targets, tooltip treatment, mobile safe-area padding, `100dvh`, and reduced-motion overrides.

- [ ] **Step 5: Run sidebar tests**

Expected: all shared sidebar tests pass with no regression to mobile focus behavior.

---

### Task 3: Portal Shell Tracks and Real Badge State

**Files:**
- Create: `frontend/src/app/core/services/portal-badge-state.service.ts`
- Create: `frontend/src/app/core/services/portal-badge-state.service.spec.ts`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.ts`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.html`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.scss`
- Modify: `frontend/src/app/shared/components/admin-shell/admin-shell.spec.ts`
- Modify: `frontend/src/app/shared/navigation/customer-navigation.ts`
- Modify: `frontend/src/app/features/my-bookings/my-bookings.page.scss`
- Modify: `frontend/src/app/features/customer-billing/customer-billing.page.scss`
- Modify: `frontend/src/app/features/customer-profile/customer-profile.page.scss`
- Modify: `frontend/src/app/features/payment-proof/payment-proof.page.scss`

**Interfaces:**
- Produces: `PortalBadgeStateService.adminBadges` with booking, payment, and email counts
- Produces: `PortalBadgeStateService.customerBookingCount`
- Produces: `PortalBadgeStateService.setAdminDashboard(summary: AdminDashboard): void`
- Produces: `PortalBadgeStateService.setCustomerBookings(bookings: readonly Booking[]): void`
- Changes: `CUSTOMER_NAV_ITEMS` to a small factory accepting the current booking badge count while retaining existing routes/actions

- [ ] **Step 1: Write failing badge state tests**

Verify dashboard priority mapping, actionable customer booking filtering, zero omission, immutable updates, and reset behavior.

- [ ] **Step 2: Write failing admin shell tests**

Verify real badge values appear on Bookings, Payments, and Email operations; shell layout receives portal scope; logout and sign-out-all-devices behavior remains unchanged.

- [ ] **Step 3: Run targeted tests and confirm failure**

Run the badge service and admin shell specs.

- [ ] **Step 4: Implement badge state and navigation mapping**

Store only values derived from already-loaded API data. Do not manufacture a quotation count or add a notification endpoint. Omit unavailable badges.

- [ ] **Step 5: Convert fixed sidebar tracks to automatic tracks**

Change admin and customer portal grids from fixed `252px`/`264px` tracks to `auto minmax(0, 1fr)`. Keep the existing mobile `display: block` behavior below `768px`.

- [ ] **Step 6: Apply portal shell styling**

Use a white canvas, near-black text, gold/neutral dividers, constrained content widths, and consistent page padding. Preserve every projected admin action and existing page content.

- [ ] **Step 7: Run targeted tests**

Expected: badge-state and admin-shell tests pass.

---

### Task 4: Customer Dashboard Composition

**Files:**
- Create: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.spec.ts`
- Modify: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.ts`
- Modify: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.html`
- Modify: `frontend/src/app/features/customer-dashboard/customer-dashboard.page.scss`

**Interfaces:**
- Consumes: `BookingService.bookings`, loading, and error signals
- Consumes: `BookingCalculationService.calculateTotals(booking)`
- Consumes: authenticated user from `AuthService`
- Produces: computed `nextBooking`, `planningProgress`, `upcomingBookings`, and `paymentSummary`
- Populates: `PortalBadgeStateService.customerBookingCount` from actual bookings

- [ ] **Step 1: Add customer dashboard tests before markup changes**

Cover:

- authenticated greeting;
- earliest upcoming booking as the next event;
- PHP totals, paid amount, and remaining balance;
- progress step derived from pending, approved/awaiting-payment, payment-submitted, payment-verified/confirmed, and completed statuses;
- real My Bookings badge count;
- loading, API error with retry, and no-booking empty states;
- absence of hardcoded preview names, locations, dollar signs, and dates.

- [ ] **Step 2: Run the customer dashboard spec and confirm failure**

Expected: new hierarchy/progress assertions fail against current markup.

- [ ] **Step 3: Implement computed view state**

Reuse existing booking models and calculation service. Do not write new workflow state or mutate bookings while deriving progress.

- [ ] **Step 4: Implement customer dashboard markup**

Create the approved hierarchy: personalized header, next-event summary, three-step planning progress, upcoming bookings, and billing summary. Preserve current navigation and payment/invoice routes. Use semantic sections, lists/tables, and status badges.

- [ ] **Step 5: Implement responsive customer styles**

Use flat divided regions at desktop, labeled stacked rows below tablet width, a vertical/compact progress sequence on mobile, safe wrapping, and one-column composition at `390px`/`320px`. Avoid nested cards and heavy shadows.

- [ ] **Step 6: Run customer dashboard and related booking tests**

Expected: new dashboard tests and existing booking/navigation tests pass.

---

### Task 5: Admin Dashboard Composition and Badges

**Files:**
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.ts`
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.html`
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.scss`
- Modify: `frontend/src/app/features/admin-dashboard/admin-dashboard.page.spec.ts`

**Interfaces:**
- Consumes: unchanged `AdminService.dashboard(period)` response
- Populates: `PortalBadgeStateService.adminBadges`
- Preserves: `attentionRoute`, `queueRoute`, `queueParams`, and reporting month behavior

- [ ] **Step 1: Extend failing admin dashboard tests**

Verify:

- API queue values populate navigation badges;
- queue links keep their existing route/query parameters;
- verified revenue and submitted proof value remain distinct;
- loading, error/retry, and empty attention states remain usable;
- no chart, search control, or sample operational record is introduced.

- [ ] **Step 2: Run the admin dashboard spec and confirm failure**

Expected: new badge and approved-layout assertions fail.

- [ ] **Step 3: Populate badge state from successful dashboard responses**

Update badge state only after valid API data arrives. Preserve the previous usable navigation if refresh fails, or reset only when the authenticated admin session ends.

- [ ] **Step 4: Refine admin dashboard markup and styles**

Keep the priority strip, ranked attention list, and revenue ledger while applying the approved white canvas, thin gold/neutral dividers, denser operational spacing, and responsive stacking. Keep the reporting control and retry behavior.

- [ ] **Step 5: Run admin dashboard and admin shell tests**

Expected: all targeted tests pass.

---

### Task 6: Responsive Browser Verification and Full Regression

**Files:**
- Modify: `frontend/e2e/app.spec.ts`
- Modify: `frontend/e2e/admin-operations.spec.ts`
- Update only if findings require it: portal SCSS files touched in Tasks 1-5

**Interfaces:**
- Verifies: current customer and admin authentication fixtures and live mocked/database-backed flows

- [ ] **Step 1: Add Playwright assertions for portal navigation**

At desktop width, verify collapse/expand changes the sidebar footprint without changing routes or creating blank space. Verify badges use actual fixture values and icon-only items retain accessible names.

- [ ] **Step 2: Add mobile drawer and layout assertions**

At `390x844`, verify full labels in the drawer, backdrop/Escape behavior, focus restoration, no overlap with page content, and no horizontal overflow. Include customer and admin dashboards.

- [ ] **Step 3: Run targeted Angular tests**

Run sidebar, state service, customer dashboard, admin shell, and admin dashboard specs.

- [ ] **Step 4: Run the full Angular test suite**

Run:

```powershell
& "$env:TEMP\lachef-node-runtime\node_modules\node\bin\node.exe" ".\node_modules\@angular\cli\bin\ng.js" test --watch=false
```

Expected: all tests pass.

- [ ] **Step 5: Run the Angular production build**

Run:

```powershell
& "$env:TEMP\lachef-node-runtime\node_modules\node\bin\node.exe" ".\node_modules\@angular\cli\bin\ng.js" build --configuration production
```

Expected: build completes without compilation errors; investigate any new budget warning introduced by this change.

- [ ] **Step 6: Run focused Playwright portal tests**

Run the customer/admin navigation and dashboard tests at `390`, `768`, `1024`, and `1440` widths.

- [ ] **Step 7: Inspect screenshots and canvas dimensions**

Confirm nonblank rendering, correct sidebar footprint, readable badges, no clipped headings/actions, no text overlap, no document-level horizontal overflow, and appropriate mobile stacking.

- [ ] **Step 8: Review the final diff**

Confirm the diff contains no backend changes, no preview/sample business data, no secret files, no generated build output, and no unrelated refactor.
