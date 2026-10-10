# LA Chef Password Recovery Design

## Status

Pending written-spec review. The customer and administrator recovery experience and the one-click email-link approach were approved in conversation on October 10, 2026.

## Objective

Add secure, self-service password recovery for LA Chef customers and administrators without changing the established authentication, session, Angular routing, Express controller-service-repository, SQL Server, or email-worker architecture.

The recovery experience must be fast and familiar: the user enters an email address, receives an email containing a **Reset password** button, chooses a new password, and receives a confirmation email. A successful reset signs the account out on every device. The system must not reveal whether an email address is registered.

## Scope Decisions

- Customer and administrator recovery use separate public routes and API endpoints.
- Recovery is email-based. SMS, security questions, and administrator-issued temporary passwords are not included.
- Reset links expire after 15 minutes and can be used once.
- A newer reset request invalidates every earlier unused link for that account.
- New passwords use the existing 12-128 character policy and existing `scrypt` hashing utility.
- Successful reset revokes all customer or administrator sessions for the affected account.
- A password-changed confirmation email is queued after the password transaction succeeds.
- Existing booking and payment notification emails continue to use the current outbox behavior.

## Customer Experience

The customer login page adds a visible `Forgot password?` link. It opens `/forgot-password`, which contains one email field and a submit button.

After every syntactically valid request, the page shows the same confirmation:

> If an LA Chef account uses that email, password reset instructions will arrive shortly.

The confirmation is identical when the account does not exist, is unavailable, is rate-limited at the account level, or email delivery is pending. It includes actions to return to sign in or submit another request after the cooldown.

The email button opens `/reset-password?token=...`. A valid link presents `New password` and `Confirm new password` fields. After a successful reset, the page confirms that the password was changed and directs the customer to sign in again. Invalid, expired, superseded, or already-used links share one safe message and provide a `Request another link` action.

## Administrator Experience

The administrator login page adds a `Forgot password?` link. Administrator recovery uses `/admin/forgot-password` and `/admin/reset-password?token=...`, preserving the existing administration visual treatment and returning to `/admin/login` after success.

Only an administrator's registered email address can request recovery; usernames are not accepted for recovery. Responses remain generic, including for inactive administrator accounts. Successful recovery revokes every active administrator session for that account.

Customer reset links cannot be used on administrator endpoints, and administrator links cannot be used on customer endpoints.

## Token Model

Each request generates a cryptographically random 128-bit public selector. A server-only HMAC-SHA-256 secret derives the proof:

```text
proof = HMAC(PASSWORD_RESET_HMAC_SECRET, "v1:<account-type>:<selector>")
token = <selector>.<base64url-proof>
```

The database stores the selector and a SHA-256 hash of the complete token. It never stores the complete token, HMAC secret, or raw proof. The email outbox stores only the public selector, account type, and display name. The worker reconstructs the complete token in memory immediately before rendering the email.

The reset endpoint validates token format, derives the expected proof for its fixed account type, compares it in constant time, hashes the complete token, and then performs the authoritative database lookup. A customer endpoint therefore cannot reinterpret an administrator selector.

`PASSWORD_RESET_HMAC_SECRET` is a secret-store value of at least 32 random bytes. It is documented with a placeholder only and is required in production. Rotating it invalidates all outstanding reset links and is therefore an incident-response action that must be coordinated.

## Email-Outbox Security

Add two templates:

- `PASSWORD_RESET_REQUESTED`
- `PASSWORD_CHANGED`

`PASSWORD_RESET_REQUESTED` is a sensitive template. The queued database payload contains no usable token or URL. When the worker claims it, a dedicated password-reset renderer derives the full token, builds a URL from the validated `FRONTEND_URL`, renders the message, and discards the in-memory token after `sendMail` returns.

The administrator Email Operations API redacts the payload for sensitive templates. Development preview returns `404` for a password-reset message and cannot generate or expose its reset link. Logs never include email addresses, selectors, tokens, reset URLs, request bodies, or SMTP responses containing message content.

If SMTP is disabled, reset requests still return the generic accepted response and safe notification intent remains pending. No interface claims that delivery occurred. Production launch requires configured SMTP and an end-to-end delivery check; password recovery cannot be considered operational with SMTP disabled. The worker marks a reset message failed without sending if its token has already expired or been invalidated.

