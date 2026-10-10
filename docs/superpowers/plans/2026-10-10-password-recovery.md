# LA Chef Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure one-click email password recovery and password-change confirmation for LA Chef customers and administrators.

**Architecture:** Add a transaction-safe SQL reset-token domain beside the existing auth service, derive usable links in memory from a public selector and server-only HMAC secret, and deliver them through the existing retryable outbox without exposing links in persistence or admin previews. Four public Angular routes reuse one responsive standalone recovery page configured by route data, while customer and administrator API/service boundaries remain separate.

**Tech Stack:** Angular 22 standalone components and reactive forms, TypeScript, Node.js 22.22.3+, Express 5, SQL Server 2022, `mssql`, Node `crypto`, Nodemailer, Node test runner, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-password-recovery-design.md`

## Global Constraints

- Preserve the existing Angular routing, Express controller-service-repository boundaries, SQL Server migration runner, session-cookie model, and email worker.
- Customer and administrator recovery remain role-separated and use registered email addresses only.
- Reset links expire after 15 minutes, are single-use, and a new request invalidates older links.
- Registration and reset passwords require 12-128 characters; login remains compatible with existing shorter passwords.
- Never persist or log a complete token, HMAC proof, reset URL, raw password, or HMAC secret.
- Every valid forgot request returns the same `202` message regardless of account existence or cooldown.
- Successful password rotation revokes all sessions and atomically queues a confirmation email.
- Add no production credentials, recipient data, mock business data, SMS, six-digit codes, MFA, or social login.
- Verify responsive behavior at 390, 768, 1024, and 1440 CSS pixels.

## Review Focus

- The same normalized email may exist in both account tables; each endpoint must affect only its fixed customer or administrator principal. Covered by Task 3 tests.
- Missing, malformed, role-swapped, forged, expired, superseded, used, and concurrently reused tokens must share the safe invalid-token contract. Covered by Tasks 2-4.
- SMTP may be disabled or delayed until after expiry; no reset message may be falsely marked sent or expose a generated link. Covered by Task 5.
- Email casing, surrounding whitespace, duplicate clicks, and a 60-second account cooldown must not leak account existence or enqueue duplicate mail. Covered by Tasks 3, 4, and 7.
- Secret rotation invalidates old proofs safely without corrupting token state or revealing why validation failed. Covered by Task 2 and documented in Task 8.

---

### Task 1: Password Reset Schema And Contract

**Files:**
- Create: `backend/migrations/011_password_recovery.sql`
- Create: `backend/src/migrations/password-recovery-schema.test.ts`
- Modify: `backend/migrations/000_initial_schema.sql`
- Modify: `backend/src/migrations/schema-contract.ts`
- Modify: `backend/src/migrations/schema-contract.test.ts`
- Modify: `backend/e2e/fresh-database.e2e.ts`

**Interfaces:**
- Consumes: existing idempotent migration conventions and executable schema contract.
- Produces: `dbo.PASSWORD_RESET_TOKEN`, migration history entry `011_password_recovery.sql`, and supporting constraints/indexes used by Task 3.

- [ ] **Step 1: Write the failing schema tests**

Add tests asserting the exact columns from the spec, `CUSTOMER`/`ADMIN` principal constraint, both foreign keys, unique selector/token hash constraints, UTC default, and indexes for principal/cooldown, active token lookup, and expiry cleanup. Extend fresh-schema expectations so `PASSWORD_RESET_TOKEN` must exist with zero rows.

- [ ] **Step 2: Run the focused tests and verify failure**

Run from `backend`: `npx.cmd tsx --test src/migrations/password-recovery-schema.test.ts src/migrations/schema-contract.test.ts`

Expected: FAIL because migration `011` and `PASSWORD_RESET_TOKEN` are absent.

- [ ] **Step 3: Implement the idempotent schema**

Create migration `011_password_recovery.sql`; mirror the final table definition in `000_initial_schema.sql`; add migration, columns, constraints, and indexes to `schema-contract.ts`; add the table to `BUSINESS_TABLES` in fresh verification.

- [ ] **Step 4: Run schema tests and backend build**

Run: `npx.cmd tsx --test src/migrations/password-recovery-schema.test.ts src/migrations/schema-contract.test.ts src/migrations/initial-schema.test.ts`

Run: `npm.cmd run build`

Expected: all selected tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/000_initial_schema.sql backend/migrations/011_password_recovery.sql backend/src/migrations backend/e2e/fresh-database.e2e.ts
git commit -m "feat: add password recovery schema"
```

