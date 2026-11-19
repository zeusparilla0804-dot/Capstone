# LA Chef Project Completion Tracker

Last updated: 2026-11-19

Latest verification: [Packages & Menu and handover status, November 19](HANDOVER_STATUS_2026-11-19.md). The package rename/menu-link and booking-price fixes pass local suites, builds and disposable SQL verification. They have not been deployed. The live API responds ready, but exact Render rescheduling deployment, inbox delivery, Azure runtime permissions, coordinated database/proof recovery and actual phone/desktop acceptance remain unverified. The older deployment preparation checklist below is not current production completion evidence.

## Current Position

**Current checkpoint: Application-complete, launch preparation in progress.**

The approved reservation and billing system is implemented and verified locally. There is no remaining approved application feature batch. The system is not yet production-ready because the remaining work requires a real staging environment, deployment credentials, and operational verification.

## Recommended Finish Line

We should consider the project complete only when all three levels below are finished:

1. **Application complete** - approved customer/admin reservation and billing features work and pass automated tests.
2. **Deployment-ready** - staging uses restricted database access, working email, recoverable backups, durable proof storage, and HTTPS.
3. **Handover-ready** - final device/accessibility testing passes, a new verified release is tagged, and the client receives the production URL, administrator access process, and operating guide.

The current project has completed Level 1. Levels 2 and 3 remain.

## Progress Dashboard

| Stage | Status | Completion evidence |
| --- | --- | --- |
| Approved product scope | Complete | Customer and administrator workflows align with the approved reservation and billing scope. |
| Core application implementation | Complete | Reservation, capacity, billing, manual payments, payment proofs, account, reports, and administration flows are implemented. |
| Local automated verification | Complete locally | November 19: backend 635 passed, 2 skipped; frontend 646 passed; both builds pass; fresh disposable SQL verification and four configured SQL E2E journeys pass. Actual device acceptance remains open. |
| Local container/deployment validation | Complete | Docker/Nginx local stack, JSON smoke tests, health checks, headers, and private proof storage pass locally. |
| Staging environment | Not started | Requires the selected host, staging URL, SQL instance, durable storage, and secret manager. |
| Least-privilege staging database | Prepared | Guarded provisioning and read-only runtime verification scripts exist; real staging accounts still need provisioning and execution evidence. |
| Live email delivery | Prepared | Outbox, password recovery, registration email, retries, and reminders are implemented; SMTP delivery is not configured. |
| Backup and restore rehearsal | Prepared | Guarded SQL backup/restore scripts and an immutable recovery-set preflight manifest exist; a coordinated SQL and proof-file recovery drill is still required. |
| Public HTTPS validation | Pending staging | Security configuration passes locally; real DNS, TLS, proxy headers, HSTS decision, and public-edge smoke tests remain. |
| Final manual QA | Pending staging | Real phones, Firefox/WebKit, screen reader, 200% zoom, slow network, outage, and load checks remain. |
| Release and client handover | Not started | Current `v1.0.0-rc.1` predates verified hardening work and must not be published as the final release. |

## Remaining Work In Recommended Order

### 1. Prepare Staging

- [ ] Select the staging host and HTTPS URL.
- [ ] Provision SQL Server and durable private payment-proof storage.
- [ ] Configure the deployment secret manager from the committed environment examples.
- [ ] Deploy the current frontend and backend containers.

Exit condition: frontend and API are reachable through one staging HTTPS origin and health checks pass.

### 2. Prove Database Restrictions

- [ ] Create separate migration and runtime SQL accounts.
- [ ] Apply `operations/sql-server/least-privilege.sql` in staging.
- [ ] Run `operations/sql-server/verify-runtime-permissions.sql` while authenticated as the runtime account.
- [ ] Confirm the runtime account can perform normal application operations.
- [ ] Confirm the runtime account cannot create/drop databases, alter schema, or manage logins.

Exit condition: the High-severity database-access finding is closed with recorded evidence.

### 3. Enable And Test Email

- [ ] Obtain an approved sender address and SMTP credentials.
- [ ] Store credentials only in the staging secret manager.
- [ ] Enable the email worker.
- [ ] Test customer/admin password reset, registration confirmation, reservation notifications, reminders, retry, and failure reporting.

Exit condition: real test mailboxes receive the expected messages without exposing reset tokens or credentials in logs.

### 4. Rehearse Recovery

- [ ] Back up the staging SQL database with checksum verification.
- [ ] Snapshot the matching private proof-storage directory.
- [ ] Restore both into an isolated environment.
- [ ] Reconcile sampled `PAYMENT_PROOF.storage_key` records with restored files.
- [ ] Run application smoke tests against the restored copy.

Exit condition: the High-severity recovery finding is closed with a documented successful restore.

### 5. Validate The Public Edge

- [ ] Run `scripts/staging-smoke.mjs` against the real staging HTTPS URL.
- [ ] Verify cookies, CORS, proxy trust, security headers, caching, upload limits, and dotfile denial after the public proxy/CDN.
- [ ] Enable HSTS only when every required production subdomain is HTTPS-ready.

Exit condition: the deployed responses, not only the local container responses, satisfy the release checks.

### 6. Complete Final QA

- [ ] Test the complete customer and administrator journeys on real mobile and desktop devices.
- [ ] Test Firefox, Chromium, and WebKit/Safari behavior.
- [ ] Test keyboard-only navigation, screen reader behavior, and 200% zoom.
- [ ] Test slow/unstable connections, SQL/storage outages, expired sessions, interrupted uploads, and concurrent reservations.
- [ ] Record every failure and rerun the complete release matrix after fixes.

Exit condition: no unresolved Critical or High issue remains and all launch-blocking Medium issues are accepted or resolved.

### 7. Freeze, Release, And Handover

- [ ] Apply the approved client catalog to the target database.
- [ ] Create the real administrator account through the deployment command and remove one-time bootstrap values.
- [ ] Create a new release commit and tag after the final verification run.
- [ ] Give the client the production URL, administrator login URL, account-recovery process, and operating guide.
- [ ] Record backup ownership, support contacts, monitoring, and incident procedures.

Exit condition: the approved release is live or ready for the client's scheduled launch and can be operated without developer-only knowledge.

## Inputs Needed From The Owner

Do not place real secrets in chat, screenshots, source code, or tracked `.env` files.

- Hosting/staging provider and target domain or subdomain
- SQL Server deployment access for the approved operator
- Durable private-storage location for payment proofs
- SMTP provider, approved sender address, and test recipient addresses
- Secret-manager access or a deployment operator who can enter the values
- Client-approved administrator email/username and launch date

## Scope Boundary

The recommended finish line includes a secure, tested reservation and billing deployment plus client handover. It does not include a live GCash/card payment gateway, since the approved release uses manual payment methods and administrator-verified proof. It also does not restore the retired custom-quotation workspace or add unrelated administrator modules that are outside the approved paper.

## Quick Status Rule

- If Levels 1-3 are complete: **Complete and handover-ready**.
- If Level 1 is complete but staging gates remain: **Application-complete, not production-ready**.
- If a Critical or High issue is open: **Do not launch**.