The password-changed confirmation contains no reset credential and may follow the existing safe preview rules.

## Database Design

Add idempotent migration `011_password_recovery.sql` and extend the executable schema contract. Create `dbo.PASSWORD_RESET_TOKEN` with:

- `reset_id bigint IDENTITY` primary key
- `selector char(22)` unique public selector
- `token_hash char(64)` unique SHA-256 hash
- `principal_type varchar(10)` constrained to `CUSTOMER` or `ADMIN`
- nullable `customer_id` and `admin_id` foreign keys
- `expires_at datetime2`
- nullable `used_at datetime2`
- nullable `invalidated_at datetime2`
- `created_at datetime2` with a UTC default

A check constraint requires exactly one principal foreign key and requires it to match `principal_type`. Supporting indexes cover active-token lookup, per-principal invalidation, cooldown checks, and expiry cleanup.

Reset creation is transactional:

1. Find an eligible account by normalized email for the endpoint's account type.
2. If no eligible account exists, return the generic result without a write.
3. Apply a per-account cooldown without revealing it to the caller.
4. Invalidate earlier unused reset rows for that account.
5. Insert the new hashed reset token with a 15-minute expiry.
6. Queue `PASSWORD_RESET_REQUESTED` in the same transaction.
7. Commit.

Reset consumption uses `UPDLOCK` and `HOLDLOCK` on the selected token row:

1. Require an unused, non-invalidated, unexpired token for the endpoint's account type.
2. Reconfirm that the customer exists or administrator remains active.
3. Hash and update the new password.
4. Set `used_at` and invalidate all other outstanding tokens for the principal.
5. Delete all rows from `AUTH_SESSION` or `ADMIN_SESSION` for the principal.
6. Queue `PASSWORD_CHANGED` in the same transaction.
7. Commit.

Concurrent attempts to consume one token allow exactly one transaction to succeed.

## API Contract

Add four public endpoints:

```text
POST /api/auth/password/forgot
POST /api/auth/password/reset
POST /api/auth/admin/password/forgot
POST /api/auth/admin/password/reset
```

Forgot-password body:

```json
{ "email": "customer@example.com" }
```

Every syntactically valid forgot-password request returns `202 Accepted` with the same response body:

```json
{
  "success": true,
  "message": "If an account uses that email, password reset instructions will arrive shortly."
}
```

Reset body:

```json
{
  "token": "selector.proof",
  "password": "a-new-password",
  "confirmPassword": "a-new-password"
}
```

A successful reset returns `200 OK`. Invalid, expired, superseded, and used tokens return the same `400` code and message, such as `PASSWORD_RESET_INVALID`, without disclosing token state or account information. Malformed input returns validation errors without echoing secret values.

## Rate Limiting And Abuse Controls

- Forgot-password endpoints: 5 requests per 15 minutes per source IP.
- Reset endpoints: 10 attempts per 15 minutes per source IP.
- Eligible accounts receive no more than one newly queued reset email per 60 seconds.
- Account cooldown and account existence are never reported to the caller.
- Request and reset bodies remain under the existing JSON size limit.
- Expired and consumed reset records are retained only for the documented security/audit window, then removed by the same maintenance mechanism used for expired sessions.

IP rate limiting is process-local in the current single-instance deployment. A shared rate-limit store is required before horizontally scaling the API.

## Backend Architecture

Add focused password-recovery repository and service modules rather than expanding `auth.service.ts` into unrelated responsibilities.

The controller validates request boundaries and selects the fixed customer or administrator account type. The service owns token generation, generic response behavior, password policy enforcement, and transaction orchestration. The repository owns parameterized SQL, locks, token state, password update, and session revocation.

The notification layer gains a sensitive-template boundary and password-reset renderer. Existing notification callers and ordinary template rendering remain compatible.

## Frontend Architecture

Extend `AuthService` and `AdminAuthService` with typed forgot/reset operations. Add four lazy-loaded standalone pages and routes. Shared reset form behavior and accessible status presentation may be extracted only where it removes real duplication while allowing customer and administrator layouts to retain their existing identity.

