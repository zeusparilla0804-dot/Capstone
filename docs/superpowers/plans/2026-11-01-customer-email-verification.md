# Customer Email Code Verification and Branded Emails

**Approved intent:** Customer chose a six-digit code sent by email. Improve transactional email presentation, preserve La Chef website/auth layout, and keep explicit sign-in after registration.

**Flow:** Register -> email code -> account-created confirmation -> Sign in -> Dashboard. Correct credentials for a pending account route back to code entry without creating a session. Admin authentication is unchanged.

**Policy:** Six decimal digits, 10-minute expiry, single use, five failed attempts then 15-minute cooldown, resend no sooner than 60 seconds, at most five issuances per 15-minute account window; separate IP limits. A resend invalidates the prior code. Expired/superseded/email-mismatched messages never send. No code in URLs, logs, plaintext DB fields or outbox payloads. Derive the code from a random selector with a purpose-separated HMAC secret; persist a keyed proof and reconstruct only inside the private mail renderer. Reuse the configured password-reset secret only through distinct HMAC purposes unless EMAIL_VERIFICATION_HMAC_SECRET is explicitly provided.

**Existing accounts:** Add a verification-required flag defaulting false for historical rows, with no fabricated verified timestamp. Only new registrations set it true. Verified email identity must match the current account email in every customer session path. Existing bookings/payments/accounts are not deleted or overwritten.

**Data:** Migration 019 adds customer verification metadata and an owner-scoped current challenge table. Lock account before challenge for issuance and consume. Queue code in the account transaction; mark verified, consume challenge, and queue welcome in one transaction. Generic resend responses avoid account enumeration. Register fails safely when verification delivery has no usable secret/SMTP configuration. No automatic login or session creation during code verification or registration.

**UI:** Reuse the existing auth card and typography. Add a code-entry view with one accessible numeric-text input (autocomplete=one-time-code), email identity, resend cooldown, inline errors, loading/duplicate-submission guard and sign-in return. Keep regular customer sign-in/registration design and removed Administrator access link unchanged. A verify-email route allows resuming after refresh; email may be a query parameter, code never is. Success uses the existing required confirmation modal.

**Email design:** Shared email-safe inline/table layout, <=600px width, cream surround, white content, understated gold/charcoal LA Chef wordmark, readable serif heading and sans-serif body. Six-digit code is selectable text. No external images/fonts, tracking, scripts or marketing. Preserve plain-text alternatives and payment/reset facts. Redesign affects new outgoing email rendering; it does not resend old messages.

## Execution

- [x] RED/GREEN token, issue/consume limits, email rendering/XSS, private preview and worker tests.
- [x] Schema/repository/service/controller and customer auth gates; preserve password-reset and admin behavior.
- [x] Shared branded email rendering and private verification-code delivery.
- [x] Customer UI, resend/verify APIs, route and tests; preserve existing auth layout.
- [x] Focused and full backend/frontend tests, builds, schema validation, independent security review.
- [x] Preflight/apply only migration019 locally. Real SQL tests use rollback or strictly scoped temporary fixture cleanup, no emails sent. Do not schedule mail or click Gmail actions on the user's behalf.

**Deliverability limit:** Screenshot reports similarity to previously identified spam. SMTP sender/account match in local configuration. Inbox placement cannot be guaranteed or its full cause proved without the received message's authentication headers. Personal Gmail authentication is Google-managed; do not invent customer DNS records or alter sender credentials. Explain Report not spam and production-domain authentication separately from the visual redesign.

No packages, fonts, Git commits, backups, server restarts, port changes, or unrelated page redesigns.

Implementation/verification report: `docs/CUSTOMER_EMAIL_VERIFICATION_2026-11-01.md`.

Ruling: Historical accounts are grandfathered explicitly rather than falsely marked verified. The verification-required flag remains true after verification and the verified identity is bound to the current email, so later email changes require re-verification.

Ruling: Only issuance/resend depends on outgoing-mail availability. A previously delivered code may be consumed while SMTP/worker is unavailable; its welcome notice can remain queued. This prevents an avoidable lockout during a delivery outage.

Ruling: Real-email delivery and Gmail's final rendering/Inbox placement were not tested by sending messages from the agent. Source/rendering, fake-transport worker tests, full suites/builds and real rollback-only SQL behavior were verified. A static sample HTML email is provided for review.
