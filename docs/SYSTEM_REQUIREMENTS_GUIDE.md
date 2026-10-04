# LA Chef System Requirements Guide

## Purpose

This guide translates the unfinished capstone paper, *Web-Based Reservation and Billing System for LA Chef Event Catering Services*, into implementable system requirements. It is a planning reference, not a replacement for validated client decisions, security requirements, or the existing codebase architecture.

The source document was reviewed as reference material only. Personal contact details and student vitae are intentionally excluded from this guide.

## Product Goal

Provide a responsive web application where customers can browse catering offers, request an event reservation, monitor booking and billing information, and receive status updates. Give LA Chef administrators one place to review reservations, manage the catalog, verify manually submitted payments, issue billing documents, and monitor operations.

## Confirmed Actors

- **Visitor:** browses events, packages, company information, and contact options.
- **Customer:** registers, signs in, submits and monitors reservations, views invoices and balances, and requests cancellation.
- **Administrator or authorized staff:** manages customers, reservations, packages, add-ons, payments, invoices, notifications, and reports.

## Business Rules Requiring Client Confirmation

These points are inconsistent or incomplete in the source paper and must be confirmed before production implementation:

1. **Payment handling:** The paper mentions online payment, but its stated limitation excludes payment-gateway integration. The recommended first release is manual bank transfer, e-wallet, or cash recording with administrator verification.
2. **Deposit sequence:** The interview mentions a reservation fee followed by a 50% down payment, while other sections describe only a 50% down payment. Confirm whether these are separate charges.
3. **Cancellation:** The interview states that 50% may be forfeited after contract signing, but no timing, exception, approval, or refund rules are defined.
4. **Availability:** Capacity varies by guest count: roughly five or six small events per day, fewer large events, and one very large event. Exact capacity bands and time-slot overlap rules are not defined.
5. **Lead time:** Rush events require at least three days, while large events commonly require two to three months. Define the threshold for a "large" event and whether administrators can override lead-time rules.
6. **Resource management:** Scheduling and resource allocation appear as an objective, but inventory, staff scheduling, and event coordination are later excluded from scope. Keep those modules out of the release until the scope is formally changed.
7. **Customer changes:** The paper says customers can request booking changes and cancellations, but does not define what fields can change or when approval is required.

## Release Scope

### Customer Experience

- Register and sign in with email and password.
- Browse active event types, packages, inclusions, prices, guest limits, and images.
- Check preliminary date availability before submitting a reservation.
- Enter event type, date, time, venue, guest count, package, add-ons, and preferred payment method.
- Review calculated package cost, add-ons, total, required deposit, amount paid, and remaining balance.
- Submit a reservation request and receive a unique booking reference.
- Track reservation status and view issued invoices.
- Request cancellation subject to business rules.
- Receive email notifications for registration, reservation submission, approval or rejection, payment confirmation, booking updates, reminders, and cancellation.
- Open LA Chef's official Facebook Messenger conversation from a floating contact action.

### Administration

- Sign in through a separate protected administrator flow.
- View booking, upcoming-event, revenue, and outstanding-balance summaries.
- Search and filter reservations by customer, reference, status, event type, and date.
- Review reservation details and perform only valid status transitions.
- Approve, reject, cancel, and complete reservations with an audit trail.
- View customer profiles and booking history.
- Activate or deactivate customer accounts without deleting transaction history.
- Create and update event types, packages, menu inclusions, add-ons, prices, guest limits, images, and active status.
- Review customer payment evidence, verify or reject a submitted payment, and record cash payments.
- Generate and issue invoices or receipts.
- Generate date-filtered reservation, payment, revenue, and outstanding-balance reports with CSV or printable export.
- Monitor failed email delivery and resend important notifications.

## Recommended Booking Lifecycle

1. `PENDING` - Customer submitted a reservation request.
2. `APPROVED` or `REJECTED` - Staff reviews availability and requirements.
3. `AWAITING_PAYMENT` - Approved booking is waiting for the required deposit.
4. `PAYMENT_SUBMITTED` - Customer supplied payment details or proof.
5. `PAYMENT_VERIFIED` - Staff verified the submitted payment.
6. `CONFIRMED` - Reservation is secured and operationally accepted.
7. `COMPLETED` - Event was fulfilled.
8. `CANCELLED` - Booking was cancelled under the approved policy.

Every status change should record the actor, timestamp, previous value, new value, and optional reason. Customer-visible wording should be friendly and should not expose internal notes.

## Availability Rules

Availability must be checked on the server inside the booking transaction. A calendar display alone is not sufficient.

- Reject dates earlier than the applicable minimum lead time.
- Count overlapping non-rejected, non-cancelled reservations for the requested date and time.
- Apply client-approved capacity bands based on guest count.
- Recheck capacity during approval to prevent conflicts created after submission.
- Permit an audited administrator override only if the client explicitly requires it.
- Return a clear conflict response and suggest that the customer select another date or contact LA Chef.

Until the owner confirms exact capacity bands, the interface must label availability as preliminary and reservations as requests, not guaranteed bookings.

## Billing and Payment Rules