Forms include:

- Explicit labels and browser autocomplete values (`email`, `new-password`)
- Client and server validation messages
- Matching-password validation
- Disabled duplicate submission while a request is pending
- Loading status announced through a live region
- Safe success and invalid-link states
- Touch targets of at least 44 CSS pixels
- No token rendering in the DOM, visible error text, analytics, or console output

The token is read from the URL only when submitting the reset request. After success, navigation replaces the reset URL so browser history does not retain the token-bearing page.

Layouts are verified at 390, 768, 1024, and 1440 CSS pixels with no horizontal scrolling, clipped text, or navigation overlap.

## Error Handling

- Forgot-password always preserves its generic anti-enumeration response after valid input.
- Invalid email syntax is rejected locally and by the API because it reveals nothing about registration.
- Token failures use one safe state and do not distinguish expired, used, superseded, wrong-role, or unknown tokens.
- Database failure returns the existing safe server error and does not claim an email was queued.
- SMTP retry state remains internal to Email Operations; reset pages do not poll delivery status.
- Password-change confirmation queue failure rolls back password mutation so the security event and its notification intent remain consistent.

## Testing Strategy

### Backend Unit And Route Tests

- Customer and administrator request routes return the same result for existing, missing, inactive, and cooled-down accounts.
- Route-specific IP limits apply without consuming normal login limits.
- Selectors are random; stored values cannot be used as reset tokens.
- Raw tokens, proofs, URLs, passwords, and HMAC secrets never reach logs, persisted payloads, or admin API responses.
- Customer/admin role separation is enforced.
- Expired, used, invalidated, malformed, and forged tokens share one failure contract.
- New reset requests invalidate prior links.
- Password policy and confirmation matching are enforced.
- Successful reset rotates the password, consumes the token, revokes all sessions, and queues confirmation atomically.
- Two concurrent uses of one token produce one success.
- Database or queue failures roll back all reset mutation.
- Sensitive messages cannot be previewed; normal previews still work.
- Worker refuses expired or invalidated reset messages and derives links only in memory.

### SQL And Migration Tests

- Migration `011` is ordered and idempotent.
- Columns, foreign keys, unique constraints, principal check, defaults, and indexes match the schema contract.
- Fresh-database verification applies the migration and begins with zero reset rows.
- SQL-backed recovery covers issue, consume, session revocation, reuse rejection, and concurrent consumption.

### Angular Tests

- Customer and administrator login pages expose the correct recovery links.
- Email, password length, and matching-password validation work.
- Loading prevents duplicate submission.
- Generic request confirmation does not imply account existence.
- Invalid-link, API-failure, success, and return-to-login navigation work.
- Successful navigation removes the token-bearing URL from history where browser APIs permit verification.

### Browser And Delivery Verification

- Complete customer and administrator recovery against a staging SMTP mailbox.
- Confirm reset links target the correct frontend origin and account type.
- Confirm old sessions fail immediately after reset.
- Confirm link reuse and expiry fail safely.
- Verify the confirmation email arrives without exposing sensitive values in Email Operations.
- Verify customer and administrator recovery pages at required responsive viewports and with keyboard-only navigation.

## Documentation And Operations

Update environment examples with placeholder-only password-reset configuration. Update deployment, release, and production-readiness documentation with SMTP requirements, secret rotation effects, recovery verification, cleanup, and incident-response steps.

No real reset secret, SMTP credential, recipient address, or reset link is committed.

## Out Of Scope

- SMS or messaging-app recovery
- Six-digit recovery codes
- Security questions
- Social login or multi-factor authentication
- Administrator-generated temporary passwords
- Changing the existing seven-day session duration
- A distributed rate-limit store before multi-instance deployment
- Editing the approved project paper in this phase

## Completion Definition

Password recovery is complete when customers and active administrators can request and complete a one-click email reset without account enumeration; links expire, are single-use, and cannot cross roles; all sessions are revoked after password rotation; reset credentials are absent from persistent outbox payloads, previews, logs, and API responses; confirmation intent is atomic with the password change; responsive UI and accessibility states are verified; and backend, Angular, SQL-backed concurrency, migration, build, and staging SMTP delivery checks pass.
