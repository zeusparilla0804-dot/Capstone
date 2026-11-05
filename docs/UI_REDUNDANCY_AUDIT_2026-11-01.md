# Frontend UI redundancy and typography review — 2026-11-01

## Scope and verification limits

Reviewed the public website, customer portal, authentication screens, booking/payment screens, invoice, and admin portal for repeated actions in the same state, oversized interface typography, clipped feedback, and narrow-layout constraints. Changes are frontend-only. Authentication, booking/payment calculations, API calls, database records, and navigation destinations are preserved.

This is a source and automated-component review, not a completed device screenshot audit. Chrome inspection was attempted, but the browser tool reported `The browser access host is unavailable`; no Chrome app was available. Microsoft Edge was not used. No development server was started or restarted, and localhost:4200 was not changed.

## Confirmed issues corrected

| Area | Cause | Change |
| --- | --- | --- |
| Customer Dashboard | Header and empty state both rendered a booking CTA simultaneously | Keep the header Plan an Event action and remove the redundant empty-state anchor |
| Dashboard button | Later global rules enlarged the action to 60px minimum height with a 248px minimum width and shadow | Remove the conflicting global action rules; own the action styles in the page stylesheet, with 44px minimum height and 14px/500 text |
| Dashboard heading | Heading scaled up to 74.4px and mobile used 44px | Use clamp(32px, 3.2vw, 44px), weight 400, line-height 1.12; mobile 32px |
| Dashboard empty state | Large heading and substantial padding repeated the primary action's visual emphasis | Heading 28px desktop / 24px mobile, readable 14px supporting text, compact padding, one booking CTA |
| My Reservations | Upcoming empty state repeated the always-visible header booking action | Keep Start a Reservation in the header; remove the empty-state duplicate |
| Customer typography | Reservations/Billing/Profile referenced Inter, but only Profile loaded it, so visiting different routes could affect font availability | Reuse the existing Manrope sans token consistently; remove Profile's separate Inter request; reuse the shared Playfair Display serif token for page headings |
| Customer page headings | Reservations and Profile headings were disproportionately large | Reservations 44px desktop / 40px tablet / 32px mobile; Profile 44px desktop / 32px mobile; Billing retains 42px desktop and uses 32px mobile |
| Package actions | Plan with this package and Customize this package navigated to the same booking URL and package selection | Keep Plan with this package and its existing package/new query parameters; remove the duplicate action and unused event plumbing |
| Package inclusions | Expand control appeared even when all inclusions were already visible | Render the toggle only when more than three inclusions exist |
| Packages closing sections | Consecutive generic reservation CTAs shared the same destination | Keep the final closing CTA and remove the preceding duplicate anchor; preserve section content |
| Admin cash/package/add-on editors | Opening actions remained visible while their forms were already open; Create could reset an in-progress editor | Hide the corresponding header opener during editing; preserve Save/Record and Cancel/Close |
| Admin detail typography | Customer/booking identity headings reached approximately 52–53.6px | Use 28px desktop and 24px mobile, with long-name wrapping safeguards |
| Admin tablet layouts | Form/filter column minimums exceeded content width after subtracting the sidebar | Earlier responsive stacking for report controls, audit/outbox filters, booking action confirmation, and package guest-limit controls |
| Report totals | Tablet-only nowrap prevented long totals from wrapping | Remove the tablet nowrap constraint |
| Signup feedback | Fixed-height, overflow-hidden feedback slots clipped long validation/server errors | Preserve a minimum reserved line while allowing content to expand |

## Repeated controls deliberately retained

- Booking steps and Continue: different navigation/validation roles.
- Per-package and per-reservation actions: act on different records.
- Verify and Reject: distinct administrative decisions.
- Invoice and payment actions: distinct documents/workflows.
- Print and Export: distinct output formats.
- Logout and Sign out all devices: different session scope.
- Editor Close at the top and Cancel at the bottom of a long package form: useful access at both ends.
- Success-dialog navigation to My Reservations versus Dashboard: different destinations.
- Mobile header/sidebar controls whose visibility is mutually exclusive with desktop controls.
- Cash instructions and online proof submission: separate conditional workflows.

