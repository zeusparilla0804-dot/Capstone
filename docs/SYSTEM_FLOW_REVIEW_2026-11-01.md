# La Chef system flow review

**Implementation follow-up:** The approved repairs and fresh verification results are recorded in [System flow fixes](SYSTEM_FLOW_FIXES_2026-11-01.md). The initial review below is preserved as historical evidence; its unresolved status and test counts describe the pre-fix working tree.

Review date: November 1, 2026 (Asia/Manila)

**Verdict: address the findings below before calling the workflows ready for production.** This review found 12 application defects, one payment-policy decision, and two verification/release gates. No demonstrated Critical backend authorization bypass was found in the inspected paths; that is not a guarantee that none exists.

This was a review, not a repair pass. No application source, configuration, credentials, business records, or existing audit documents were changed. This report is the only new project file. Tests used mocks; no SQL-backed E2E, browser automation, live payment, email delivery, migrations, server restart, or data cleanup was performed.

## Evidence and verification

| Check | Current result |
| --- | --- |
| Backend unit and route suite, `npm.cmd test` | 376 passed, 2 skipped, 0 failed |
| Backend TypeScript, `tsc --noEmit` | Passed |
| Angular tests, `ng test --watch=false` | 287 passed, 3 failed, 290 total across 51 files |
| Angular production build, `ng build` | Failed: 8 component styles exceed the configured 8 kB error budget |
| Manual-payment replay and exact-settlement probes | Actual service/repository execution with SQL fully mocked reproduced both defects below |
| Availability clear/restore probe | Exact RxJS operator ordering reproduced a stuck `checking` state with no additional request |

The frontend failures match the previously observed expectations: two profile tests expect a removed reservation-action section and weight 600 rather than 500; one public-header test expects the older gold color. These need reconciliation with the approved design. They are not proof that the business defects below are covered: the current passing suites miss the identified scenarios.

Source locations refer to the working tree reviewed today, not just the last Git commit. Several existing source files are compressed onto long lines.

## High priority

### H-01 Manual online-payment retries can credit the same payment twice

