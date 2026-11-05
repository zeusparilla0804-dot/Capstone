# Customer email verification and branded emails

## Customer flow

New registrations now follow **Register -> enter the six-digit email code -> success confirmation -> Sign in -> Dashboard**. Registration and verification do not issue a session cookie or authenticate the customer. Correct credentials for an unverified new account return the customer to code entry. `/verify-email?email=...` can be refreshed; the code is never placed in a URL. Resend and verification have inline loading/errors and duplicate-submission guards.

The current Customer Sign In card, logo, regular/italic heading, navigation and removed Administrator access link are preserved. The verification view reuses the card with its own smaller heading. Admin authentication is unchanged.

## Code security

- Six digits, including leading zeroes; valid for 10 minutes **from request time**; single use.
- Five failed attempts lock the challenge for 15 minutes. Resend has a 60-second cooldown and a five-issuance/15-minute account window. IP limits: 20 verification attempts and five resend requests/15 minutes.
- A new challenge supersedes the previous one. Expired, exhausted, used, old-email and superseded challenges cannot verify the account.
- Challenge generation uses a random 128-bit selector and purpose-separated HMAC derivation. Stored challenge proof is keyed; no plaintext code is stored in the database/outbox/logs. The private worker reconstructs the code only after checking the current selector, recipient, expiry, attempts and stored proof. Secret rotation makes old queued code messages undeliverable rather than sending an unusable new code.
- Customer login, session creation and session lookup all enforce verified email identity for new accounts. Changing the email of a verification-required customer requires verifying the new address. Successful verification removes stray sessions; the customer still has to sign in.
- Account verification, challenge consumption and welcome-email queuing are transactional. Account creation and initial code queuing are transactional. A replay cannot queue a second welcome.
- Admin previews cannot expose verification code payloads or reconstruct their content. Historical email records are not resent.

Migration `019_customer_email_verification.sql` was applied to the local development database after checking that it was the only pending migration. Existing customers retain access via `requires_email_verification=0`; they were not assigned fabricated verified timestamps. Newly registered customers explicitly require verification. No existing booking, payment, proof or customer record was deleted.

## Configuration

The local Gmail SMTP and worker were already configured and enabled. The sender address matches the authenticated Gmail account. No sender credentials were changed.

Verification uses `EMAIL_VERIFICATION_HMAC_SECRET` if configured, otherwise the existing `PASSWORD_RESET_HMAC_SECRET` with separate HMAC purposes. Secrets must contain at least 32 bytes. The environment examples document the optional dedicated secret. Registration/resend fail safely when a usable secret, SMTP configuration or enabled worker is unavailable, instead of creating accounts that cannot receive a code.

Production rollout must ship frontend/backend and migration019 together. Keep the worker enabled and its secret stable across backend/worker instances. Do not print codes, selectors, complete reset URLs, SMTP passwords or other credentials into troubleshooting logs.

## Email appearance and Spam

Outgoing transactional email now uses a shared email-safe layout: cream surround, white <=600px body, understated gold/charcoal LA Chef wordmark, serif heading, sans-serif body, balanced spacing and plain-text alternative. Verification displays a selectable six-digit code. Password-reset links remain on their existing customer/admin routes and retain their existing 15-minute policy, with a clearer action button. There are no remote fonts/images, trackers or scripts.

[Static sample verification email](design-references/customer-email-verification.html) uses the fictional name Juan and sample code `123456`. It is not an actual verification email or usable account code.

The screenshot's Gmail warning classifies the message as similar to messages previously identified as spam. Matching sender configuration and improved HTML do not prove SPF/DKIM/DMARC results, sender reputation, or Inbox placement. Use Gmail **Report not spam** for an expected legitimate message. Inspect **Show original** authentication results for deeper deliverability diagnosis. Personal `@gmail.com` authentication is managed by Google; this task did not add DNS records or promise an Inbox-delivery fix. A separately hosted production sending domain needs its own correctly configured authentication.

