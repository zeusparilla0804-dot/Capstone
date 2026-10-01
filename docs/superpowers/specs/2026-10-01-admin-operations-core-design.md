# LA Chef Admin Operations Core Design

## Status

Approved visual direction. This specification requires user review before implementation planning.

## Objective

Complete the first production-oriented admin operations phase for LA Chef. The system must let a single trusted administrator review bookings, manage the booking lifecycle, verify manual payment proofs, issue invoices, inspect customer history, monitor notification delivery, and manage the existing catalog from a responsive operational interface.

This phase does not integrate a live GCash or card-payment gateway. It supports cash, manual GCash/e-wallet transfer, and bank transfer with human verification.

## Users And Success Criteria

### Administrator

The initial administrator is the LA Chef owner or authorized staff member. The admin must be able to determine what needs attention, open a complete booking record, safely perform the next valid action, verify a payment proof, and understand balances without entering internal database identifiers.

### Customer

The customer must be able to submit a payment proof for their own booking, see its verification status, understand any rejection reason, and receive durable booking/status notifications when email delivery is configured.

### Success Criteria

- The dashboard presents actionable queues instead of decorative metrics.
- Every booking status change follows the approved state machine and is audited.
- A customer cannot view or submit proof for another customer's booking.
- An admin can verify or reject a proof without manually entering a reservation ID.
- Duplicate references, invalid files, and overpayments are rejected safely.
- Booking persistence never depends on successful email delivery.
- All core admin screens work on desktop, tablet, and mobile.

## Scope

### Included

- Operational admin dashboard
- Complete booking detail workflow
- Customer payment-proof submission
- Admin payment-proof review and verification
- Manual cash payment recording
- Invoice access and balance history
- Customer detail with paginated booking history
- Database-backed email outbox and development preview
- Catalog management refinements needed by admin operations
- Admin audit-log viewer
- Responsive admin shell and accessible interaction states
- Automated backend, frontend, integration, and browser-flow coverage for the new behavior

### Deferred

- Live GCash or card gateway
- Automated refunds, chargebacks, and provider webhooks
- Staff, vehicle, equipment, or venue-capacity scheduling
- Multi-role admin authorization beyond one trusted admin role
- SMS notifications
- Marketing email campaigns
- Advanced financial accounting or tax reports
- Cloud object storage; the storage interface will permit a later move

## Visual Direction

The approved UI is quiet, warm, editorial, and operational. It uses the established LA Chef ivory surface, dark olive navigation, restrained gold accent, serif display type, and compact sans-serif data text.

The dashboard avoids generic equal-width bar charts. Its financial module is an **Editorial Revenue Ledger** showing:

- Confirmed revenue
- Payments awaiting verification
- Overdue balances
- Average confirmed booking value

The primary hierarchy is:

1. Items requiring action
2. Revenue and balance position
3. Today's operational priorities
4. Bookings requiring attention

Cards remain limited to metrics and discrete records. Tables are used on wide screens; mobile uses essential-field booking rows. The desktop sidebar becomes a mobile drawer. Status is communicated with text and color, never color alone.

## Information Architecture

The admin navigation contains:

- Dashboard
- Bookings
- Calendar (read-only event schedule in this phase)
- Customers
- Payments
- Packages
- Add-ons
- Email Outbox
- Audit Log
- Logout

The existing protected `/admin/*` route family remains. New child pages follow the same lazy-loaded standalone Angular component pattern and `adminGuard` protection.

## Dashboard

The dashboard API returns one operational summary payload calculated for an explicit reporting period.

### Priority Metrics

- Pending booking reviews
- Payment proofs awaiting verification
- Confirmed events in the next seven days
- Outstanding balance total

### Revenue Ledger

- Confirmed revenue for the current month
- Submitted payment value awaiting verification
- Overdue outstanding value
- Average confirmed booking value

Only verified transactions contribute to paid or confirmed revenue. Submitted proofs do not affect balances until an admin verifies them.

### Action Queues

- Pending booking reviews
- Submitted payment proofs
- Upcoming events
- Overdue balances
- Failed email notifications

Each count links to the relevant filtered list. Recent bookings are replaced by bookings requiring attention, ordered by operational urgency and event date.

## Booking Detail Workflow

The booking detail page is the operational center for one reservation. It includes:

- Booking reference and current status
- Customer name, email, phone, and address where available
- Event type, date, time, venue, and guest count
- Package and add-ons
- Internal/customer notes where supported
- Server-calculated pricing breakdown
- Invoice summary
- Verified payments, submitted proofs, and outstanding balance
- Status history and audit timeline
- Notification-delivery history

Primary actions are derived from the current status. Invalid transitions are neither displayed as normal actions nor accepted by the API.

### Booking State Machine

The approved forward sequence is:

`PENDING -> APPROVED -> AWAITING_PAYMENT -> PAYMENT_SUBMITTED -> PAYMENT_VERIFIED -> CONFIRMED -> COMPLETED`

Terminal/exception states are `REJECTED` and `CANCELLED`.

