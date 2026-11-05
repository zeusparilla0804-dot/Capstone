> **Historical report ? rolled back November 3, 2026.** The active flow now uses the earlier calendar-day and cash rules. See [rollback report](BOOKING_FLOW_ROLLBACK_2026-11-03.md). The version-2 implementation below is retained only as historical documentation.

# Booking review, payment, preparation and confirmation policy

Implemented November 2, 2026, Asia/Manila. This report describes policy version 2 and distinguishes code/SQL verification from live deployment.

## What changed

The previous three-calendar-day submission rule and five/seven-day cash window no longer govern new requests. Timing now separates initial review, customer payment allowance, manual online verification and event preparation. Dates/times are calculated in Philippine Time and persisted as UTC timestamps.

| Requirement | Version 2 implementation |
| --- | --- |
| Preparation | 1–499 guests: 72 hours; 500–1,500: 120 hours between normal confirmation and event start, equally for all methods |
| Cutoff | Actual Manila event date/time minus the required elapsed preparation hours; exact equality is allowed |
| Initial review | Target 10 operating hours, counting only daily 08:00–18:00 Philippine Time; outside-hours requests count from next opening |
| Pending request | No payment deadline/countdown and no v2 capacity hold; overdue review is an admin attention item, not approval or expiry |
| Cash | Approval date is excluded from counting; next open date is day 1 and following date is day 2, due at 18:00; earlier office payment is allowed |
| Online | GCash/bank transfer: saved deadline is approval +24 elapsed hours; proof verification target is 10 operating hours after submission |
| Approval feasibility | Normal deadline plus full online verification allowance must fit before the preparation cutoff; review delay does not silently shorten allowances |
| Short notice | Explicit customer opt-in for future event dates; operational review rather than normal availability/confirmation guarantee |
| Exceptions/extensions | Authorized admin, reason, explicit timezone-bearing deadline, acknowledgment when preparation is waived; persisted and audited |
| Actual payment | Only actual recorded/verified money contributes; uploaded amounts are claims until reviewed |
| Confirmation | Separate admin decision, verified/recorded deposit >=50%, valid held capacity, preparation cutoff or documented exception |
| Remaining balance | Existing event-date due rule preserved |

The threshold and timing defaults are centralized in `backend/src/services/booking-timing-policy.ts`. There is no existing closure calendar; every date is currently an open office date. An approval on November 10 normally gives a Cash deadline of November 12 at 6 PM, subject to feasibility for the chosen event start.

## Persistence and historical compatibility

Migration `020_booking_timing_policy.sql` adds `BOOKING_POLICY` and extends the reservation status constraint for `EXPIRED`. It stores policy version, event start, preparation cutoff/hours, review target, approval time, payment/verification targets, hold state and operational exception metadata. It does not backfill or fabricate historical approvals/deadlines.

The pending migration list was inspected first: only migration 020 was pending. It was applied to the local development database, and the full compatible schema contract was verified afterward.

- New booking intents receive policy version 2 in the same transaction as reservation/payment creation.
- Existing keyed submissions replay their original response before new timing/catalog/capacity validation. The historical canonical hash is unchanged when short-notice consent is absent/false.
- Confirmed/historical records and existing recorded money/proofs/references are preserved.
- Existing unconfirmed bookings lacking saved policy metadata are flagged for admin review and explicit new approval, without automatic retroactive expiry.
- Pending v2 material edits revalidate timing/pricing and maintain the original reservation identity. Customer edits after approval remain rejected; there is no silent deadline reset or approved-booking edit form.

## Booking and payment states

Existing physical reservation states remain compatible, with `EXPIRED` added. Saved policy stages distinguish Pending Review, Short-notice Review, Awaiting Payment, Confirmed, Expired and operational review flags. Payment indicators remain derived from actual cumulative recorded/verified money independently of reservation confirmation.

Admin approval uses dedicated endpoints rather than arbitrary APPROVED/AWAITING_PAYMENT status patches. It validates final total/event snapshot, rechecks capacity, saves deadlines and acquires the temporary hold atomically. A paid expired request can recover payment-verified eligibility only through explicit renewed approval and a fresh capacity check; recording late money alone does not restore it.

Verification records the actual approved amount, retains correction/rejection reason requirements, and preserves duplicate-credit and overpayment checks. Reaching 50% does not automatically confirm a reservation. Later balance payments preserve confirmed/completed lifecycle state.

Cash requires the actual receipt timestamp for v2, amount and receipt/reference. The optional office record-and-confirm action is transactional. If confirmation is ineligible, the money is still recorded and the response gives the blocked-confirmation reason. Reference retries do not credit again.

## Expiry and capacity

| At/after saved deadline | Result |
| --- | --- |
| Exactly at deadline | Still timely |
| Past deadline, zero recorded money and no pending proof | Expired; temporary hold released |
| On-time pending proof | Hold retained; overdue verification escalated; no unpaid expiry |
| Preparation cutoff with unresolved proof | Explicit operational decision; no silent confirmation or release |
| Recorded money below deposit | Manual review/contact; no forfeiture or unpaid-expiry release |
| Rejected proof after deadline, no other claim/money | Expired; original deadline remains unchanged |
| Late money/claim | Accounted for and flagged; no automatic capacity restoration or confirmation |

