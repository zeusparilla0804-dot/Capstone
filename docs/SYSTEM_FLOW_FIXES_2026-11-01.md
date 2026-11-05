# La Chef flow hardening: implementation and verification

Date: November 1, 2026 (Asia/Manila)

Implements the approved fixes from [the flow review](SYSTEM_FLOW_REVIEW_2026-11-01.md) and the additional administrator receipt-history request. The original audit is retained as a record of the failures that motivated this work.

## Verified results

| Check | Result |
| --- | --- |
| Full backend unit/route suite | 410 passed, 2 skipped, 0 failed |
| Full Angular suite | 323 passed across 54 files, 0 failed |
| Backend `tsc --noEmit` | Passed |
| Angular production `ng build` | Passed; initial bundle 347.16 kB, estimated transfer 91.90 kB |
| Whitespace checks | Passed; Git reports existing line-ending normalization notices only |
| Independent integration review | Identified the cancellation/pending-proof interaction; repaired and covered before the full passing run |

Consequential regression scenarios were reproduced with mock tests before implementation. The full suites above were then run against the integrated changes, including the final cancellation and navigation-count fixes.

No SQL-backed E2E, live payment, email delivery test, browser automation, migration, data deletion, dependency installation, Git commit, or manual server restart was performed. Localhost:4200 remains the configured customer development port. Existing business rows and uploaded files were not deliberately mutated by this work.

## Repairs

| Audit item | Implemented behavior |
| --- | --- |
| H-01 Duplicate manual credit | All new manual payments require a receipt/transaction reference. The existing persisted unique method/reference pair is used as the replay key. A matching booking/payment, amount in cents, and payment date returns success without another credit, audit event, or queued notification. Conflicting reuse returns a conflict. No schema migration was necessary. |
| H-02 Edit creates a second booking | Shared edit identity is preserved through checkout and explicit return links. Both confirmation paths PATCH the original reservation. Starting a fresh reservation does not silently resume an abandoned edit. |
| M-01 Customer state survives account changes | A synchronous customer-account scope resets booking rows, draft/edit identity, catalog state, and customer badge counts. Pending responses are cancelled or generation-checked so the previous account cannot repopulate the next account's stores. |
| M-02 Old reset link after email correction | Email corrections invalidate outstanding resets transactionally. Issuance rechecks the current recipient under the account lock, and queued reset delivery verifies the current recipient. |
| M-03 Add-ons silently removed | Saving is blocked while catalog loading fails or a saved selection is missing. The customer must explicitly resolve unavailable selections; an incomplete catalog is not interpreted as an intentional removal. The API payload builder also rejects mismatched selected IDs. |
| M-04 Exact settlement rejected | Manual cumulative balance comparisons use integer cents. Exact final settlement remains valid while genuine overpayment is rejected. |
| M-05 Completed event cannot settle | Completed reservations accept legitimate remaining payments without changing their completed lifecycle status. |
| M-06 Edited reservation counted twice | Availability preview accepts an editing reservation ID only after validating the authenticated owner and pending-edit eligibility. It excludes that same reservation, matching actual locked update behavior. |
| M-07 Checking never finishes | Availability updates deduplicate before moving identical queries into a new checking state; quick invalid-to-valid restoration resolves normally. |
| M-08 Revoked session looks authenticated | Protected API 401 handling clears the corresponding role's local auth state and returns to the appropriate sign-in route. Invalid-login responses and failures belonging to a previous session do not log out a newer session. Local logout is safe when the server session is already invalid. |
| M-09 Cash method omitted during edit | Locked updates validate the effective stored/request payment method before accepting an event date. Omitting the method cannot avoid the existing cash window. |
| L-01 Inactive-email registration returns 500 | Registration checks email existence across all account statuses and maps duplicate-key races to a controlled conflict, while inactive login remains denied. |
| P-01 Remaining online balance | Customers can submit further GCash/bank-transfer proofs while payment is verified or the reservation is confirmed/completed, provided a balance remains. Submission and review preserve the advanced reservation lifecycle; a rejected balance proof does not undo the verified deposit or reservation confirmation. |

