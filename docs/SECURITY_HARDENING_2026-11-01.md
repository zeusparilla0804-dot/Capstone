# La Chef security hardening — 2026-11-01

## Implemented behavior

- Existing revocable HttpOnly cookie sessions, Customer/Admin permissions, booking/payment business rules, routes, typography, and layout are retained.
- Unsafe `/api` requests require `X-La-Chef-Request: 1`. Origin, when present, must match the existing trusted frontend policy. Cross-site browser writes without an Origin are rejected. CORS still restricts who may preflight the custom header; the Angular interceptor supplies it only to the configured API URL boundary. This is the OWASP custom-header CSRF pattern, not a claim that CORS alone is CSRF protection. Login, registration, reset, logout, JSON and multipart writes are covered. GET routes must remain read-only for business data.
- Five login attempts per account/15-minute window; a failed fifth attempt leaves a 15-minute cooldown. A successful admitted login clears the counter. SQL range locks serialize concurrent admissions; admin email and username resolve to the same numeric account key. Unknown identities have separate normalized keys. Existing IP limits remain. SQL counters survive application restart and work across instances. Expired attempt rows are cleaned after 24 hours by the existing hourly session-cleanup worker.
- `dbo.AUTH_SECURITY_EVENT` records failed login, cooldown, successful login/session issuance, and successful password reset. Role, principal ID when known, pseudonymous subject/IP hashes, outcome and UTC timestamp are stored. No passwords, password hashes, raw email/IP, session cookies or reset tokens are written to these events. Hashes are pseudonymous, not guaranteed anonymous. Existing administrative business audit logs remain separate. Production least-privilege provisioning makes this table append-only for the runtime role; operator access and retention still require deployment configuration.
- Admin API inactivity expires after 30 minutes, configurable as `ADMIN_IDLE_TIMEOUT_MINUTES` from 1 to 1440. A conditional SQL UPDATE renews only sessions that are still active and within both inactivity and absolute expiry. The frontend warns one minute before expiry, offers a server-confirmed **Stay signed in** action, and clears/redirects the admin session at expiry. Activity means authenticated API activity, not keystrokes. Future automatic polling must not inadvertently keep unattended sessions alive. Absolute expiry remains seven days.
- New registration/admin provisioning/reset passwords require 15–128 characters and reject a maintained starter blocklist of common/service-specific passwords. No character-class composition rule, forced rotation, third-party plaintext-password check, or MFA enrollment is introduced. This is not a comprehensive breached-password database; expanding a vetted offline list is a future maintenance task. Existing passwords continue to authenticate.
- New hashes use a versioned `scrypt$v1$16384$8$5$...` format (16-byte salt, 64-byte derived key). This is an OWASP-listed work-factor combination. Legacy `scrypt:salt:hash` records remain valid; legacy verification performs compensating derivation work, and unknown accounts use a dummy hash, reducing the large legacy/nonexistent-account timing difference. This is not a guarantee of identical end-to-end HTTP timing. Hash upgrade is applied on new/reset passwords, not by rewriting existing account records.
- Customer/admin session INSERTs lock the principal and require its verified password hash to remain current and status ACTIVE. A login in progress when a password reset/deactivation completes cannot create a fresh session from stale credentials.
- Booking creation has an authenticated-customer rate limit of 20 requests/15 minutes. Existing login/reset/upload IP limits are preserved. These HTTP rate limiters are process-local; production multi-instance deployments still need equivalent shared/edge limits.

## Database and verification

Migration `018_authentication_security.sql` adds only the two security tables, their constraints/indexes, and `ADMIN_SESSION.last_seen_at`. It does not alter booking/payment/customer business records. A local preflight found only this migration pending; it was applied successfully. No production database was migrated.

`backend/e2e/security-hardening.e2e.ts` verifies the real SQL schema, eight concurrent admissions (exactly five accepted), cooldown expiration, idle/absolute expiry, and stale-password session rejection for both roles. Its random attempt row is removed in `finally`; temporary sessions/accounts are rolled back. No existing account, booking, payment, proof, or notification is changed, and it sends no email.

Run from `backend`:

```powershell
npm.cmd test
npm.cmd run build
node --import tsx e2e/security-hardening.e2e.ts
```

Run frontend tests/build with the supported Node runtime and existing Angular CLI. No dependencies were installed. No development server was started or manually restarted; localhost:4200 remains unchanged.

Final verification:

- Backend full suite: **438 passed, 2 skipped, 0 failures** (440 total); backend TypeScript production build passed.
- Frontend full suite: **337 passed across 54 files**; Angular production build passed.
- Recovery-preflight, SQL-permission and deployment-smoke regression tests: **12 passed**. These test the tools, not an actual production restore or deployment.
- Real local SQL verifier passed every check described above. Migration/schema were verified on the real local database.
- Existing live backend `http://localhost:3000`: health returns JSON/200; unauthenticated customer/admin routes return 401; login POST without custom header returns 403/`CSRF_REJECTED`; with the header an invalid email reaches normal validation/400. No account lookup, notification or valid credential was needed for this probe.
- The development frontend intentionally calls `http://localhost:3000/api` via `environment.development.ts`. A same-origin deployment-smoke attempt against port 4200 encountered the Angular HTML fallback at `/api/health`; this is not evidence of a production proxy or API failure. The same-origin smoke tool is intended for the deployed Nginx proxy, not the separate-origin Angular development server. Neither development origin/port was changed.
- Independent source review identified and prompted fixes for legacy hash timing, attempt-counter cleanup, browser timeout overflow, and the password-reset/session-issuance race. Final review found no remaining important regression in the changed paths. This is not a penetration-test guarantee.
- No browser/UI visual inspection was performed for this backend-focused work. The small admin expiry notice and renewal action were verified through Angular component tests.