### Task 2: Reset Token Cryptography And Configuration

**Files:**
- Create: `backend/src/utils/password-reset-token.ts`
- Create: `backend/src/utils/password-reset-token.test.ts`
- Modify: `backend/src/config/environment.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: Node `randomBytes`, `createHmac`, `createHash`, and `timingSafeEqual`.
- Produces: `PasswordResetPrincipal = 'CUSTOMER' | 'ADMIN'`, `createPasswordResetToken(principal, secret)`, `reconstructPasswordResetToken(selector, principal, secret)`, and `validatePasswordResetToken(token, principal, secret)` returning `{ selector, tokenHash } | undefined`; `environment.passwordReset` exposes optional development/test secret plus `ttlMs=900000` and `cooldownMs=60000`.

- [ ] **Step 1: Write failing crypto/config tests**

Test selector uniqueness and shape, deterministic reconstruction, customer/admin separation, constant safe rejection of malformed/forged values, full-token SHA-256 hashing, changed-secret rejection, production startup rejection for missing/short secrets, and non-production disabled configuration when absent.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx.cmd tsx --test src/utils/password-reset-token.test.ts`

Expected: FAIL because the utility and environment contract do not exist.

- [ ] **Step 3: Implement token helpers and environment validation**

Use a 16-byte base64url selector and HMAC-SHA-256 proof over `v1:<principal>:<selector>`. Accept only the exact `<22-char-selector>.<43-char-proof>` format. Add placeholder-only `PASSWORD_RESET_HMAC_SECRET` guidance to `.env.example`; require at least 32 UTF-8 bytes in production.

- [ ] **Step 4: Run focused tests and build**

Run: `npx.cmd tsx --test src/utils/password-reset-token.test.ts`

Run: `npm.cmd run build`

Expected: PASS and no secret value printed in output.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/password-reset-token.ts backend/src/utils/password-reset-token.test.ts backend/src/config/environment.ts backend/.env.example
git commit -m "feat: add secure reset token primitives"
```

### Task 3: Transactional Password Recovery Domain

**Files:**
- Create: `backend/src/types/password-recovery.types.ts`
- Create: `backend/src/repositories/password-recovery.repository.ts`
- Create: `backend/src/repositories/password-recovery.repository.test.ts`
- Create: `backend/src/services/password-recovery.service.ts`
- Create: `backend/src/services/password-recovery.service.test.ts`
- Modify: `backend/src/types/notification.types.ts`
- Modify: `backend/src/templates/email-templates.ts`

**Interfaces:**
- Consumes: Task 1 table, Task 2 token helpers, existing `hashPassword`, and `queueNotification(input, request)`.
- Produces: `PasswordRecoveryService.request(principalType, email): Promise<void>`, `PasswordRecoveryService.reset(principalType, token, password, confirmation): Promise<void>`, `PasswordRecoveryRepository.findPrincipal(principalType,email)`, `.issue(input,queue): Promise<'ISSUED'|'COOLDOWN'>`, `.consume(input,queue): Promise<'CONSUMED'|'INVALID'>`, `.isDeliverable(selector,principalType,now): Promise<boolean>`, `PASSWORD_RESET_REQUESTED` and `PASSWORD_CHANGED` notification types, and `PASSWORD_RESET_INVALID` safe failure. Direct rendering of `PASSWORD_RESET_REQUESTED` fails closed until Task 5 installs the sensitive renderer.

- [ ] **Step 1: Write failing service tests**

Cover existing/missing/inactive principals with indistinguishable results; trimmed case-insensitive email lookup; same email in both tables; 60-second cooldown; prior-token invalidation; disabled non-production secret; 15-minute expiry; password mismatch/length; wrong role; malformed, forged, expired, superseded, and used tokens; session revocation; atomic confirmation queue; rollback on queue/database failure; and one success from concurrent consumption.

- [ ] **Step 2: Run service tests and verify failure**

Run: `npx.cmd tsx --test src/services/password-recovery.service.test.ts src/repositories/password-recovery.repository.test.ts`

Expected: FAIL because recovery domain modules do not exist.

- [ ] **Step 3: Implement focused types and repository transactions**

Define `RecoveryPrincipal`, `PasswordResetIssue`, and result unions. Parameterize all SQL. Use `UPDLOCK,HOLDLOCK` for issue cooldown/invalidation and consume; update customer/admin passwords only through fixed SQL branches; delete all matching sessions; queue notifications through the supplied transaction request. Add strict stored-payload validation for both new template keys; `PASSWORD_CHANGED` renders normally while direct reset-link rendering throws safely.

- [ ] **Step 4: Implement the recovery service**

Normalize email, keep request responses generic, generate only one token per eligible non-cooled account, hash new passwords before consumption, map every token-state failure to `AppError(400, ..., 'PASSWORD_RESET_INVALID')`, and never return token material.

- [ ] **Step 5: Run domain tests and backend build**

Run: `npx.cmd tsx --test src/services/password-recovery.service.test.ts src/repositories/password-recovery.repository.test.ts`

Run: `npm.cmd run build`

Expected: all focused tests pass and TypeScript exits `0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/types backend/src/templates/email-templates.ts backend/src/repositories/password-recovery.repository.ts backend/src/repositories/password-recovery.repository.test.ts backend/src/services/password-recovery.service.ts backend/src/services/password-recovery.service.test.ts
git commit -m "feat: implement transactional password recovery"
```

### Task 4: Public Recovery API And Abuse Limits

**Files:**
- Create: `backend/src/controllers/password-recovery.controller.test.ts`
- Modify: `backend/src/controllers/auth.controller.ts`
- Modify: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/app.test.ts`