## Changed files for this task

### Customer portal and shared dashboard override cleanup

- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.html`
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.scss`
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.spec.ts`
- `frontend/src/app/features/my-bookings/my-bookings.page.html`
- `frontend/src/app/features/my-bookings/my-bookings.page.scss`
- `frontend/src/app/features/my-bookings/my-bookings.page.spec.ts`
- `frontend/src/app/features/customer-profile/customer-profile.page.html`
- `frontend/src/app/features/customer-profile/customer-profile.page.scss`
- `frontend/src/app/features/customer-billing/customer-billing.page.scss`
- `frontend/src/styles.scss`

### Public packages and authentication feedback

- `frontend/src/app/shared/components/package-experience/package-experience.html`
- `frontend/src/app/shared/components/package-experience/package-experience.ts`
- `frontend/src/app/shared/components/package-experience/package-experience.spec.ts`
- `frontend/src/app/features/packages/packages.page.html`
- `frontend/src/app/features/packages/packages.page.ts`
- `frontend/src/app/features/packages/packages.page.spec.ts`
- `frontend/src/app/features/auth/auth.page.scss`
- `frontend/src/app/features/auth/auth.page.spec.ts`

### Admin portal

- `frontend/src/app/features/admin-payments/admin-payments.page.html`
- `frontend/src/app/features/admin-payments/admin-payments.page.spec.ts`
- `frontend/src/app/features/admin-packages/admin-packages.page.html`
- `frontend/src/app/features/admin-packages/admin-packages.page.scss`
- `frontend/src/app/features/admin-packages/admin-packages.page.spec.ts`
- `frontend/src/app/features/admin-addons/admin-addons.page.html`
- `frontend/src/app/features/admin-addons/admin-addons.page.spec.ts`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.scss`
- `frontend/src/app/features/admin-customer-detail/admin-customer-detail.page.scss`
- `frontend/src/app/features/admin-email-outbox/admin-email-outbox.page.scss`
- `frontend/src/app/features/admin-audit-log/admin-audit-log.page.scss`
- `frontend/src/app/features/admin-reports/admin-reports.page.scss`
- `frontend/src/app/features/admin-dashboard/admin-dashboard.page.scss`
- `frontend/src/app/shared/components/admin-shell/admin-shell.scss`

This report is the additional documentation file. Other dirty workspace changes predate this task and were not reset.

## Automated verification

- Regression tests first reproduced duplicate Dashboard/My Reservations CTAs and the 60px Dashboard button before the fixes.
- Public/admin focused tests reproduced the duplicate/no-op controls before their fixes.
- Full Angular frontend suite: **355 tests passed in 55 files**, exit 0.
- Production Angular build: **passed**, exit 0.
- Supplemental Node source-layout checks: **6 passed, 1 failed**. Passing checks cover customer billing, admin bookings/customers/payments, and invoice print layout.
- The failing supplemental `scripts/admin-typography.test.mjs` asserts an older Admin Sign In design: `.admin-login` overriding serif to the admin font, `.admin-brand h1`, and `.admin-form-panel h2`. The current sign-in template uses a logo image and `h1`, with existing serif authentication heading styling. Neither that sign-in design nor this old test was changed for this cleanup; this failure remains explicitly reported.

Logs: `.codex-temp/ui-audit-full-test.log` and `.codex-temp/ui-audit-build.log`.

## Remaining visual checks

When Chrome inspection is available, inspect at 375/390px phone, 768px tablet, 960px Surface, 1280px laptop, and 1440px desktop widths, at 100% zoom. Check both expanded/collapsed sidebar states, empty/populated pages, open admin editors, long customer names, large currency values, and validation errors. Confirm one primary booking action in each empty state and no whole-page horizontal scrolling. Public header crowding near its desktop/mobile breakpoint remains a visual-check candidate; no unverified header redesign was made.
