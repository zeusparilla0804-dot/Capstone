# LA Chef Custom Event Quotation Design

## Status

Approved for implementation planning on October 12, 2026.

## Objective

Create a separate custom-event workflow for customers who need changes to package inclusions or a fully tailored event. A custom request records planning information and reserves a capacity request slot, but it does not create a payment obligation until LA Chef sends a quotation and the customer accepts it.

## Entry Paths

Customers may start from:

- `Request a custom quotation`, with no package selected.
- `Customize this package`, with `sourcePackageId` recorded as inspiration.

The source package is informational. Its automatic price is not treated as the final custom-event price.

## Customer Request Form

The dedicated `/custom-event` route requires authentication and collects:

- Event type, date, time, and venue
- Estimated guest count from 1 through 10,000
- Optional source package
- Optional target budget
- Menu preferences and dietary notes
- Setup or styling preferences
- Requested services
- Special requests

The form checks date availability after a valid date and guest estimate. Submission creates a `PENDING` reservation with no payment record and a linked custom-event request in `AWAITING_QUOTE`. The reservation consumes date capacity immediately under the approved capacity rules.

## Admin Quotation Workflow

The admin booking detail identifies custom requests and displays all customer preferences. An authenticated administrator may create a versioned quotation containing line items, quantities, unit prices, total, required down payment, validity date, and terms.

Sending a quotation changes the request to `QUOTE_SENT` and notifies the customer. Editing a sent quote creates a new version and supersedes the old version; historical versions remain readable for audit purposes.

The administrator may request clarification or reject the request before quoting. These actions require a reason and are written to the existing admin audit and booking-status history facilities.

## Customer Review And Acceptance

The customer sees the current quotation in their booking detail and may:

- Accept before its validity deadline.
- Decline with an optional reason.
- Contact LA Chef when clarification is needed.

Acceptance is transactional. It verifies ownership, current quote version, validity, reservation status, and date capacity; snapshots quote totals onto the reservation; creates payment and invoice records; marks the quote `ACCEPTED`; and advances the booking to `AWAITING_PAYMENT`. Only then do payment instructions and proof upload become available.

A declined or expired quote creates no payment. A replacement quote supersedes earlier versions, which cannot be accepted.

## Data Model

Add:

- `CUSTOM_EVENT_REQUEST`, linked one-to-one with a reservation and optionally to a source package.
- `CUSTOM_QUOTE`, linked to the request, with version, totals, status, validity, terms, sender, and timestamps.
- `CUSTOM_QUOTE_ITEM`, linked to a quote, containing ordered line items and immutable financial values.

Reservation gains an optional `accepted_quote_id` link. Existing package bookings leave it null. Quote and request statuses use database check constraints and supporting indexes for customer/admin queues.

## API Contract

Customer endpoints:

- `POST /api/custom-events`
- `GET /api/custom-events/:id`
- `POST /api/custom-events/:id/quotes/:quoteId/accept`
- `POST /api/custom-events/:id/quotes/:quoteId/decline`

Admin endpoints:

- `GET /api/admin/custom-events`
- `GET /api/admin/custom-events/:id`
- `POST /api/admin/custom-events/:id/quotes`
- `POST /api/admin/custom-events/:id/request-clarification`
- `POST /api/admin/custom-events/:id/reject`

All customer detail and mutation endpoints enforce ownership without revealing whether another customer's identifier exists. Admin endpoints use existing admin-session middleware.

## UI And Status Language

Customer-facing statuses use plain language such as `Waiting for quotation`, `Quotation ready`, `Accepted`, `Needs clarification`, `Declined`, and `Expired`. The custom request form is visually related to booking but remains a separate component and route; it does not reuse the regular package checkout stepper in a way that suggests an immediate fixed total.

The admin dashboard adds a quotation queue with request age, date, guests, source package, and status. The quote builder uses compact operational controls and a line-item table, not nested decorative cards.

Every asynchronous action has a visible loading state, disables duplicate submission, and preserves entered data on recoverable errors.

## Notifications

Use the existing email outbox for request receipt, clarification requested, quote sent, quote accepted, quote declined, and quote expired where applicable. Email failure must not roll back a committed request or accepted quotation; failed messages remain retryable by administrators.

## Security And Consistency

- Server-side quote totals are derived from administrator-entered line items and validated decimal amounts.
- Customers cannot alter quote prices, quote version, source package, or reservation ownership.
- Acceptance uses row locks so the same or superseded quote cannot be accepted twice.
- No payment or invoice is created before acceptance.
- Capacity is rechecked on submission and acceptance.
- Every administrator mutation is audited.

## Testing And Completion

Tests cover blank and package-derived requests, field validation, capacity conflicts, ownership, quote versioning, expired and superseded quote rejection, double acceptance, transactional payment/invoice creation, notification queuing, responsive customer/admin screens, loading states, and recovery from API failures.

The feature is complete when a customer can submit a tailored request, an administrator can send an auditable quote, the customer can securely accept or decline it, and payment is unavailable until valid acceptance succeeds.

## Out Of Scope

- Automatic AI-generated quotations
- Real-time chat
- Customer editing of administrator quote lines
- GCash or card gateway processing
- Contract e-signatures