- Calculate prices on the server from stored package and add-on prices; never trust totals sent by the browser.
- Preserve price snapshots on each reservation so later catalog changes do not alter existing bookings.
- Show total amount, required deposit, amount paid, and remaining balance separately.
- Accept `CASH`, `BANK_TRANSFER`, and `E_WALLET` in the first release.
- For non-cash payments, collect reference number, payment date, amount, and optional proof image.
- Do not mark a payment verified merely because a customer submitted it.
- Prevent duplicate payment references and overpayment.
- Record verification actor and time.
- Apply cancellation and forfeiture amounts only after the client approves a written policy.

## Notification Events

Email delivery should be asynchronous and must not roll back a valid booking transaction if the email provider is unavailable.

- Account registered
- Reservation request received
- Reservation approved or rejected
- Payment instructions issued
- Payment submitted
- Payment verified or rejected
- Reservation confirmed
- Reservation changed or cancelled
- Upcoming-event reminder

Store notification type, recipient, related entity, delivery status, attempt count, provider message ID, timestamps, and a sanitized error summary. Never store account passwords or full sensitive payment data in notification content.

## Current Implementation Traceability

| Requirement | Current state | Action |
| --- | --- | --- |
| Customer registration and login | Implemented | Add account status enforcement and email verification only if approved. |
| Public event/package browsing | Implemented | Continue using SQL-backed catalog data. |
| Reservation submission | Implemented | Add lead-time and capacity validation. |
| Server-side pricing and price snapshots | Implemented | Preserve and extend tests. |
| Customer booking list and cancellation | Partially implemented | Add cancellation policy, reasons, and request/approval behavior. |
| Admin booking approval workflow | Implemented | Improve detail review and transition-specific actions. |
| Manual payment recording | Implemented for admin | Add customer proof submission and explicit verification/rejection. |
| Invoice generation and viewing | Implemented | Add printable receipt behavior where required. |
| Customer administration | Read-only listing implemented | Add activate/deactivate controls and audit entries. |
| Package and add-on administration | Basic create/update implemented | Add image/menu-inclusion management and archive behavior. |
| Dashboard summaries | Implemented | Validate metric definitions with the client. |
| Availability and capacity engine | Not implemented | High priority before real bookings are accepted. |
| Email notification service | Not implemented | High priority for the documented scope. |
| Messenger widget | Not implemented | Add official client URL after confirmation. |
| Reports and export | Summary metrics only | Add filtered operational and financial exports. |
| Inventory and staff scheduling | Out of scope | Do not build without approved scope change. |
| Delivery tracking | Out of scope | Do not build. |
| Payment gateway | Out of scope for first release | Keep payment verification manual. |

## Delivery Priorities

### Priority 0 - Requirements Sign-Off

- Confirm deposit, cancellation, lead-time, capacity, payment, notification, and administrator-role rules.
- Validate the supplied package data against [CLIENT_CATALOG_REFERENCE.md](CLIENT_CATALOG_REFERENCE.md).
- Obtain approved guest limits, web-ready images, payment instructions, Messenger URL, and email sender identity.

### Priority 1 - Booking Integrity

- Add date availability and capacity checks.
- Enforce minimum lead times.
- Add cancellation reason and policy handling.
- Expand automated tests for concurrent or conflicting reservations.

### Priority 2 - Payment Completion

- Add customer payment-proof submission.
- Add administrator verification/rejection.
- Show deposit and balance consistently across checkout, dashboard, invoices, and admin pages.

### Priority 3 - Notifications

- Add transactional email templates and a queued delivery service.
- Add delivery records, retry behavior, and administrator visibility.

### Priority 4 - Administrative Completeness

- Add customer activation controls.
- Add package images and menu inclusions.
- Add reporting, export, and print workflows.
- Add the confirmed Messenger contact action.

## Non-Functional Requirements

- Responsive behavior for phone, tablet, laptop, and desktop layouts.
- Keyboard-accessible forms, navigation, dialogs, status messages, and tables.
- HTTPS in production, secure HTTP-only session cookies, rate limiting, validation, and least-privilege database access.
- Authorization and ownership checks on every protected API route.
- Audit logging for booking, payment, catalog, customer-status, and administrator actions.
- Database backups and tested restore procedures.
- Philippine peso formatting and Asia/Manila business-time handling.
- Clear empty, loading, validation, conflict, and retry states.
- No production customer, booking, payment, or invoice mock data.

## Acceptance Baseline

The system is ready for client acceptance testing when a customer can register, select an active package, submit a valid reservation request, see its status and billing data, submit payment evidence, receive required notifications, and view an issued invoice. An administrator must be able to review that same transaction, prevent scheduling conflicts, verify payment, confirm or reject the booking, manage the catalog and customer status, produce operational reports, and review an audit trail.

Production release additionally requires approved business rules, real client catalog content, configured email delivery, security testing, backup verification, responsive browser testing, and successful backend and frontend builds and tests.

## Source Notes

The paper is unfinished. Its table of contents contains sections without completed content, several figures are referenced without sufficient textual specification, and some stated technologies and workflows do not fully match the implemented Angular 22, Express, and SQL Server architecture. The existing architecture remains authoritative for implementation; this guide supplies business intent and identifies decisions still requiring validation.
