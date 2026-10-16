# Production Deployment Runbook

## Release Boundary

LA Chef uses an Angular 22 frontend, an Express API, and Microsoft SQL Server 2022. The application currently supports manual payment collection only: customers can upload evidence for cash, bank-transfer, or e-wallet payments, and an administrator must verify it. There is no live card or GCash gateway, automatic settlement, refund, or webhook processing.

## Prerequisites

- Node.js `22.22.3` or newer
- npm 10 or newer
- Microsoft SQL Server 2022-compatible host
- HTTPS-capable reverse proxy or load balancer
- Separate least-privilege SQL logins for application runtime, schema migration, and disposable verification
- Durable private storage for payment-proof files
- A secret manager for database, password-recovery, and optional SMTP credentials

Tracked migrations provision an empty SQL Server database in this exact order: `000_initial_schema.sql`, `001` through `006`, then `008` through `015`. The missing `007` filename is intentional: an old local starter-catalog migration was never approved or tracked, and fresh migration history must not invent it. Migration `006` inserts the five system event types; later migrations add operational, recovery, pricing, custom-quotation, and customer-account-status structures without seeding accounts or business transactions. No administrator, customer, package, menu, reservation, payment, or other business record is seeded by migrations.

## Client Catalog

The client-approved poster catalog is maintained by `backend/src/scripts/sync-client-catalog.ts`, not by a migration. It contains six packages, 86 inclusions, and 17 published add-ons. Review without writing first:

```powershell
cd backend
npm.cmd run db:catalog:sync -- --dry-run
```

Apply the controlled catalog with `--apply`. Use `--deactivate-provisional` only when intentionally retiring the exact legacy sample entries; it sets those rows inactive so historical reservations remain intact.

## Environment

Use the hosting platform's secret store. Committed `.env*.example` files contain placeholders only.

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Internal API listener port |
| `FRONTEND_URL` | Exact HTTPS frontend origin |
| `DB_SERVER`, `DB_PORT`, `DB_DATABASE` | SQL Server connection values |
| `DB_USER`, `DB_PASSWORD` | Least-privilege runtime credentials |
| `DB_ENCRYPT` | `true` |
| `DB_TRUST_SERVER_CERTIFICATE` | Normally `false` |
| `PAYMENT_PROOF_UPLOAD_ROOT` | Absolute path on durable private storage |
| `PASSWORD_RESET_HMAC_SECRET` | Required in production; at least 32 random bytes, stored only in the secret manager |
| `SMTP_*` | Optional SMTP transport values from the secret store |
| `EMAIL_WORKER_ENABLED` | Enable only when all SMTP settings are valid |
| `EMAIL_WORKER_*` | Polling, batch, retry, and lease controls |

`VERIFY_DB_*` values are verification-only credentials for a principal allowed to create and drop databases in CI or isolated staging. They must never be supplied to the application runtime. `VERIFY_DB_CONFIRM_DISPOSABLE` remains `false` by default and is set to `true` only for an intentional verifier run. A public domain routes HTTPS traffic to the frontend/API; it never receives SQL credentials.

Authentication uses opaque random tokens whose hashes are stored in SQL Server. Session cookies are `HttpOnly`, `Secure` in production, and `SameSite=Lax`.

Customer logout requires confirmation and ends the current session. The administrator portal additionally exposes **Sign out all devices**, which revokes every active session for that administrator, including the current browser. Session revocation deletes only matching session rows and does not remove profile, booking, invoice, payment, or other business data. The API also removes expired customer and administrator session rows once at startup and then every hour. Cleanup uses the SQL Server UTC clock, prevents overlapping runs within one process, fails safely, and waits for an active run during graceful shutdown. In a multi-instance deployment, monitor the small redundant cleanup query load or assign routine cleanup to a single scheduled worker before materially increasing instance count.

## Password Recovery

Generate `PASSWORD_RESET_HMAC_SECRET` with a cryptographically secure generator and place the result directly in the deployment secret manager. Do not paste the value into source files, tickets, screenshots, logs, or shell history. Every API and email-worker instance in one environment must receive the same value.

Reset links expire after 15 minutes, work once, are scoped to either customer or administrator accounts, and revoke every existing session for that account when consumed. The database and email outbox store only a public selector; the HMAC proof and complete URL are reconstructed in worker memory immediately before SMTP delivery. Sensitive reset messages cannot be previewed through the administrator API.

SMTP is operationally required for self-service recovery. With the worker or SMTP disabled, forgot-password requests intentionally retain the same generic success response, but the user will not receive a link and the outbox row remains `PENDING`. Before enabling production traffic, verify separate customer and administrator delivery in staging, expiration, one-time use, old-session rejection, and confirmation email delivery.

Secret rotation invalidates every outstanding reset link. Rotate by deploying the new secret to all API and worker instances together, restart them, then tell affected users to request a new link. Do not retain an old secret for fallback verification. Periodically delete expired or consumed reset rows according to the approved retention policy; do not delete active rows during normal operation.

Forgot and reset limits are process-local. A multi-instance deployment must enforce equivalent limits at the trusted reverse proxy or shared rate-limit store. During suspected account or email compromise: disable the email worker if link delivery is unsafe, rotate the HMAC secret if reset links may be exposed, revoke affected sessions, preserve restricted logs and outbox metadata, notify the account owner through an approved channel, and restore service only after verification.