## Production operations still required

These changes are not proof that production is ready or free of vulnerabilities.

1. Deploy frontend/backend together, apply migrations using the migration principal, then apply `operations/sql-server/least-privilege.sql`. Verify effective runtime permissions separately. Do not use the local development SQL principal as evidence of production least privilege.
2. Terminate TLS at the actual public edge, verify certificate/redirect/header behavior, and enable HSTS only after the intended domains are HTTPS-ready. Run `scripts/staging-smoke.mjs` against that real HTTPS URL; it now also checks rejection of writes without the CSRF header. No public TLS endpoint was available for this task.
3. Configure nightly, monitored database **and private proof-storage** backups with restricted access, encryption and off-host retention. Use the existing recovery preflight to allocate unique new destination paths and a paired manifest. Pause writes for a consistent coordinated snapshot unless the deployed storage/database provides another tested consistency mechanism. The SQL files are operator templates: review their `:setvar` values for the intended database and paths; do not assume command-line values override assignments inside the files.
4. Rehearse restoring both artifacts into the isolated verification namespace, run integrity checks and authorized proof-read smoke checks, and record the result. `RESTORE VERIFYONLY` by itself is not a restore drill. No backup job was scheduled, no backup/proof copy was created, and no database restore was executed here.
5. Define restricted access, monitoring, archival and retention for security events. Do not expose them to customers, place credentials in logs, or automatically delete audit history without an approved retention policy.

Use [the deployment guide](DEPLOYMENT.md) for the existing recovery and HTTPS procedures. Admin MFA remains a separately scoped optional addition, not silently enabled here.

## Files changed for this work

Backend runtime:

- `backend/src/app.ts`
- `backend/src/config/environment.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/middleware/csrf.middleware.ts`
- `backend/src/middleware/booking-rate-limit.ts`
- `backend/src/repositories/auth.repository.ts`
- `backend/src/repositories/login-security.repository.ts`
- `backend/src/repositories/password-recovery.repository.ts`
- `backend/src/middleware/auth.middleware.ts`
- `backend/src/routes/booking.routes.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/services/login-security.service.ts`
- `backend/src/services/login-attempt-policy.ts`
- `backend/src/services/password-recovery.service.ts`
- `backend/src/utils/password.ts`
- `backend/src/utils/password-policy.ts`
- `backend/src/scripts/create-admin.ts`

Frontend runtime:

- `frontend/src/app/core/interceptors/api.interceptor.ts`
- `frontend/src/app/core/services/admin-auth.service.ts`
- `frontend/src/app/features/auth/auth.page.ts`
- `frontend/src/app/features/auth/auth.page.html`
- `frontend/src/app/features/password-recovery/password-recovery.page.ts`
- `frontend/src/app/features/password-recovery/password-recovery.page.html`
- `frontend/src/app/shared/components/admin-shell/admin-shell.ts`
- `frontend/src/app/shared/components/admin-shell/admin-shell.html`
- `frontend/src/app/shared/components/admin-shell/admin-shell.scss`

Schema/config/operations:

- `backend/migrations/018_authentication_security.sql`
- `backend/src/migrations/schema-contract.ts`
- `backend/.env.example`, `backend/.env.production.example`, `backend/.env.staging.example`
- `operations/sql-server/least-privilege.sql`
- `scripts/staging-smoke.mjs`

Tests and test clients:

- `backend/src/app.test.ts`
- `backend/src/middleware/csrf.middleware.test.ts`
- `backend/src/middleware/booking-rate-limit.test.ts`
- `backend/src/repositories/auth-hardening.test.ts`
- `backend/src/repositories/password-recovery.repository.test.ts`
- `backend/src/services/login-security.service.test.ts`
- `backend/src/services/login-attempt-policy.test.ts`
- `backend/src/services/registration.service.test.ts`
- `backend/src/services/payment-verification.service.test.ts`
- `backend/src/utils/password.test.ts`
- `backend/src/utils/password-policy.test.ts`
- `backend/src/routes/payment-proof.routes.test.ts`
- `backend/e2e/security-hardening.e2e.ts`
- `backend/e2e/fresh-database.e2e.ts`
- `backend/e2e/phase81.e2e.ts`, `backend/e2e/admin-operations.e2e.ts`, `backend/e2e/browser-fixture.ts`, `backend/e2e/password-recovery.e2e.ts`, `backend/e2e/session-security.e2e.ts` (existing HTTP clients now send the custom header)
- `frontend/src/app/core/interceptors/api.interceptor.spec.ts`
- `frontend/src/app/core/services/admin-auth.service.spec.ts`
- `frontend/src/app/shared/components/admin-shell/admin-shell.spec.ts`
- Existing AdminAuthService mocks in admin-addons, admin-audit-log, admin-booking-detail, admin-bookings, admin-customer-detail, admin-dashboard, admin-email-outbox, admin-payment-review, admin-reports and invoice `.spec.ts` files gained the new idle-warning signal. No runtime page code for these features changed.

Plan: `docs/superpowers/plans/2026-11-01-security-hardening.md`. Existing unrelated worktree changes were preserved. No Git commits or backups were created.
