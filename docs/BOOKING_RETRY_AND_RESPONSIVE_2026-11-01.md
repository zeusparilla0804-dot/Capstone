# Booking retries and customer portal responsiveness

Date: November 1, 2026 (Asia/Manila).

## Booking retry protection

The Angular booking draft creates one UUID for a new reservation intent. Both the booking form and alternate checkout reuse that UUID in `Idempotency-Key` when retrying. A successful reset, account change, or explicit new-reservation entry starts a new key. Edit submissions continue using PATCH rather than creating another reservation.

The backend stores an owner-scoped key, canonical request hash, reservation ID, and original response in `dbo.BOOKING_SUBMISSION`, in the same transaction as the reservation, payment stub, and notification intent. A serialized key lookup runs before catalog/capacity/timing checks. Identical replays return the original response even if availability or the original event window has since changed. Reusing a committed key with different details returns 409. Failed transactions leave no committed key or duplicate business records.

The browser retains an uncertain attempt's fingerprint. Changing details after a network/server failure does not silently turn that attempt into a second reservation. The customer is directed to check existing reservations or restore the original details. Definite ordinary 4xx validation failures permit correction; account-generation checks continue preventing stale responses from another customer.

The header is optional for existing API clients to preserve compatibility; the updated Angular creation paths always send it. Clients that omit the key do not receive a replay guarantee. Keys are account-scoped, not a ban on deliberately making separate reservations.

Migration `017_booking_submission_idempotency.sql` was applied to the verified local development database. Only this migration was pending. It adds the new table and its constraints without modifying existing reservations/payments. A readback confirmed five table columns and one migration marker. The E2E fixture cleanup source was updated for the new foreign key, but those cleanup scripts were not executed.

## Responsive fixes

- Billing & Payments: removed the accumulated horizontal transforms on Total/Paid/Balance. Event, status, amounts, and actions now occupy explicit separate grid areas. Layout follows the content container's width rather than guessing remaining space from the viewport alone.
- Below 520px available content, records stack. At 520px and above, event/status share a row while amounts and buttons have independent full-width rows. At 980px available content, the record uses a single desktop row.
- Narrow summaries use aligned label/value rows; large financial values can wrap rather than overlap. Long status labels fit their available space; action labels wrap and retain touch-friendly height.
- Dashboard: removed the 60px detail offsets; event panels stack when the space left by the sidebar is narrow. Long welcome names can wrap.
- Profile: long names wrap, and the profile/contact panels stack at content-width thresholds rather than clipping inside a narrow tablet column.
- Public authentication header: the 921–1100px range uses compact gaps without the negative navigation offset. Large desktop and existing mobile navigation behavior are preserved.

Source review covered the breakpoint conditions relevant to 320, 375, 390, 414, 768, 820, 960, 1024, 1280, and 1440px viewport widths, including an expanded sidebar. This is a source/cascade review, not a set of rendered pixel measurements. My Reservations and Payment Proof already have responsive card/stacking rules; no equivalent hardcoded offset issue was established there in this pass.

## Verification

- Backend unit/route tests: **423 passed, 2 skipped, 0 failed**.
- Angular tests: **330 passed across 54 files**.
- Customer billing layout regression checks: **2 passed**.
- Backend TypeScript check: **passed**.
- Angular production build: **passed**.
- Mock regressions cover lost responses, identical and conflicting concurrent submissions, rollback/retry, account isolation, original-response replay, invalid keys, shared frontend keys, and explicit new intent.

The user authorized Chrome visual checks. Browser discovery and a direct attempt to open Chrome both returned **“The browser access host is unavailable.”** No Edge fallback was used. Actual Chrome screenshots, real-device alignment, and live SQL concurrency behavior have not been verified; unit/mock concurrency checks and the local schema readback are the evidence available from this pass.

## Files

Backend: `migrations/017_booking_submission_idempotency.sql`; `src/controllers/booking.controller.ts`; `src/types/domain.types.ts`; `src/repositories/booking.repository.ts`; new `src/repositories/booking-submission.repository.ts` and tests; new `src/services/booking-submission-policy.ts`; migration schema-contract and schema tests; fresh-database and fixture cleanup source.

Frontend: booking/draft services and tests; booking and checkout submission call sites and tests; explicit new-reservation links in Dashboard, My Reservations, public header, and package selection; Billing/Dashboard/Profile/public-header responsive styles; affected approved-layout tests; `scripts/customer-billing-layout.test.mjs`.

No dependencies, fonts, prices, payment calculations, or localhost ports were changed. No live test booking or payment was created by the verification tools, and no existing business records were deleted.