Rules:

- `PENDING` may become `APPROVED`, `REJECTED`, or `CANCELLED`.
- `APPROVED` may become `AWAITING_PAYMENT` or `CANCELLED`.
- A submitted proof changes an eligible booking to `PAYMENT_SUBMITTED`.
- Admin verification changes it to `PAYMENT_VERIFIED` and updates financial records atomically.
- Admin rejection of a proof returns the booking to `AWAITING_PAYMENT`, not `REJECTED`; `REJECTED` is reserved for a rejected booking.
- `PAYMENT_VERIFIED` may become `CONFIRMED`.
- `CONFIRMED` may become `COMPLETED` or `CANCELLED`.
- Every rejection or cancellation requires a reason.
- Every transition is recorded with actor, previous status, new status, reason, and timestamp.

## Manual Payment Proof Workflow

### Supported Methods

- `CASH`
- `BANK_TRANSFER`
- `E_WALLET` displayed as Manual GCash/E-wallet

No customer-facing text may claim automatic GCash or card processing.

### Customer Submission

For an eligible booking, the customer provides:

- Payment method
- Amount claimed
- Transaction/reference number for non-cash methods
- Payment date
- JPG, PNG, or WebP proof image up to 5 MB

The submission is `SUBMITTED` and does not modify `PAYMENT.amount_paid`. The customer sees a clear “For verification” state.

### Admin Review

The admin review displays the proof alongside booking reference, customer, amount due, verified amount, claimed amount, resulting balance, method, reference, and date.

The admin may:

- Verify the full submitted amount
- Verify a corrected amount not exceeding the outstanding balance, with an audit reason
- Reject with a required reason

Verification and financial updates occur in one SQL transaction with update locks. The transaction creates the verified payment transaction, updates aggregate payment and invoice statuses, updates the booking state, records audit entries, and queues notifications.

### File Security

- Files are stored outside public Angular assets in a private backend upload root.
- The database stores generated storage keys and metadata, never a client-controlled filesystem path.
- File names are generated server-side.
- Extension, MIME type, and decoded file signature must agree.
- Only JPG, PNG, and WebP are accepted; maximum size is 5 MB.
- Invalid or partially written files are deleted.
- Images are served through authenticated authorization-checked endpoints with attachment-safe headers and `nosniff`.
- Customers may access proof files only for bookings they own; admins may access all proof files.
- Replacing a pending proof creates a new record or revision and does not silently overwrite audit history.

### Storage Abstraction

Define a storage service interface with save, open, and delete operations. The first implementation uses local private disk. A future object-storage implementation can replace it without changing controllers or payment-domain logic.

## Data Model Changes

A new ordered migration follows existing migrations.

### PAYMENT_PROOF

- `payment_proof_id` bigint identity primary key
- `reservation_id` foreign key
- `customer_id` foreign key
- `method`
- `claimed_amount`
- `transaction_reference` nullable only for cash
- `payment_date`
- `storage_key`
- `original_filename`
- `mime_type`
- `byte_size`
- `status`: `SUBMITTED`, `VERIFIED`, `REJECTED`, `SUPERSEDED`
- `rejection_reason` nullable
- `reviewed_by` nullable admin foreign key
- `reviewed_at` nullable
- `verified_amount` nullable
- `created_at`, `updated_at`

Constraints enforce positive amounts, allowed methods/statuses, file-size bounds, review-state consistency, and a unique active transaction reference where applicable.

### BOOKING_STATUS_HISTORY

- Reservation foreign key
- Previous and next status
- Actor type and actor ID
- Reason
- Timestamp

This provides customer-visible history and a durable operational timeline beyond the generic audit JSON.

### EMAIL_OUTBOX

- Notification ID
- Recipient address and normalized recipient
- Template key
- JSON payload
- Related entity type and ID
- Status: `PENDING`, `PROCESSING`, `SENT`, `FAILED`
- Attempt count, next-attempt time, last error
- Created, sent, and updated timestamps

The outbox stores template data rather than rendered secrets. No payment-proof image is attached to email.

## Email Notifications

Email transport is initially unconfigured. The system must not report a message as sent when no transport exists.

### Initial Behavior

- Domain operations queue outbox records inside the same database transaction where practical.
- With no SMTP configuration, records remain `PENDING` and are visible in the admin outbox.
- Development mode provides a safe preview of rendered subject/body without real delivery.
- Environment examples contain placeholders only.

### Events

- Booking received
- Booking approved or rejected
- Invoice issued
- Payment proof submitted
- Payment proof verified or rejected
- Booking confirmed, cancelled, rescheduled, or completed

### Delivery Worker

A separate worker loop claims batches safely, sends configured messages, records outcomes, and retries transient failures with bounded exponential backoff. Permanent failures remain visible for manual retry. Booking and payment requests never fail merely because sending fails.

## Customer Detail

The customer detail endpoint queries by `customer_id`, never by filtering a global booking page in memory. It returns profile data and separately paginated booking/payment summaries. The UI provides direct links to each booking and invoice without exposing unrelated customer data.

