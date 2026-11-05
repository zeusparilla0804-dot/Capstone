# Booking flow rollback ? November 3, 2026

Restored the booking/payment flow preceding the November 2 policy-v2 update, as explicitly requested by the user. No database cleanup, migration rollback, record rewriting, package installation, commits, backups, or development-server restart was performed.

## Active rules

| Area | Restored behavior |
| --- | --- |
| Event date | At least three calendar days after today's date in Asia/Manila; date-only parsing is preserved. Continue and final submission revalidate the date. |
| Guest count | Whole numbers from 1 to 1,500; existing inline warning, stable reserved error area and package defaults remain. |
| Cash preparation | Fewer than 500 guests: three calendar days; 500?1,500 guests: five calendar days. |
| Cash booking window | Two office days plus the applicable preparation days: five/seven calendar days ahead before office closing; one extra day when booking at/after 18:00 Philippine Time. Office is open daily 08:00?18:00. |
| Cash deposit deadline | Event date minus the applicable three/five preparation days, at 18:00 Philippine Time. No new saved countdown or extension workflow. |
| Booking review | Ordinary PENDING ? APPROVED ? AWAITING_PAYMENT flow; existing capacity recheck and explicit medium-event capacity confirmation. Pending bookings again count toward date capacity. |
| Payment recording | Actual cash recorded by staff; online proofs manually reviewed. Cumulative recorded/verified payments meet the 50% deposit threshold before PAYMENT_VERIFIED. Confirmation remains a separate admin action. |
| Safety retained | Owner-scoped edits, booking idempotency, payment reference retries, cents-based totals/overpayment checks, catalog pricing and add-on quantities, proof history, rejection reasons, cancellation and existing security/authentication fixes. |

## Removed from the active flow

- Short-notice opt-in and operational-exception/deadline forms.
- Elapsed-hour preparation, initial-review and online-verification timing assessments introduced by policy-v2.
- Policy metadata reads/writes, attention queue, payment-approval/deadline endpoints and automatic expiry worker.
- Actual cash timestamp and combined cash-record-and-confirm additions.
- Policy-summary panels and lengthy timing explanations across customer/admin pages.

## Historical data compatibility

Applied migration 020, its additive BOOKING_POLICY table, and its schema-contract tests remain in place. The table is dormant: active booking/payment code no longer reads or updates it. Existing EXPIRED reservation values remain readable and visible; they are not silently revived or changed. No bookings, payments, proof files/history or stored policy metadata were deleted.

## Verification

Final results: backend 462 passed, 2 skipped (464 total); frontend 357 passed across 55 files. Backend TypeScript and frontend production builds passed, as did `git diff --check`. Tests exercise the restored rules with controlled Manila clocks, month boundaries, cash guest thresholds, protected step navigation, capacity confirmation, payment idempotency, proof review and existing account/security behavior. No claim of live browser, email delivery or live SQL end-to-end testing is made for this rollback.

Read-only independent review found no important/critical issue in the restored paths. One remaining cash description was corrected to match the restored event-relative deadline.

## Modified source and test files