**Interfaces:**
- Consumes: `passwordRecoveryService.request/reset` from Task 3.
- Produces: `POST /api/auth/password/forgot`, `/password/reset`, `/admin/password/forgot`, and `/admin/password/reset`; forgot limiter `5/15m`; reset limiter `10/15m` independent of login limits.

- [ ] **Step 1: Write failing controller and rate-limit tests**

Assert exact route/principal mapping, email and 12-128 character validation, matching confirmation, generic `202` response, no token echo, safe invalid-token mapping, independent customer/admin paths, duplicate-submit resistance at the HTTP layer, and route-specific rate limits that do not consume login/session-check quotas.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx.cmd tsx --test src/controllers/password-recovery.controller.test.ts src/app.test.ts`

Expected: FAIL because routes and limiters are absent.

- [ ] **Step 3: Implement controllers, routes, and dedicated limiters**

Use fixed principal constants in each handler; return `202` and the spec's generic message for valid forgot requests; use existing validation utilities without including request data in errors.

- [ ] **Step 4: Run focused tests and backend build**

Run: `npx.cmd tsx --test src/controllers/password-recovery.controller.test.ts src/app.test.ts`

Run: `npm.cmd run build`

Expected: PASS; the 6th forgot request and 11th reset attempt receive `429` in isolated limiter tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers backend/src/routes/auth.routes.ts backend/src/app.ts backend/src/app.test.ts
git commit -m "feat: expose password recovery endpoints"
```

### Task 5: Sensitive Reset Email Delivery

**Files:**
- Create: `backend/src/services/password-reset-email.service.ts`
- Create: `backend/src/services/password-reset-email.service.test.ts`
- Modify: `backend/src/templates/email-templates.ts`
- Modify: `backend/src/services/notification.service.ts`
- Modify: `backend/src/services/email-worker.service.ts`
- Modify: `backend/src/services/email-worker.service.test.ts`
- Modify: `backend/src/repositories/email-outbox.repository.ts`
- Modify: `backend/src/repositories/admin.repository.ts`
- Modify: `backend/src/services/admin-operations.service.test.ts`

**Interfaces:**
- Consumes: queued public selector/principal, Task 2 reconstruction, Task 3 repository `isDeliverable(selector, principal, now)`, validated `frontendOrigin`.
- Produces: `renderPasswordResetEmail(item, now): Promise<RenderedEmail | undefined>`, in-memory reset URL rendering, worker expiry/invalidation refusal, redacted admin list payload, `404` sensitive preview, and ordinary `PASSWORD_CHANGED` rendering.

- [ ] **Step 1: Write failing sensitive-delivery tests**