New pending requests do not consume held capacity. Held/confirmed allocations participate in locked date-capacity calculations. Capacity queries also exclude overdue zero-money/no-proof holds when the worker is delayed; money or unresolved proofs prevent that exclusion. Reservation/payment/policy/proof decisions use transaction-bound locking. The final-slot contention test models the production range-lock requirement and verifies only one winner and one notification; it is not a live multi-connection SQL race test.

A bounded one-minute worker performs expiry/escalation with no overlapping pass and awaited shutdown. Relevant customer/admin reads and payment operations enforce transaction-bound fallbacks. Late-cash/proof writes settle overdue unpaid state before accounting, so missing a worker pass cannot preserve or revive an expired allocation.

## Customer/admin interface

Existing design/components are retained. Event Details shows preparation guidance, method-specific normal eligibility and explicit short-notice opt-in. Timing lookup/submission fails closed if eligibility cannot be verified. Re-entering a v2 draft preserves unsaved details while resolving its actual policy metadata.

Review/Payment Method explains when the countdown starts. Saved deadlines and totals appear in customer reservations/dashboard/billing/payment and admin detail. Pending claims are distinguished from paid amounts; the payment request shows the remaining deposit, never asks for an already verified deposit, and suppresses new-transfer instructions for expired/review-blocked records. Receipt history remains accessible. Approval email wording explicitly says approved for payment, not confirmed.

Admin pages expose review attention items, dedicated approval/exception/extension actions, actual Cash receipt time, and optional combined confirmation. Expired/review-blocked records do not offer premature detail-page confirmation.

## Verification

| Check | Result |
| --- | --- |
| Full backend tests | 522 passed, 2 existing skips, 0 failed |
| Full frontend tests | 382 passed across 56 suites, 0 failed |
| Backend TypeScript build | Passed |
| Angular production build | Passed |
| Actual SQL rollback-only verification | Passed |
| Local schema contract, including migration 020 | Passed |
| Scoped whitespace check | Passed; existing CRLF normalization notices only |

Boundary/regression coverage includes 499/500 guests, exact 72/120 hours, office opening/closing, cash counting, online elapsed deadline and office verification, delayed review, inclusive deadline proof, pending/partial/rejected/late payments, stable deadlines, stale totals/event details, strict timestamp/boolean validation, invalid calendar-date rejection, historical replay hashes, backend bypass prevention, concurrent hold contention mock, and optional cash confirmation.

The actual SQL script `backend/e2e/booking-policy.e2e.ts` uses future fixture dates and an injected clock inside one rollback-only transaction. It verifies saved holds/deadlines, exact cutoff confirmation, inadequate deposit denial, short-notice routing, proof retention/rejection, unpaid expiry, partial/late cash, and worker-delay capacity fallback. Before/after row counts and SHA-256 snapshots of eight business/history/outbox tables matched. No committed fixture, proof binary, or sent test email remains from this check.

Logs are in `.codex-temp/booking-policy-backend-final.log`, `booking-policy-frontend-full.log`, `booking-policy-backend-build.log`, `booking-policy-frontend-build-final.log` and `booking-policy-sql-final.log`.

## Operational limitations and retained conflicts

- No backend listener was detected on localhost:3000 at the final process check. No application server was started/restarted. The updated backend must be running to serve APIs and start the deadline worker. Frontend port 4200 was unchanged.
- The migration was applied locally only. Other environments require migration 020 and the updated application together.
- No live Chrome/device visual check, real multi-connection SQL contention/load test, SMTP delivery or end-to-end customer payment was performed. Automated frontend checks, transaction mocks and rollback-only SQL are the available evidence.
- **Existing invoice conflict intentionally not changed:** invoice `due_at` is currently issue time +7 days (`backend/src/repositories/invoice.repository.ts`), while the invoice terms and customer instructions say the remaining balance is due on the event date (`frontend/src/app/features/invoice/invoice.page.html`). The event-date balance rule was preserved; invoice deadline policy needs a separate explicit correction.
- Existing signed-agreement cancellation/forfeiture wording was retained. This implementation adds no automatic forfeiture/refund logic and never forfeits partial money through unpaid expiry.
- Daily office opening is the current policy; closure/calendar administration is not a new feature in this change.

## Exact implementation and test files