Manual payments now supersede any submitted proof for that booking, including supplementary balance proofs on verified/confirmed/completed events. An exact replay does not supersede a newer proof. Cancellation also supersedes pending supplementary proofs transactionally, preserving receipt history and removing impossible review actions from the pending queue.

Customer My Reservations and Billing actions use consistent remaining-balance eligibility. Cash remains office-only, including late settlement of a completed event; it does not expose an online upload form.

## Administrator receipt history

Navigation: **Reservations → View reservation → Payment proof history → View receipt**.

- The history query is scoped server-side to the reservation, supports all proof statuses, and paginates older submissions.
- Entries show method, claimed amount, reference, submitted time, status, verified amount, and rejection reason where applicable.
- Reviewed entries open the existing protected receipt viewer in read-only mode. They cannot be verified or credited again.
- The viewer returns to the matching reservation when opened from its history; queue-origin visits still return to the payment queue.
- A history-loading failure shows a retry without hiding the reservation's main details.

Backend history filters remain administrator-protected and validate reservation identifiers; customer proof ownership rules are unchanged.

## Build and design verification gates

The three stale profile/header tests now assert the approved current design: no duplicate reservation CTA in Profile, medium account-value weight, and the approved warm-gold logo accent. Production UI colors/layout were not changed to fit old expectations.

Obsolete overridden catalogue typography declarations were removed without changing the later effective typography. Component-style budgets were deliberately reassessed from a 7/8 kB warning/error pair to 17/18 kB for the existing feature-rich components, including the approximately 16.8 kB scoped four-step booking form. This is a budget-policy adjustment, not a claim that all component styles were reduced below 8 kB. The initial JavaScript/CSS bundle budgets remain unchanged at 500 kB warning and 1 MB error, and the production build was actually rerun.

## Main implementation areas

- Backend: `services/admin.service.ts`, `repositories/admin.repository.ts`, `services/payment-proof.service.ts`, `services/payment-verification.service.ts`, `repositories/payment-proof.repository.ts`, `types/admin.types.ts`.
- Backend booking: `controllers/booking.controller.ts`, `services/booking.service.ts`, `repositories/booking.repository.ts`, `services/booking-availability.service.ts`, `services/booking-status.service.ts`.
- Backend account recovery: `services/auth.service.ts`, `repositories/auth.repository.ts`, `repositories/customer-admin.repository.ts`, `repositories/password-recovery.repository.ts`, `services/password-reset-email.service.ts`.
- Frontend state/auth: `core/services/customer-account-scope.service.ts`, `auth.service.ts`, `admin-auth.service.ts`, `booking.service.ts`, `booking-draft.service.ts`, `portal-badge-state.service.ts`, and `core/interceptors/api.interceptor.ts`.
- Frontend flows: booking, checkout, payment-proof, admin-payments, admin-booking-detail, admin-payment-review, customer-billing, shared booking-card, and `core/utils/customer-payment-status.ts`.
- Release configuration and unchanged-appearance cleanup: `frontend/angular.json`, `features/packages/packages.page.scss`, and approved-design assertions in the profile/header specs.
- Focused regression tests accompany these changes, including new registration, booking-flow, checkout, account-scope, and interceptor coverage.

Paths in the backend/frontend groups are relative to `backend/src` and `frontend/src/app` respectively. The implementation plan is [here](superpowers/plans/2026-11-01-flow-hardening.md).

## What is still not proven

Passing unit tests, mocks, and builds do not prove a system has zero defects. Real SQL locking/unique-index behavior under concurrent requests, lost network responses over the deployed stack, multi-instance workers, real devices/accessibility, TLS/proxy configuration, production permissions, coordinated database/proof recovery, and email delivery/retry monitoring require isolated staging verification. Existing deployment gates remain applicable.

The next operational check should use a disposable test database and controlled email recipients to exercise customer registration/sign-in, cash/GCash/bank-transfer deposit and balance settlement, receipt reopening, rejection/resubmission, cancellation, and concurrent/replayed writes. This work deliberately did not run those scenarios against existing customer data.