Assert persisted payload has no complete token/proof/URL; worker derives the correct role-specific URL only in memory; expired/invalidated rows are not sent; reset preview is `404` in development and production; admin list payload is `{ sensitive: true }`; normal previews and retries remain unchanged; rendered HTML/text escape account names and contain no secrets outside the intended link.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx.cmd tsx --test src/services/password-reset-email.service.test.ts src/services/email-worker.service.test.ts src/services/admin-operations.service.test.ts`

Expected: FAIL because sensitive templates and renderer do not exist.

- [ ] **Step 3: Implement queued-payload and rendering boundaries**

Validate stored reset payload as `{ accountName, accountType, selector }`; derive `/reset-password` or `/admin/reset-password` URL after claim; refuse delivery when the repository says the row is no longer active; block preview before reconstruction; redact sensitive payloads in admin query mapping.

- [ ] **Step 4: Run notification tests and backend build**

Run: `npx.cmd tsx --test src/services/password-reset-email.service.test.ts src/services/email-worker.service.test.ts src/services/notification-domain.service.test.ts src/services/admin-operations.service.test.ts`

Run: `npm.cmd run build`

Expected: PASS with existing booking/payment notification behavior intact.

- [ ] **Step 5: Commit**

```bash
git add backend/src/templates backend/src/services backend/src/repositories
git commit -m "feat: deliver protected reset emails"
```

### Task 6: Angular Recovery APIs

**Files:**
- Modify: `frontend/src/app/core/services/auth.service.ts`
- Modify: `frontend/src/app/core/services/auth.service.spec.ts`
- Modify: `frontend/src/app/core/services/admin-auth.service.ts`
- Create: `frontend/src/app/core/services/admin-auth.service.spec.ts`

**Interfaces:**
- Consumes: Task 4 API contracts.
- Produces: customer/admin `requestPasswordReset(email)` and `resetPassword(token,password,confirmPassword)` methods.

- [ ] **Step 1: Write failing HTTP tests**

Assert exact customer/admin URLs and bodies, no credentials cookies required, and response/error propagation.

- [ ] **Step 2: Run focused Angular tests and verify failure**

Run from `frontend`: `npm.cmd test -- --watch=false --include=src/app/core/services/auth.service.spec.ts --include=src/app/core/services/admin-auth.service.spec.ts`

Expected: FAIL because the recovery methods are absent.

- [ ] **Step 3: Implement typed service calls**

Keep endpoint selection inside the matching auth service and preserve server error responses for the page to map safely.

- [ ] **Step 4: Run focused tests and Angular build**

Run the Step 2 test command.

Run: `npm.cmd run build`

Expected: focused tests pass and production build exits `0`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/services
git commit -m "feat: add frontend recovery APIs"
```

### Task 7: Responsive Customer And Admin Recovery Experience

**Files:**
- Create: `frontend/src/app/features/password-recovery/password-recovery.page.ts`
- Create: `frontend/src/app/features/password-recovery/password-recovery.page.html`
- Create: `frontend/src/app/features/password-recovery/password-recovery.page.scss`
- Create: `frontend/src/app/features/password-recovery/password-recovery.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/features/auth/auth.page.html`
- Modify: `frontend/src/app/features/auth/auth.page.scss`
- Modify: `frontend/src/app/features/auth/auth.page.spec.ts`
- Modify: `frontend/src/app/features/admin-login/admin-login.page.html`
- Modify: `frontend/src/app/features/admin-login/admin-login.page.scss`
- Create: `frontend/src/app/features/admin-login/admin-login.page.spec.ts`

**Interfaces:**
- Consumes: route data and Task 6 auth-service methods.
- Produces: one reusable standalone page rendered as four route experiences; login recovery links; forgot, sent, reset, invalid-link, failure, and success states.

- [ ] **Step 1: Write failing page and login tests**

Test all four unguarded routes and immutable `data: { audience, mode }`; route-mode/audience selection; required/email validation; 12-128 characters; password match; missing token; disabled duplicate submission; generic sent copy; invalid-token copy; customer/admin return links; service selection; and success navigation with `replaceUrl: true`. Assert both login pages link to their correct forgot route.

- [ ] **Step 2: Run focused Angular tests and verify failure**

Run: `npm.cmd test -- --watch=false --include=src/app/features/password-recovery/password-recovery.page.spec.ts --include=src/app/features/auth/auth.page.spec.ts --include=src/app/features/admin-login/admin-login.page.spec.ts --include=src/app/app.routes.spec.ts`

Expected: FAIL because the page and links are absent.

- [ ] **Step 3: Implement the shared standalone page**