- `backend/e2e/booking-policy.e2e.ts`
- `backend/migrations/020_booking_timing_policy.sql`
- `backend/src/controllers/admin.controller.ts`
- `backend/src/controllers/booking-policy.controller.ts`
- `backend/src/controllers/booking.controller.test.ts`
- `backend/src/controllers/booking.controller.ts`
- `backend/src/migrations/booking-policy-schema.test.ts`
- `backend/src/migrations/schema-contract.ts`
- `backend/src/repositories/admin.repository.ts`
- `backend/src/repositories/booking-availability.repository.test.ts`
- `backend/src/repositories/booking-availability.repository.ts`
- `backend/src/repositories/booking-policy.repository.test.ts`
- `backend/src/repositories/booking-policy.repository.ts`
- `backend/src/repositories/booking-pricing.repository.test.ts`
- `backend/src/repositories/booking-submission.repository.test.ts`
- `backend/src/repositories/booking.repository.ts`
- `backend/src/repositories/manual-payment.repository.test.ts`
- `backend/src/routes/admin.routes.ts`
- `backend/src/routes/booking.routes.ts`
- `backend/src/routes/payment-proof.routes.test.ts`
- `backend/src/server.ts`
- `backend/src/services/admin.service.ts`
- `backend/src/services/booking-approval-validation.test.ts`
- `backend/src/services/booking-deadline-worker.test.ts`
- `backend/src/services/booking-deadline-worker.ts`
- `backend/src/services/booking-flow-hardening.test.ts`
- `backend/src/services/booking-lifecycle.service.ts`
- `backend/src/services/booking-lifecycle.test.ts`
- `backend/src/services/booking-policy-payments.test.ts`
- `backend/src/services/booking-status.service.test.ts`
- `backend/src/services/booking-status.service.ts`
- `backend/src/services/booking-submission-policy.ts`
- `backend/src/services/booking-timing-policy.test.ts`
- `backend/src/services/booking-timing-policy.ts`
- `backend/src/services/cash-payment.service.test.ts`
- `backend/src/services/notification-domain.service.test.ts`
- `backend/src/services/payment-proof.service.test.ts`
- `backend/src/services/payment-proof.service.ts`
- `backend/src/services/payment-verification.service.test.ts`
- `backend/src/services/payment-verification.service.ts`
- `backend/src/templates/email-templates.ts`
- `backend/src/types/admin.types.ts`
- `backend/src/types/domain.types.ts`
- `frontend/src/app/core/models/admin.model.ts`
- `frontend/src/app/core/models/booking-policy.model.ts`
- `frontend/src/app/core/models/booking.model.ts`
- `frontend/src/app/core/models/index.ts`
- `frontend/src/app/core/services/admin.service.spec.ts`
- `frontend/src/app/core/services/admin.service.ts`
- `frontend/src/app/core/services/booking.service.spec.ts`
- `frontend/src/app/core/services/booking.service.ts`
- `frontend/src/app/core/utils/customer-payment-status.spec.ts`
- `frontend/src/app/core/utils/customer-payment-status.ts`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.html`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.spec.ts`
- `frontend/src/app/features/admin-booking-detail/admin-booking-detail.page.ts`
- `frontend/src/app/features/admin-bookings/admin-bookings.page.html`
- `frontend/src/app/features/admin-bookings/admin-bookings.page.spec.ts`
- `frontend/src/app/features/admin-bookings/admin-bookings.page.ts`
- `frontend/src/app/features/admin-payments/admin-payments.page.html`
- `frontend/src/app/features/admin-payments/admin-payments.page.spec.ts`
- `frontend/src/app/features/admin-payments/admin-payments.page.ts`
- `frontend/src/app/features/booking/booking.page.html`
- `frontend/src/app/features/booking/booking.page.spec.ts`
- `frontend/src/app/features/booking/booking.page.ts`
- `frontend/src/app/features/booking/components/booking-success/booking-success.html`
- `frontend/src/app/features/booking/components/booking-success/booking-success.spec.ts`
- `frontend/src/app/features/booking/components/booking-success/booking-success.ts`
- `frontend/src/app/features/checkout/checkout.page.html`
- `frontend/src/app/features/checkout/checkout.page.spec.ts`
- `frontend/src/app/features/checkout/checkout.page.ts`
- `frontend/src/app/features/customer-billing/customer-billing.page.html`
- `frontend/src/app/features/customer-billing/customer-billing.page.spec.ts`
- `frontend/src/app/features/customer-billing/customer-billing.page.ts`
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.html`
- `frontend/src/app/features/customer-dashboard/customer-dashboard.page.ts`
- `frontend/src/app/features/payment-proof/payment-proof.page.html`
- `frontend/src/app/features/payment-proof/payment-proof.page.spec.ts`
- `frontend/src/app/features/payment-proof/payment-proof.page.ts`
- `frontend/src/app/shared/components/booking-card/booking-card.html`
- `frontend/src/app/shared/components/booking-card/booking-card.ts`
- `frontend/src/app/shared/components/booking-policy-summary/booking-policy-summary.spec.ts`
- `frontend/src/app/shared/components/booking-policy-summary/booking-policy-summary.ts`
- `frontend/src/app/shared/components/status-badge/status-badge.ts`

Documentation: `docs/BOOKING_PAYMENT_POLICY_2026-11-02.md` and `docs/superpowers/plans/2026-11-02-booking-deadlines.md`. Other pre-existing dirty workspace changes were preserved.