## Catalog Administration

Existing package and add-on management remains. This phase improves:

- Strict boolean validation
- Clear field-level API errors
- Guest-range validation
- Activation/deactivation confirmation
- Package category consistency (`other` normalized to `custom` at the contract boundary until database values are migrated)
- Image/gallery metadata management may be represented but full client-photo upload is deferred unless required during implementation review

## API Design

Existing endpoints remain compatible. Proposed additions include:

- `GET /api/admin/dashboard?period=YYYY-MM`
- `GET /api/admin/bookings/:id`
- `GET /api/admin/bookings/:id/history`
- `POST /api/bookings/:id/payment-proofs` (multipart, customer-owned booking)
- `GET /api/bookings/:id/payment-proofs` (customer-owned booking)
- `GET /api/payment-proofs/:id/file` (authorized customer/admin)
- `GET /api/admin/payment-proofs`
- `GET /api/admin/payment-proofs/:id`
- `POST /api/admin/payment-proofs/:id/verify`
- `POST /api/admin/payment-proofs/:id/reject`
- `GET /api/admin/customers/:id/bookings`
- `GET /api/admin/email-outbox`
- `POST /api/admin/email-outbox/:id/retry`
- `GET /api/admin/audit-log`

Request/response schemas are explicitly typed. IDs, amounts, dates, enums, booleans, pagination limits, and multipart metadata are validated at the boundary. Domain conflicts use `409`; invalid input uses `400`; ownership failures use `404` where that avoids resource disclosure.

## Error Handling And Feedback

- API errors expose safe machine-readable codes plus user-actionable messages for expected conflicts.
- Admin UI maps invalid transitions, duplicate references, overpayments, stale records, and rejected file types to specific recovery guidance.
- Mutation buttons show pending state and prevent duplicate submission.
- Destructive or irreversible actions require confirmation.
- Successful updates use concise feedback and refresh only affected data.
- Empty, loading, stale, and retry states are designed for every list/detail view.

## Security And Authorization

- Existing separate customer/admin session cookies and guards remain.
- Every backend endpoint performs authorization independently of Angular guards.
- Upload endpoints are rate- and size-limited.
- Proof files are private and never served by a static public directory.
- SQL queries remain parameterized.
- Verification uses transactions and locking to prevent concurrent double-credit.
- Admin actions and corrected verified amounts are audited.
- Sensitive errors, filesystem paths, email transport credentials, and proof contents never enter client-visible logs.
- Deployment uses environment variables for upload root, sender identity, SMTP host/port/user/password, and worker settings. Real values are ignored by Git.

## Responsive And Accessible UX

- Desktop sidebar becomes a labeled drawer below the tablet breakpoint.
- No page-level horizontal scrolling; wide tables use contained scrolling or record cards.
- Touch targets are at least 44 CSS pixels.
- Dialog focus is trapped and restored; Escape closes non-destructive dialogs.
- Form controls have visible labels, descriptions, and field-level errors.
- Status badges include readable text.
- Payment proof images have zoom controls and a download action; verification remains operable by keyboard.
- Reduced-motion preferences are respected.
- Layouts are verified at 390, 768, 1024, and 1440 pixel widths.

## Testing Strategy

### Backend Unit And Integration

- State-transition matrix, including proof rejection returning to awaiting payment
- Upload validation by size, MIME, signature, and ownership
- Duplicate-reference and overpayment protection
- Concurrent verification permits only one credit
- Local storage cleanup on validation/database failure
- Email outbox persistence and retry state transitions
- Customer-detail pagination by customer ID
- Strict boolean parsing

### SQL-Backed E2E

- Customer creates booking and submits proof
- Other customer cannot access it
- Admin verifies proof and balances/status/history update atomically
- Admin rejects proof with reason and customer can resubmit
- Invoice status follows verified payments
- Audit records and outbox events are created

### Frontend Component And Service

- Dashboard queues and ledger values
- Booking action availability by status
- Proof upload validation and progress states
- Verification/rejection forms and specific errors
- Mobile navigation and contained table overflow

### Browser E2E

- Admin login through dashboard to booking review
- Customer booking to proof submission
- Admin proof verification to customer-visible result
- Keyboard navigation and basic accessibility scan
- Desktop, tablet, and mobile screenshot checks

## Rollout

1. Apply the new migration and configure a private writable upload directory.
2. Deploy storage, history, proof, and outbox backend behavior behind existing authentication.
3. Deploy customer proof submission.
4. Deploy booking detail, payment review, dashboard ledger, outbox, and audit pages.
5. Run SQL-backed E2E and browser workflows in staging.
6. Keep email transport disabled until valid business SMTP credentials are configured and a test recipient confirms delivery.
7. Enable email worker and monitor failures.

## Completion Definition

The phase is complete when the approved workflows pass automated tests and responsive browser verification, unauthorized proof access is denied, financial updates are atomic, all transitions are auditable, no UI claims live online payment processing, and email-disabled operation remains truthful and functional.
