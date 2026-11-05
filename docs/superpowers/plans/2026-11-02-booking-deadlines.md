> **Superseded:** user requested full rollback on November 3, 2026. See [rollback plan](2026-11-03-booking-policy-rollback.md). This is the historical implementation plan.

# Booking review, payment deadlines and capacity implementation plan

**Goal:** Implement the user's supplied policy as version 2, preserving historical money, bookings, references and retry protection.

**Spec:** The complete user request is in `C:/Users/klint charles/.codex/attachments/cc694d30-1297-4208-899e-52d65a94ea74/Pasted text.txt`.

**Architecture:** Pure Manila timing calculations feed persisted per-reservation policy metadata. Existing reservation/payment states remain compatible; explicit policy stages distinguish review, payment approval, manual decisions and expiry. A transaction-bound lifecycle service coordinates holds, proof/payment hooks, approval and confirmation. A bounded worker and read/write fallbacks enforce expiry without treating unresolved money as unpaid.

**Constraints:** No design overhaul, dependency installation, commits, record deletion or port changes. Existing confirmed bookings stay intact. Existing unconfirmed bookings without metadata are flagged for explicit review; no fabricated historical deadlines. Remaining balance remains due on event date.

## Differences from current code

- Current submission minimum is three calendar days (cash five/seven); replace new requests with review + payment + verification + exact preparation timing and explicit short-notice requests.
- Current pending requests consume capacity; v2 pending review must not hold capacity.
- Current cash deadlines are recomputed from event date; v2 payment deadlines are saved only at approval.
- Existing proofs/payments have transaction and replay safeguards; extend these rather than replace them.
- Existing statuses do not represent expiry or persisted operational exceptions.

## Interfaces and tasks

- [x] Pure timing service/tests: 499/500 guest boundary, exact 72/120-hour cutoff, ten office-hour review/verification, two strictly following cash office dates, 24 elapsed online hours.
- [x] Add migration 020 and `booking-policy.repository.ts`: UTC saved deadlines, review target, hold state, policy version, approver/reason/custom-deadline/preparation acknowledgment. No historical backfill.
- [x] Root lifecycle service: transaction-bound approval, extension, capacity checks, expiry decision, confirmation guard, late-money flags and protected unresolved claims. Every payment/booking write uses reservation → payment → policy/proof locks; capacity date decisions serialize in transaction.
- [x] Root booking integration: initialize v2 only for new intents, preserve stored replay before timing validation, pending edits revalidate; customer approved edits remain blocked pending admin re-review. Read metadata and flag legacy requests.
- [x] Payment integration: preserve real receipts, verified amount/correction/rejection rules, exact reference replays; support actual cash receipt timestamp and optional same-transaction confirmation. An inability to confirm must not discard recorded money.
- [x] Expiry worker plus read/write fallback: bounded one-minute sweeps, no overlapping pass, safe shutdown; no auto-expiry with money/pending proof.
- [x] Frontend: early method-specific eligibility/preparation guidance, short-notice opt-in, saved deadline summaries, expired transfer suppression, admin approval/exception/extension and attention queue, cash receipt timestamp/optional confirm.
- [x] Rollout and verification: additive local migration after inspecting pending list, full backend/frontend tests/builds, focused SQL rollback scenarios, report exact limitations and files.

## Review focus and tests

1. Exact deadline equality: timely proof at the deadline retains hold; confirmation exactly at preparation cutoff is allowed.
2. Delayed admin review: complete normal allowance never silently shrinks; failed normal approval saves short-notice stage for explicit review.
3. Money after expiry: record actual received money but do not revive capacity or auto-confirm; retries never double-credit.
4. Concurrent last capacity: only transactionally acquired HELD/CONFIRMED allocations count for v2; pending review is not a guarantee.
5. Historical missing metadata: read-only legacy flag, no retroactive expiry/deadline invention, explicit re-approval required for new countdown.

Verification commands use existing `tsx --test`, backend `tsc`, Angular tests/build and SQL transactions rolled back. No claim of live email or device verification without actual evidence.