- backend/src/controllers/admin.controller.ts
- backend/src/controllers/booking.controller.test.ts
- backend/src/controllers/booking.controller.ts
- backend/src/repositories/admin.repository.ts
- backend/src/repositories/booking-availability.repository.test.ts
- backend/src/repositories/booking-availability.repository.ts
- backend/src/repositories/booking-submission.repository.test.ts
- backend/src/repositories/booking.repository.ts
- backend/src/repositories/manual-payment.repository.test.ts
- backend/src/routes/admin.routes.ts
- backend/src/routes/booking.routes.ts
- backend/src/server.ts
- backend/src/services/admin.service.ts
- backend/src/services/booking-status.service.test.ts
- backend/src/services/booking-status.service.ts
- backend/src/services/booking-submission-policy.ts
- backend/src/services/notification-domain.service.test.ts
- backend/src/services/payment-proof.service.test.ts
- backend/src/services/payment-proof.service.ts
- backend/src/services/payment-verification.service.test.ts
- backend/src/services/payment-verification.service.ts
- backend/src/templates/email-templates.ts
- backend/src/types/admin.types.ts
- backend/src/types/domain.types.ts
- frontend/src/app/core/models/admin.model.ts
- frontend/src/app/core/models/booking.model.ts
- frontend/src/app/core/models/index.ts
- frontend/src/app/core/services/admin.service.spec.ts
- frontend/src/app/core/services/admin.service.ts
- frontend/src/app/core/services/booking.service.spec.ts
- frontend/src/app/core/services/booking.service.ts
- frontend/src/app/core/utils/customer-payment-status.spec.ts
- frontend/src/app/core/utils/customer-payment-status.ts
- frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html
- frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts
- frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.ts
- frontend/src/app/features/admin-bookings/admin-bookings.page.html
- frontend/src/app/features/admin-bookings/admin-bookings.page.spec.ts
- frontend/src/app/features/admin-bookings/admin-bookings.page.ts
- frontend/src/app/features/admin-payments/admin-payments.page.html
- frontend/src/app/features/admin-payments/admin-payments.page.spec.ts
- frontend/src/app/features/admin-payments/admin-payments.page.ts
- frontend/src/app/features/booking/booking.page.html
- frontend/src/app/features/booking/booking.page.spec.ts
- frontend/src/app/features/booking/booking.page.ts
- frontend/src/app/features/booking/components/booking-success/booking-success.html
- frontend/src/app/features/booking/components/booking-success/booking-success.spec.ts
- frontend/src/app/features/booking/components/booking-success/booking-success.ts
- frontend/src/app/features/checkout/checkout.page.html
- frontend/src/app/features/checkout/checkout.page.spec.ts
- frontend/src/app/features/checkout/checkout.page.ts
- frontend/src/app/features/customer-billing/customer-billing.page.html
- frontend/src/app/features/customer-billing/customer-billing.page.ts
- frontend/src/app/features/customer-dashboard/customer-dashboard.page.html
- frontend/src/app/features/customer-dashboard/customer-dashboard.page.ts
- frontend/src/app/features/payment-proof/payment-proof.page.html
- frontend/src/app/features/payment-proof/payment-proof.page.spec.ts
- frontend/src/app/features/payment-proof/payment-proof.page.ts
- frontend/src/app/shared/components/booking-card/booking-card.html
- frontend/src/app/shared/components/booking-card/booking-card.ts
- frontend/src/app/shared/components/status-badge/status-badge.ts

## Removed policy-v2 implementation/test files

- backend/e2e/booking-policy.e2e.ts
- backend/src/controllers/booking-policy.controller.ts
- backend/src/repositories/booking-policy.repository.test.ts
- backend/src/repositories/booking-policy.repository.ts
- backend/src/services/booking-approval-validation.test.ts
- backend/src/services/booking-deadline-worker.test.ts
- backend/src/services/booking-deadline-worker.ts
- backend/src/services/booking-lifecycle.service.ts
- backend/src/services/booking-lifecycle.test.ts
- backend/src/services/booking-policy-payments.test.ts
- backend/src/services/booking-timing-policy.test.ts
- backend/src/services/booking-timing-policy.ts
- frontend/src/app/core/models/booking-policy.model.ts
- frontend/src/app/shared/components/booking-policy-summary/booking-policy-summary.spec.ts
- frontend/src/app/shared/components/booking-policy-summary/booking-policy-summary.ts

## Documentation

- docs/BOOKING_FLOW_ROLLBACK_2026-11-03.md (this report)
- docs/BOOKING_PAYMENT_POLICY_2026-11-02.md (marked historical/rolled back)
- docs/superpowers/plans/2026-11-02-booking-deadlines.md (marked superseded)
- docs/superpowers/plans/2026-11-03-booking-policy-rollback.md (active task ledger)