The production Angular build calls same-origin `/api`:

```text
https://example.com/      -> Angular static files
https://example.com/api/  -> Express API
```

Forward the original HTTPS protocol and configure exactly one trusted proxy hop. Never combine wildcard CORS with credentialed requests.

## Private Payment Proofs

- Accept only JPEG, PNG, or WebP images whose signature, extension, and declared MIME type agree.
- Maximum size is exactly 5 MB.
- Files are stored under server-generated names outside Angular assets and are never served as a public static directory.
- Downloads and inline previews require an authenticated owner or administrator and use private, no-store caching.
- `docker-compose.staging.yml` mounts the `payment_proofs` named volume at `/var/lib/la-chef/uploads`. Production must provide equivalent durable storage; container-local storage is not acceptable.

Back up SQL metadata and proof files as one recovery set:

1. Pause proof submissions and admin verification, or use storage/database snapshots with a documented common recovery point.
2. Create and verify the SQL Server backup.
3. Snapshot or archive `PAYMENT_PROOF_UPLOAD_ROOT` without following links outside the root.
4. Record the database backup identifier, file snapshot identifier, timestamp, and checksum manifest together.
5. Restore both to an isolated environment and verify that sampled `PAYMENT_PROOF.storage_key` rows open the expected files.

Restoring only the database can leave missing files; restoring only files can leave unreferenced private data.

## Email Outbox

Business transactions write notification intent to `dbo.EMAIL_OUTBOX`. When SMTP is absent or `EMAIL_WORKER_ENABLED=false`, transactions still succeed and messages remain truthfully `PENDING`; administrators can inspect previews in Email Operations. Do not mark these messages as sent manually.

When SMTP is enabled, monitor:

- age and count of `PENDING` rows;
- `FAILED` rows and last error category;
- rows left `PROCESSING` beyond the configured lease;
- worker batch results, retry exhaustion, and SMTP authentication failures.

Retry failed rows through the administrator workflow after correcting the transport issue. Password-reset rows are intentionally excluded from preview and may become undeliverable after expiry or supersession; ask the user to submit a fresh request instead of retrying an old reset message. Never put passwords, complete reset tokens, proof images, or database credentials in templates or logs.

## Build And Verification

Run against an isolated integration database, never production:

```powershell
cd backend
npm ci
npm test
npm run build
npm run db:verify:fresh
npm run test:e2e
npm audit --omit=dev

cd ../frontend
npm ci
npm test -- --watch=false
npm run build
npm run test:e2e
npm audit --omit=dev
```

The optional `operations-e2e` CI job runs only when repository variable `LA_CHEF_E2E_ENABLED=true`. Dedicated `E2E_DB_PROVISIONER_USER` and `E2E_DB_PROVISIONER_PASSWORD` secrets create a generated `LA_CHEF_VERIFY_*` database, run the complete migration chain twice, validate schema and data boundaries, run backend SQL E2E, verify baseline idempotency, and drop the database. The existing `E2E_DB_*` runtime secrets then drive the persistent integration and browser checks. A verifier failure stops the job.

## Deploy

1. Back up and verify SQL Server plus private proof storage, and record the previous known-good artifact tags.
2. Build and tag immutable frontend and backend artifacts.
3. Run `npm run db:verify:fresh` with the dedicated verifier principal in CI or isolated staging infrastructure.
4. Apply tracked migrations with `npm run db:migrate:prod` using the migration principal. Stop deployment on any migration failure; numbered migrations are not automatically reversed.
5. Deploy the backend with the least-privilege runtime principal and durable proof storage, then wait for readiness.
6. Promote the frontend/reverse proxy and verify security headers at the public edge.
7. For a genuinely new environment, supply strong one-time `ADMIN_*` values from the secret manager and run `npm run admin:create`; remove those values immediately afterward.
8. Run `STAGING_BASE_URL=https://staging.example.com node scripts/staging-smoke.mjs` in staging.
9. Verify customer/admin password recovery, all-device and ordinary logout, expired-session cleanup, customer login, booking status, proof submission, admin review, invoice/payment history, email outbox, and audit log.

Health endpoints:

- Liveness: `GET /api/health`
- Readiness: `GET /api/health/ready`
- Database diagnostic: `GET /api/health/database`

## Logging And Monitoring

Ship JSON API logs to restricted centralized storage. Alert on readiness failures, restarts, sustained HTTP `5xx`, migration failures, SQL errors, old outbox rows, failed email retries, proof-storage capacity, and proof-file read errors. Administrative business actions remain in `dbo.ADMIN_AUDIT_LOG`.

Do not log request bodies, cookies, authorization headers, passwords, session tokens, SMTP credentials, proof contents, or database credentials.

## Rollback

For an application regression, stop the rollout and redeploy the previous frontend and backend artifacts together. Numbered migrations are not assumed reversible.

For database recovery:

1. Enter maintenance mode and stop writes.
2. Restore the verified pre-migration database backup to a new isolated database.
3. Restore the matching proof-file snapshot.
4. Run integrity checks, inspect `dbo.SCHEMA_MIGRATION`, and sample authorized proof reads.
5. Connect the previous application artifacts in isolation before switching traffic.

Production restore operations require explicit approval. Never overwrite an active database as an automated deployment step.
