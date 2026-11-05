# System flow hardening implementation plan

> **For agentic workers:** Use executing-plans task by task; independent ownership is coordinated through dispatching-parallel-agents. No commits or worktree migration of the dirty shared workspace.

**Goal:** Repair all established application findings in the November 1 review and expose reservation-scoped payment-proof history to administrators.

**Architecture:** Preserve existing Angular/Express/SQL interfaces where possible. Enforce financial and ownership invariants in backend transactions; isolate customer stores using a synchronous account-scope change signal. Keep proof review separate from reservation confirmation, and keep historical uploads read-only after review.

**Tech Stack:** Existing Angular, RxJS, Express, mssql, Node unit tests and Vitest. No new dependencies.

**Spec:** `docs/SYSTEM_FLOW_REVIEW_2026-11-01.md` and the approved follow-up payment-proof history flow.

## Global constraints

- Preserve existing records, prices, approval policy, UI identity, and localhost:4200; no live emails, payments, DB E2E, destructive changes, server restarts, or commits.
- Use mock-only regressions before implementing consequential changes. Do not replace approved design with stale test expectations.
- All new manual payment entries require a unique receipt/transaction reference. Exact replay of the same committed entry is a no-op; conflicting reuse is rejected. Use existing persisted reference uniqueness to avoid unnecessary schema changes.
- Completed events may receive legitimate outstanding payments without changing their lifecycle status.
- Online balance proofs may be submitted/reviewed after a verified deposit or booking confirmation without undoing the reservation's existing state.

## Review focus

- Lost-response retries must not create a second credit, audit event, or notification.
- A prior customer's late HTTP response must not repopulate another customer's stores.
- An unavailable/deactivated catalog selection must never become an implicit deletion.
- Secondary checkout and return paths must preserve edit identity and backend ownership.
- A new remaining-balance proof must not regress confirmed/completed booking status.

## Task 1: Payments and proof lifecycle

Owner: payment worker. Files: backend payment/admin services, repositories and tests; frontend admin payment entry, payment-proof eligibility and related tests/models as needed.

- [x] Reproduce duplicate manual credit and cent arithmetic failures; require references for all manual methods, return exact replays without side effects, reject conflicting reuse under existing locking/index constraints.
- [x] Permit settlement of completed events while preserving lifecycle status.
- [x] Permit additional noncash balance proofs for verified/confirmed/completed events with balance; verify/reject proof without regressing those lifecycle states.
- [x] Add optional reservation ID filtering to admin proof listing for a history panel; validate it server-side.
- [x] Verify focused backend and affected frontend tests; report exact files and interfaces.

## Task 2: Booking edits, selection integrity and availability

Owner: booking worker. Files: booking/checkout components and tests, booking/draft services and tests, availability controller/service/repository/tests.

- [x] Reproduce edit-through-checkout duplicate creation; carry edit ID through all relevant routes/shared draft and PATCH instead of POST.
- [x] Gate catalog-dependent save, detect missing saved add-ons, and prevent silent removal on load failure/deactivation.
- [x] Add owner-validated editing exclusion to availability preview; preserve locked capacity enforcement.
- [x] Repair quick clear/restore checking state and effective stored cash-method validation on edits.
- [x] Consume customer account-scope API to synchronously reset stores and discard stale responses.
- [x] Verify focused booking/checkout/availability tests.

## Task 3: Authentication and account isolation

Owner: auth worker. Files: auth/admin-auth/interceptor and new account-scope service/tests; customer-admin/password-recovery/auth repositories/services/tests.

- [x] Add `CustomerAccountScopeService` with synchronous `setPrincipal(id: string | null)`, `changes: Observable<void>`, and `generation: number` for store resets/stale-response rejection. Auth mutations update it before publishing principal changes.
- [x] Handle protected API 401s without logging out on an ordinary invalid-login response; make local logout safe for revoked sessions.
- [x] Invalidate reset tokens on email correction, cover queued/in-flight issuance identity checks, and preserve single-use role-scoped recovery.
- [x] Detect duplicate registration across inactive accounts and map uniqueness races to a controlled conflict.
- [x] Verify focused account/session/recovery tests and coordinate scope API with booking worker.

## Task 4: Admin history, customer actions and release gates

Owner: primary worker after coordinating shared interfaces.

- [x] Add reservation-specific payment-proof history in Admin Booking Details using existing proof list/review routes. Reviewed receipts open read-only with their verified amount/rejection reason and cannot be credited again.
- [x] Align customer payment actions with additional-balance proof support, preserving cash-office-only behavior.
- [x] Reconcile the three stale approved-design tests without changing approved branding/profile layout.
- [x] Consolidate obsolete/repeated CSS and reassess deliberate style budgets; verify production build rather than only development build.
- [x] Review integrations and run full backend/frontend suites, typecheck and production build once changes stabilize.
- [x] Update audit with actual repair/verification evidence and explicit remaining live-deployment limitations.