New code email has not been sent to the user's mailbox by the agent. Actual receipt and Gmail rendering remain to be tested by the user creating a new account. Old received emails will retain their old appearance.

## Verification

Final verification: **457 backend tests passed, 2 skipped, 0 failed** (459 total); **346 frontend tests passed across 55 files**. Both production builds passed. No development server was started or manually restarted, no port was changed, no dependency/font was installed, and no Git commit or backup was created.

- Rollback-only real SQL checks passed: pending session creation/lookup blocked, resend cooldown, supersession, replay and expiry denial, proof comparison after secret rotation, exactly one welcome and no auto-login, successful session only after verification, changed-email denial, and five-attempt lockout. Temporary accounts, sessions and outbox rows were rolled back; no SMTP worker was started by the verifier and no test email was sent.
- Independent source review identified the secret-rotation and disabled-worker cases; both were addressed.
- Consuming an already delivered valid code requires the secret and database, even if outgoing mail is temporarily disabled. New issuance/resend still requires enabled delivery; the welcome notice may remain queued during an outage.
- One SQL verification attempt timed out while the broad suites/build were running concurrently; an isolated rerun passed all checks without a code/configuration workaround.
- Existing E2E fixture helpers now complete verification using the real verification API before fixture login. These older full booking/password E2E scripts were updated but not executed in this task. Importing `app.ts` does not start an email worker; fixtures now enable the availability setting without importing `server.ts`.
- No Chrome/Gmail visual inspection was available. HTML structure and escaping, the static preview, and Angular component layout tests were used; this is not a claim of tested rendering in every email client.

## Files

Backend runtime:

- `backend/migrations/019_customer_email_verification.sql`
- `backend/src/config/environment.ts`
- `backend/src/migrations/schema-contract.ts`
- `backend/src/types/notification.types.ts`
- `backend/src/utils/email-verification-code.ts`
- `backend/src/services/email-verification-policy.ts`
- `backend/src/repositories/email-verification.repository.ts`
- `backend/src/services/email-verification.service.ts`
- `backend/src/controllers/email-verification.controller.ts`
- `backend/src/routes/auth.routes.ts`
- `backend/src/repositories/auth.repository.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/services/email-worker.service.ts`
- `backend/src/services/notification.service.ts`
- `backend/src/repositories/admin.repository.ts`
- `backend/src/app.ts`
- `backend/src/templates/email-layout.ts`
- `backend/src/templates/email-templates.ts`
- `backend/.env.example`, `backend/.env.production.example`, `backend/.env.staging.example`

Frontend runtime:

- `frontend/src/app/app.routes.ts`
- `frontend/src/app/core/services/auth.service.ts`
- `frontend/src/app/features/auth/auth.page.ts`, `auth.page.html`, `auth.page.scss`
- `frontend/src/app/features/auth/email-verification-form.ts`, `.html`, `.scss`
- `frontend/src/app/features/auth/registration-success-dialog.html`

Tests/fixtures:

- `backend/src/utils/email-verification-code.test.ts`
- `backend/src/services/email-verification-policy.test.ts`
- `backend/src/services/email-verification.service.test.ts`
- `backend/src/repositories/email-verification.repository.test.ts`
- `backend/src/repositories/auth.repository.test.ts`
- `backend/src/templates/email-design.test.ts`
- `backend/src/services/email-worker.service.test.ts`
- `backend/src/app.test.ts`
- `backend/e2e/email-verification.e2e.ts`, `verify-fixture-email.ts`, `fresh-database.e2e.ts`
- Existing `backend/e2e/phase81.e2e.ts`, `admin-operations.e2e.ts`, `password-recovery.e2e.ts`, `session-security.e2e.ts`, `browser-fixture.ts`
- `frontend/src/app/features/auth/email-verification-form.spec.ts`, `auth.page.spec.ts`
- `frontend/src/app/core/services/auth.service.spec.ts`
- `frontend/src/app/app.routes.spec.ts`

Plan: `docs/superpowers/plans/2026-11-01-customer-email-verification.md`. Existing unrelated worktree changes were preserved.