**Evidence:** [admin.service.ts](../backend/src/services/admin.service.ts#L88), [admin.repository.ts](../backend/src/repositories/admin.repository.ts#L43), [reference uniqueness index](../backend/migrations/004_phase8_production_hardening.sql#L22), [admin payment form](../frontend/src/app/features/admin-payments/admin-payments.page.ts#L90).

Cash requires a reference, but manual BANK_TRANSFER/E-WALLET records may have none. The unique reference index excludes NULL values, and the endpoint has no persisted request idempotency key. A disabled button prevents concurrent clicks in one rendered form; it does not protect a repeated request after an uncertain response.

**Scenario:** A booking owes PHP 100 with zero paid. Staff record PHP 25 by bank transfer without a reference; a response is lost and the action is retried. Both requests are accepted. The mocked service/repository probe produced two credits, PHP 50 paid, and `PAYMENT_VERIFIED`, despite only one intended payment.

**Recommended fix:** Require bank/GCash transaction references and introduce a persisted unique idempotency key for manual-payment requests. Replays of one request must return the original result. Different genuine payments must remain recordable. Keep credit, audit, invoice, and notification work in the existing transaction.

**Regression:** Retry the same request after a simulated committed-but-lost response; assert one credit and one balance change. Separately accept two legitimate distinct references.

### H-02 Editing a reservation through billing summary creates a new reservation

**Evidence:** [booking summary link](../frontend/src/app/features/booking/booking.page.html#L150), [checkout confirmation](../frontend/src/app/features/checkout/checkout.page.ts#L35), [checkout return links](../frontend/src/app/features/checkout/checkout.page.html#L12), [booking API calls](../frontend/src/app/core/services/booking.service.ts#L17).

The booking page keeps its editing ID locally, but `/checkout` receives only the shared draft. Checkout always calls `submitDraft`/POST, while its return links also omit the editing booking ID.

**Scenario:** Edit a pending booking on a date with spare capacity, change the venue, proceed to Payment, open “View full billing summary,” then confirm. A second reservation is created; the original remains unchanged. A full date may instead produce an unexpected capacity conflict.

**Recommended fix:** Carry edit identity through the shared draft and checkout navigation, and use PATCH for edits. The smallest containment option is to omit this alternate checkout path during editing until it supports that identity.

**Regression:** Confirm an edit through both normal Step 4 and billing summary; each must update one original reservation without calling creation.

## Medium priority

### M-01 Switching accounts retains another customer's draft and cached bookings

**Evidence:** [draft singleton](../frontend/src/app/core/services/booking-draft.service.ts#L23), [draft hydration](../frontend/src/app/features/booking/booking.page.ts#L114), [customer login/logout](../frontend/src/app/core/services/auth.service.ts#L24), [booking cache](../frontend/src/app/core/services/booking.service.ts#L8), [payment-page cached load](../frontend/src/app/features/payment-proof/payment-proof.page.ts#L86).

**Scenario:** Customer A enters an event and continues, logs out, then customer B signs in in the same running application. B opens booking and receives A's venue/date/time/guest information and can submit that draft under B. No request failure is needed for this draft disclosure.

The booking list cache also survives account changes and retains rows after load errors. Cached detail lookups skip HTTP. Failed B reloads can therefore leave A's cards and payment summary visible. In-flight A responses also lack an account-generation check. Backend ownership still blocks unauthorized mutations and proof downloads.

**Recommended fix:** Clear account-scoped draft, booking, and badge stores on logout/principal changes. Scope caches and in-flight responses to the authenticated customer, and discard responses belonging to a previous auth generation. Handle failed reloads without rendering another customer's rows.

**Regression:** A-to-B switching must leave no A draft/card/financial data, including failed reloads and late A responses.

### M-02 Old password-reset links remain usable after an email correction

**Evidence:** [customer email update](../backend/src/repositories/customer-admin.repository.ts#L38), [token issuance and consumption](../backend/src/repositories/password-recovery.repository.ts#L109).

Updating the customer's email does not invalidate outstanding resets. Reset consumption is bound to customer ID and token validity, without binding to the email/account version at issuance. A valid link delivered to an old or mistyped address can still change that account's password during its remaining 15-minute lifetime. Queued reset delivery has a related stale-recipient risk.

**Recommended fix:** Invalidate outstanding reset tokens transactionally when email changes. Bind token issuance/delivery/consumption to the current email or account version, including an issuance request already in flight during the correction.

**Regression:** Issue a token, correct the email, and verify that the old token cannot reset the account or be delivered afterward. New-email recovery must still work.

### M-03 An add-on catalog failure can silently remove existing add-ons during editing

**Evidence:** [saved selection hydration](../frontend/src/app/features/booking/booking.page.ts#L421), [catalog-derived selections](../frontend/src/app/core/services/booking-draft.service.ts#L40), [catalog error handling](../frontend/src/app/core/services/booking-draft.service.ts#L87), [replacement of saved add-ons](../backend/src/repositories/booking.repository.ts#L168).

Saved selected IDs are hydrated, but submitted add-ons are derived only from the separately loaded active catalog. Loading/error signals do not gate saving. An unavailable or deactivated selected catalog item disappears from the submitted array, and the backend replaces the old selections.

**Scenario:** Start a fresh session, edit a booking with add-ons, let `/add-ons` fail while booking/package loads succeed, change only the venue, and save. The original add-ons can be removed without an explicit removal action.

**Recommended fix:** Block save until required catalog data loads; detect missing selected IDs and require explicit resolution or preserve existing saved snapshots. Do not silently treat unavailable data as an intentional empty selection.

**Regression:** Failed catalog load and deactivated selected items must not alter existing add-ons or silently lower the total.

### M-04 Exact final cash payments can be incorrectly rejected as overpayments

**Evidence:** [manual payment cumulative arithmetic](../backend/src/repositories/admin.repository.ts#L43).

Manual recording adds binary floating-point numbers before comparing against the amount due. Example: PHP 10,000.10 paid + PHP 10,000.20 received becomes `20000.300000000003`, which compares greater than PHP 20,000.30 due. The mocked actual service/repository rejected that exact final settlement as an overpayment.

**Recommended fix:** Calculate cumulative amounts and comparisons in integer cents, as proof verification already does, then persist a two-decimal monetary value.

**Regression:** Accept that exact settlement; reject one cent above it; retain cumulative partial-payment behavior.

### M-05 Marking an event completed blocks later balance recording

**Evidence:** [completion transition](../backend/src/services/booking-status.service.ts#L19), [manual payment status allowlist](../backend/src/repositories/admin.repository.ts#L43).

`CONFIRMED -> COMPLETED` has no full-payment check, while manual payments reject `COMPLETED`. Staff can complete an event whose deposit was recorded but whose final cash payment has not yet been entered, then cannot reconcile that remaining payment through the existing flow.

**Recommended fix:** Prefer allowing legitimate balance recording against completed events while preserving `COMPLETED`. Alternatively, require full payment before completion if the business explicitly chooses that policy. Do not reopen the event or fabricate payment credit.

**Regression:** Complete a partially paid event and record its actual final payment without regressing its lifecycle status, or enforce the chosen full-payment precondition consistently.

### M-06 Availability preview counts an edited reservation twice

**Evidence:** [frontend availability request](../frontend/src/app/features/booking/booking.page.ts#L490), [preview includes a proposed event](../backend/src/services/booking-availability.service.ts#L68), [actual update excludes itself](../backend/src/repositories/booking.repository.ts#L119).

**Scenario:** One pending 1,000-guest event occupies its date, or six small events fill their date. An owner edits only the venue. Preview includes the existing reservation plus the edited proposal, reports FULL, and blocks saving. The actual locked update correctly supports excluding the original reservation, but the preview does not.

**Recommended fix:** Pass editing identity to an owner-validated availability preview and exclude that reservation. Never accept an arbitrary customer's exclusion ID.

**Regression:** An unchanged date at capacity must remain editable for its owner; moving into another full date must remain blocked.

### M-07 Quickly restoring an input can leave availability checking forever

**Evidence:** [availability observable](../frontend/src/app/features/booking/booking.page.ts#L473).

The stream marks the UI `checking` before the debounce and distinct-key operators. Clear a ready date and restore the same value within 300 ms: deduplication suppresses the request, while no code restores the ready state. The operator-sequence probe ended with `phase: checking, requests: 1`. Existing coverage restores values only after waiting through the debounce.

**Recommended fix:** Deduplicate before assigning checking, or preserve ready results for identical query keys. Ensure invalid-to-valid restoration always resolves to a ready/error state rather than indefinite loading.

**Regression:** Quick clear/restore and same-value emissions must not leave Continue disabled indefinitely; changed queries still require a fresh check.

### M-08 Expired or revoked sessions leave the frontend appearing authenticated

**Evidence:** [customer auth cache](../frontend/src/app/core/services/auth.service.ts#L14), [admin auth cache/logout](../frontend/src/app/core/services/admin-auth.service.ts#L13), [API interceptor](../frontend/src/app/core/interceptors/api.interceptor.ts#L4).

Cached users are accepted indefinitely by guards, and protected API 401s never clear them. After expiry, password reset, account deactivation, or remote session revocation, navigation still enters authenticated shells while API operations fail. Admin logout also throws before clearing its identity when its session is already invalid.

**Recommended fix:** Handle protected API 401s by clearing the appropriate session and account-scoped state, then route to the matching sign-in page. Make local logout idempotent for an already-invalid session. Avoid treating an ordinary bad-password response as a protected-session failure.

**Important:** Backend authentication still denies the invalid session; this is not an established server-side role bypass.

### M-09 Omitting the payment method weakens cash date checks on an edit

**Evidence:** [request parsing](../backend/src/controllers/booking.controller.ts#L36), [stored payment method preservation](../backend/src/repositories/booking.repository.ts#L182), [approval recheck](../backend/src/services/booking-status.service.ts#L79).

A direct PATCH of an existing cash booking can omit `paymentMethod`, pass the ordinary three-day check, and preserve stored CASH. Its date may violate the stricter cash payment window.

**Recommended fix:** Validate the effective stored/request method inside the locked update transaction, rather than checking only a supplied method.

**Limit:** Approval correctly rechecks the cash window. This creates an invalid/unapprovable pending request; it does not bypass final approval.

## Low priority

### L-01 Registering an inactive account's email produces an internal error

**Evidence:** [registration duplicate lookup](../backend/src/services/auth.service.ts#L95), [ACTIVE-only credentials lookup](../backend/src/repositories/auth.repository.ts#L6), [email uniqueness constraint](../backend/migrations/000_initial_schema.sql#L15).

Registration uses an ACTIVE-only login lookup for duplicate detection. An inactive account's existing email passes that check, then violates database uniqueness and returns 500. Concurrent same-email registration can also hit the unmapped uniqueness error.

**Recommended fix:** Use an all-status email-existence lookup for registration and map SQL duplicate-key errors to a controlled conflict response. Keep inactive login denial intact.

## Payment policy requiring a decision

### P-01 No customer proof-submission route for the remaining online balance

**Evidence:** [proof submission gate](../backend/src/services/payment-proof.service.ts#L94), [verification transition](../backend/src/services/payment-verification.service.ts#L118), [customer UI gate](../frontend/src/app/features/payment-proof/payment-proof.page.ts#L47), [billing action](../frontend/src/app/features/customer-billing/customer-billing.page.ts#L57).

After cumulative verified payments reach 50%, the reservation becomes `PAYMENT_VERIFIED`. Customer proof submission accepts only `AWAITING_PAYMENT`/`PAYMENT_SUBMITTED`, including after final booking confirmation. Customers therefore cannot upload evidence for the remaining GCash/bank-transfer balance through that page.

This restriction is source-confirmed. Whether it violates the intended policy depends on whether all remaining online payments should be customer-submitted or exclusively recorded by staff. If customers should submit them, extend the workflow while separating proof-review status from reservation status: uploading/rejecting another proof must not undo `CONFIRMED` or an already-verified deposit.

## Verification and release gates

### G-01 Production build currently fails

`frontend/angular.json` configures an 8 kB error ceiling for each component stylesheet. The fresh production build reports failures for:

| Component stylesheet | Reported size |
| --- | --- |
| `features/home/home.page.scss` | 8.10 kB |
| `features/packages/packages.page.scss` | 8.27 kB |
| `features/payment-proof/payment-proof.page.scss` | 9.18 kB |
| `features/customer-dashboard/customer-dashboard.page.scss` | 8.42 kB |
| `features/auth/auth.page.scss` | 10.87 kB |
| `shared/components/dashboard-sidebar/dashboard-sidebar.scss` | 8.49 kB |
| `shared/components/public-header/public-header.scss` | 10.13 kB |
| `features/booking/booking.page.scss` | 16.80 kB |

Previous successful development builds do not establish that the production build passes. Consolidate repeated/overridden styles or extract legitimate shared styling, then reassess intentional budgets. Increasing ceilings alone does not resolve accumulated CSS duplication.

### G-02 The full frontend suite is not green

Reconcile the three existing profile/header expectations with the approved UI, then add meaningful regressions for the newly identified failure scenarios. Do not change approved branding merely to satisfy an obsolete screenshot/style expectation, and do not delete assertions without checking their intended behavior.

The older `PRODUCTION_READINESS_AUDIT.md` reports counts and a production-build result from an earlier working tree. It cannot serve as current release evidence. Its remaining deployment gates also require separate live verification; this review did not retest real HTTPS, SQL least privilege, coordinated proof/database recovery, load/fault behavior, or production email operations. Prior successful Gmail delivery does not cover those broader delivery/retry conditions.

## Protections found in the inspected implementation

- Customer/admin API authorization and customer ownership checks remain enforced on the reviewed booking, invoice, profile, and proof routes.
- Separate role-scoped sessions use random tokens stored as hashes, HttpOnly/SameSite cookies, production Secure cookies, server-side expiry, and active-account checks.
- Password reset has role-scoped, expiring, single-use tokens and atomic password/session changes; reset payloads are excluded from general preview surfaces.
- Backend booking totals use catalog data; client totals are not trusted. Guest counts, package compatibility, quantities, and date inputs are validated server-side.
- Capacity changes use transaction-scoped locks, with self-exclusion on actual pending updates. Cash timing is rechecked before initial approval.
- Cash bookings cannot use the online proof upload flow. Uploaded image signatures, type/extension, private paths, authorization, and the 5 MB ceiling are checked.
- Proof verification uses locks and integer cents, rejects duplicate/stale proof decisions, and commits credit, invoice/status/audit changes, and notification intent together.
- Payment verification and final reservation confirmation are separate actions. The review found no legitimate proof-verification path that directly marks a booking confirmed.

These are source/test observations, not claims of independently verified production deployment.

## Recommended repair order

1. Protect payment credit against replay (H-01) and prevent edit-to-create routing (H-02).
2. Isolate customer state on account changes (M-01), invalidate stale reset links (M-02), and prevent silent add-on removal (M-03).
3. Correct cent arithmetic and final-balance/completion behavior (M-04/M-05); settle the online-balance policy (P-01).
4. Repair edit availability, input restoration, session-expiry handling, and effective cash-method validation (M-06 through M-09).
5. Handle duplicate registration consistently (L-01), restore a green full test suite, and pass the production build.
6. In an isolated disposable database, test cross-account access, request replay, concurrent payment/booking operations, storage/network failures, and the complete cash/GCash/bank-transfer journeys. Never run destructive or bulk-message scenarios against real customer records.

For each repair, reproduce the failure first, add a focused regression, implement the smallest change, and verify the affected flow before moving to broader tests. No finding in this report is marked repaired.