Use reactive forms and route data; add four unguarded lazy routes for `/forgot-password`, `/reset-password`, `/admin/forgot-password`, and `/admin/reset-password`; preserve the existing customer/admin auth visual language; never render the token; add `autocomplete="email"` and `autocomplete="new-password"`, live status, explicit labels, 44px controls, and stable responsive dimensions. Use text plus state styling rather than color alone.

- [ ] **Step 4: Add login links and responsive styling**

Place `Forgot password?` adjacent to the password field/help area without changing existing submit behavior. Verify no mobile navigation or form overlap.

- [ ] **Step 5: Run focused tests, complete Angular tests, and build**

Run the Step 2 command.

Run: `npm.cmd test -- --watch=false`

Run: `npm.cmd run build`

Expected: all Angular tests pass; build exits `0` with no new budget warning.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat: add responsive password recovery UI"
```

### Task 8: SQL E2E, Browser QA, Documentation, And Release Evidence

**Files:**
- Create: `backend/e2e/password-recovery.e2e.ts`
- Modify: `backend/package.json`
- Modify: `frontend/e2e/app.spec.ts`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/RELEASE.md`
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`
- Modify: `docs/RESPONSIVE_QA.md`

**Interfaces:**
- Consumes: Tasks 1-7 complete feature.
- Produces: SQL-backed customer/admin recovery evidence, responsive browser evidence, deployment instructions, and updated readiness status without claiming live SMTP success unless actually verified.

- [ ] **Step 1: Write the failing SQL E2E journey**

Create customer and admin fixtures with active sessions; request recovery; assert outbox persistence contains no complete token/URL; reconstruct the test-only token from the public selector and injected test secret; reset; assert old sessions fail, new password succeeds, reuse/wrong-role fails, confirmation intent exists, and concurrent consumption yields one success. Clean all fixtures in `finally`.

- [ ] **Step 2: Add the E2E script and verify failure before implementation completion**

Append `tsx e2e/password-recovery.e2e.ts` to `test:e2e` and run: `npm.cmd run test:e2e`

Expected before completed dependencies: FAIL at the first missing recovery contract; after Tasks 1-7: PASS.

- [ ] **Step 3: Add browser recovery coverage**

Test customer and admin forgot/reset states, keyboard navigation, generic copy, and responsive layout at 390, 768, 1024, and 1440 pixels. Use a controlled fixture transport/selector, never a committed credential or real mailbox.

- [ ] **Step 4: Update operations and release documentation**

Document HMAC secret creation/storage/rotation, SMTP dependency, reset verification, safe cleanup, all-session revocation, rate-limit single-instance limitation, and incident response. Mark audit `H-01` resolved only after SQL/browser tests pass; keep live SMTP under `M-04` until staging delivery is observed.

- [ ] **Step 5: Run the complete verification matrix**

Run from `backend`:

```bash
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run db:verify:fresh
```

Run from `frontend`:

```bash
npm.cmd test -- --watch=false
npm.cmd run build
npm.cmd run test:e2e
```

Expected: all tests and builds exit `0`; fresh-database verifier removes its disposable database; no raw reset credential appears in output, database payload inspection, screenshots, or logs.

- [ ] **Step 6: Inspect release diff and secrets**

Run from repository root:

```bash
git diff --check
git status --short
rg -n "PASSWORD_RESET_HMAC_SECRET=.+|selector\.[A-Za-z0-9_-]{43}|smtp.*password" . -g "!node_modules/**" -g "!dist/**"
```

Expected: no whitespace errors, only intended files changed, and no committed secret/token value.

- [ ] **Step 7: Commit final verification evidence**

```bash
git add backend/package.json backend/e2e frontend/e2e docs
git commit -m "test: verify password recovery end to end"
```

## Completion Gate

- [ ] Customer and active administrator complete one-click email reset through separate routes.
- [ ] Request responses do not reveal account existence, status, or cooldown.
- [ ] Raw reset credentials are absent from storage, previews, logs, and API responses.
- [ ] Links expire after 15 minutes, work once, and cannot cross account types.
- [ ] New requests supersede old links and concurrent reuse yields one success.
- [ ] Password change revokes every existing session and queues confirmation atomically.
- [ ] Sensitive outbox rows cannot be previewed and ordinary notification behavior remains unchanged.
- [ ] Backend, frontend, migration, SQL E2E, browser, responsive, build, and secret-scan verification pass.
- [ ] Real staging SMTP remains explicitly unverified until delivery is observed; production readiness is not overstated.
