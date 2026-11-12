# Admin operations and payment proof verification - November 12, 2026

## Delivered behavior

- The overview keeps urgent work separate from the latest 20 durable reservation/payment activity records. Customer creation, edits, cancellation, payment-method selection/changes and proof submissions remain visible after review. Admin event-time adjustments also appear with an explicit administrator label.
- Sidebar badges show pending reservation reviews, submitted proofs and bank-transfer reservations awaiting an available QR assignment. Background refresh runs across admin pages and does not renew either client or server idle activity. Expired sessions still receive normal 401 handling.
- The optional average-booking metric is hidden. The upcoming-events label specifies the seven-day window. Outstanding balance includes active reservation states, matching its label.
- Capacity information sits below the event/customer details without repeating the scheduled date or the normal availability explanation. Capacity-confirmation warnings remain visible.
- Payment QR images are centered, retain their aspect ratio and use up to 380px width / 460px height.
- Updated by the owner's later request: the proof form shows Payment date as non-interactive text, with no calendar picker or separate Submission date block. New proofs default to the current Philippine date; replacing a submitted proof preserves its original payment date. Persisted submission time remains the server-generated proof creation timestamp.
- Administrators can adjust an active reservation's agreed time, including 10 PM. A confirmation shows old/new times. The transaction checks the original time under a reservation lock, rejects terminal states/stale edits, updates history and records administrator/old/new values in the audit log. Customer reservation retrieval reflects the saved time.

Existing tables are reused; no schema migration is required. Creation/audit timestamps with server-local defaults are normalized to UTC before ordering alongside UTC history/proof timestamps, then displayed in Philippine time. Previously unrecorded payment-method changes cannot be reconstructed; new changes are recorded transactionally.

## Verification

| Check | Result |
| --- | --- |
| Frontend tests | 543 passed across 66 files (3 workers) |
| Backend tests | 573 passed, 2 skipped, 0 failed |
| Angular production build | Passed; existing booking stylesheet / QR CommonJS warnings remain |
| Backend TypeScript build | Passed |
| Responsive browser checks | 35 cases across 320, 390, 430, 768, 1024, 1440 and 1920px; zero reported issues |
| Fresh local SQL verification | Passed; migrations/schema checks and all four configured E2E journeys passed; disposable database cleanup completed |
| Code review | Two findings corrected and re-reviewed: background idle renewal and mixed timestamp clocks |

The SQL operations journey verifies authentication restrictions, a 10 PM adjustment, stale-edit rejection, customer visibility, history, payment-choice activity, QR assignment counts, UTC activity timestamps, and unchanged server last-activity time after an automatic poll.

Browser checks use mocked responses, a non-payment QR layout fixture and blocked payment/time writes. Run `node scripts/check-responsive-layout.cjs --operations-only --screenshots --report=admin-operations-final.json` after building the frontend. Screenshots/reports are under `.codex-temp/responsive/`. These checks do not establish real inbox delivery, a live bank payment, or operator acceptance in production.
