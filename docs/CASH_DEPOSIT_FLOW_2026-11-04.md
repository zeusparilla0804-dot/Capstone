# Cash deposit flow — November 4, 2026

This scoped correction supersedes the two-office-day cash allowance described in the November 3 rollback report. The user removed that allowance because the office accommodates customers daily. Office hours remain 8:00 AM–6:00 PM Philippine Time.

## Active rules

- Cash bookings below 500 guests require three calendar days for preparation; bookings of 500–1,500 guests require five calendar days.
- A new cash booking or customer edit must leave enough time to pay by the preparation cutoff. Before 6 PM PHT, its earliest date is today plus three/five days. At or after closing, that minimum advances by one day. There is no additional two-day allowance.
- The 50% deposit deadline is the event date minus three/five calendar days, at 6 PM PHT. Approval does not move or restart it.
- Admin approval and the subsequent payment request use that fixed deadline, rather than recalculating the minimum for a new request. An unpaid deposit can proceed through exactly 6 PM; later requests are blocked with the actual deadline. Paid deposits meeting the existing 50% threshold retain their overdue-deposit exemption.
- Both cash transitions reject an event date already past in Manila, including paid bookings. This safeguard compares calendar dates; it does not introduce an event-time scheduling policy.
- Actual receipt recording, outstanding-balance settlement, capacity checks, required capacity confirmation, status history, audit, notification queuing, and booking idempotency remain intact. Recording payment and final reservation confirmation remain separate actions.
- No bookings are automatically cancelled, rescheduled, marked paid, or confirmed. Existing database records and schemas were not changed.

For example, a November 8 event below 500 guests has a November 5, 6 PM deposit deadline. Reviewing it on November 4 no longer demands a fresh two-day office allowance. A November 3 event reviewed on November 4 remains past and cannot be approved.

## Changes

Backend:

- `backend/src/services/cash-payment-policy.ts`
- `backend/src/services/cash-payment-policy.test.ts`
- `backend/src/services/booking-status.service.ts`
- `backend/src/services/booking-status.service.test.ts`
- `backend/src/controllers/booking.controller.test.ts`
- `backend/src/services/booking-flow-hardening.test.ts`
- `backend/src/repositories/booking-submission.repository.test.ts`

Frontend:

- `frontend/src/app/core/utils/cash-payment-policy.ts`
- `frontend/src/app/core/utils/cash-payment-policy.spec.ts`
- `frontend/src/app/features/booking/booking.page.ts`
- `frontend/src/app/features/booking/booking.page.spec.ts`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.ts`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts`
- `frontend/src/app/features/admin-bookings/admin-bookings.page.ts`
- `frontend/src/app/features/admin-bookings/admin-bookings.page.spec.ts`

The misleading rolling-date warning was removed from saved admin reservations. Both approval entrypoints display backend rejection details. Existing approval animations and layout were preserved. Customer payment instructions already used the fixed deadline and did not need changes.

## Verification

- Frontend: 384 tests passed across 56 files; production build passed.
- Backend: 476 passed, 2 POSIX file-permission checks skipped on Windows, no failures; TypeScript build passed.
- Targeted whitespace checks passed. Independent static review found no important scoped issue.
- Regression coverage includes both preparation tiers, office closing and Manila midnight, delayed review, exact cutoff and one millisecond after, past events, paid-deposit exemption, delayed payment requests, post-lock clock checks, original submission replay/edit validation, and existing approval feedback.
- No live browser, live database approval, or email delivery test was performed. No manual server restart, package install, migration, commit, backup, or record cleanup was performed.
