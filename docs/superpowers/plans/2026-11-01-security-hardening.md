# La Chef Security Hardening Implementation Plan

> Execute inline with the executing-plans and test-driven-development skills. No commits, server restarts, new dependencies, or production changes.

**Goal:** Strengthen the existing cookie-authenticated customer/admin system without redesigning pages or changing booking/payment rules.

**Design:** Extend current authentication with durable, atomic account-attempt throttling and privacy-conscious security events. Enforce a non-simple custom request header plus exact Origin validation for unsafe API methods (including login); the shared Angular interceptor supplies it. This follows the OWASP custom-header CSRF pattern and requires no extra cookies/tokens. Keep server-side sessions, adding an atomic admin inactivity check. Upgrade new password hashes with versioned work factors and preserve old hashes/password login compatibility.

**Scope decisions:** Five attempts in a 15-minute window produce a 15-minute cooldown. Admin sessions expire after 30 minutes without authenticated API activity, still capped by their absolute seven-day expiry. New/reset passwords require 15–128 characters and reject a small maintained blocklist; existing passwords remain usable. No forced password rotation or composition rules. Do not automatically run backups, restore databases, send emails, enable MFA, or change production infrastructure.

## Tasks

- [x] Add failing tests for CSRF headers/origins, login attempt boundaries and alias/role isolation, privacy-safe events, idle expiry, stronger/legacy hashes, and password policy.
- [x] Implement middleware and Angular interceptor; update existing HTTP test clients to send the required header. Keep all read-only endpoints and cross-origin denial intact.
- [x] Add migration 018 for authentication attempts, security events and admin last activity, plus schema contract and least-privilege grants. Integrate account throttling and login audit in the actual auth service with generic errors and no plaintext secrets.
- [x] Enforce admin inactivity with a locked conditional SQL UPDATE; reject expired sessions without renewing them. Test the exact SQL path as well as boundaries.
- [x] Upgrade scrypt to explicit OWASP-listed N=16384,r=8,p=5 with versioned hashes; verify legacy N=16384,r=8,p=1 hashes. Validate hash input lengths/parameters before expensive work. Align registration/reset validation and helper text.
- [x] Extend deployment smoke checks and recovery guidance. Do not represent an unexecuted restore or public TLS check as passed.
- [x] Run targeted RED/GREEN checks, full backend/frontend suites, type checks, frontend production build, and a final independent review. Apply only this migration locally after checking pending migrations. Verify real SQL cooldown/idle behavior with generated rows cleaned up and temporary sessions/accounts rolled back, without changing existing customer/bookings records.

## Review focus

- Existing admin email and username must share the same account throttle key.
- Unknown accounts receive generic failures and expensive dummy verification, not account-existence details.
- Concurrent attempts cannot bypass the threshold; restart does not clear attempts.
- CSRF protection covers multipart upload, login, logout, reset, and same-origin production requests; external URLs never receive the header.
- Old hashes and passwords still log in; expired or concurrent admin sessions cannot be resurrected.

## Verification record

Results are recorded in docs/SECURITY_HARDENING_2026-11-01.md: 438 backend tests passed (2 skipped), 337 frontend tests passed, both production builds passed, 12 operations regression tests passed, and real local SQL/live API checks passed.

Ruling: Do not schedule a production backup or invent operator-specific executable commands before the deployment database, protected storage paths, scheduler and credentials are known. Document the tested preflight/templates and the nightly scheduling/restore requirements instead. No backups/restores were executed.

Ruling: Fresh review identified a stale-credential login race during password reset. Add locked credential-checked session insertion for both roles, with a RED/GREEN source regression and real SQL rejection checks. Review also prompted compensating legacy scrypt work, an indexed 24-hour attempt cleanup, and a 1440-minute upper bound for browser timers.

Ruling: Add a one-minute admin warning with server-confirmed renewal; this is a necessary security interaction, not a redesign. Update only existing auth mocks for compatibility. Add an authenticated-customer booking-create rate limit (20/15 minutes), with a behavioral test proving other customers and reads are unaffected.
