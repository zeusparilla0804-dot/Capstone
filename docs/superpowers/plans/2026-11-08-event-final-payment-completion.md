# Event final payment and completion implementation plan

**Goal:** Let staff explicitly record an event's actual remaining payment and complete the event, with an updated receipt and visible completion status.

**Architecture:** Add an administrator-only completion command using the existing locked, transactional payment ledger. Require explicit receipt-of-funds and event-finished confirmations; compare the submitted amount with the locked remaining balance. Reuse receipt reference idempotency, audit history and notification outbox. Fully paid events complete without another payment row. Keep event status visible alongside payment status on customer and admin surfaces, and include the live booking status in receipts.

**Tech stack:** Angular, Express, TypeScript, SQL Server, Node test runner, Vitest and Playwright.

- [x] Add tests for partial-balance settlement, atomic rollback, retries, stale amounts, future events, already-paid completion, and late cash completion.
- [x] Implement the completion command, protected endpoint and ledger integration. Keep generic status changes from inventing a payment.
- [x] Add a final-payment section on reservation details with payment method/date/reference, actual-receipt confirmation, event-finished confirmation and the shared confirmation/result dialogs.
- [x] Show Completed separately from Fully Paid; expose the booking status on the updated receipt.
- [x] Verify backend and frontend tests and desktop/mobile flows using mocked payments only.

Completion must never manufacture a payment solely because a status button was clicked. Online payments require an actual transaction reference and explicit staff verification. A final cash collection can be recorded at the event even when the initial deposit used bank transfer. No actual customer records are to be changed during verification.

## Verification

- Backend completion, cash ledger and booking transitions: 90 tests passed. Invoice, payment-proof, verification and mounted proof-route regression tests passed. Backend TypeScript check passed.
- Frontend regression suite: 64 files, 496 tests passed.
- Playwright at 1577px and 390px: confirmation, cancellation, failed submit and stable retry key, final cash after bank deposit, Completed/Fully Paid badges, receipt with two recorded payments and zero balance, fully paid completion without a new payment, and future-event restriction passed. APIs were mocked; no actual customer payments were recorded.
- Receipts refresh when the user returns to an already-open receipt tab. Reservation details reload after successful completion and expose a direct updated-receipt link.
- Production build remains subject to the previously reported, unrelated booking stylesheet budget issue; it was not changed in this task.
