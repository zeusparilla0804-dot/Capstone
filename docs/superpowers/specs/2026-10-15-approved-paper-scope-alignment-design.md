# Approved Paper Scope Alignment Design

Date: 2026-10-15
Status: Awaiting written-spec review
Source of truth: `LA-Chef-to-Print-Papers-111.docx`

## Purpose

Align the LA Chef application with the approved capstone scope. The product will be presented and completed as a **Web-Based Reservation and Billing System for LA Chef Event Catering Services**. Reservation and billing are the primary business workflows. Security, auditability, and delivery infrastructure remain supporting implementation concerns rather than separate headline modules.

This alignment does not modify the approved paper. Documentation corrections will be handled only when the proponents explicitly request them.

## Paper Requirements

The approved paper requires the following customer capabilities:

- Register and sign in.
- Browse catering packages and menu information.
- Check event-date availability.
- Enter event details and submit a reservation request.
- Request permitted reservation changes or cancellation.
- Review reservation and billing information.
- Pay the required reservation deposit using supported manual methods.
- Receive email confirmation for registration, reservation, payment, and booking updates.
- Open LA Chef's Facebook Messenger channel for inquiries.

The approved paper requires the following administrator capabilities:

- View and manage customer accounts, including account activation and deactivation.
- Review, approve, reject, modify, and cancel reservations.
- Manage packages, menus, prices, add-ons, and customer-facing images.
- Monitor reservation deposits and payment balances.
- Verify manually submitted bank-transfer or e-wallet payment evidence.
- Send or trigger reservation and payment notifications.
- View reports based on reservation and payment records.

The paper explicitly excludes inventory management, staff scheduling, delivery tracking, offline operation, a dedicated mobile application, and automatic third-party online payment processing.

## Canonical Product Boundary

The application will use the cover-page framing, **Reservation and Billing System**, as its canonical product boundary. References in the paper to a broader "Management System" describe administration of reservations, customers, packages, and payments; they do not authorize unrelated enterprise-management modules.

The main customer flow is:

1. Discover a package.
2. Sign in or register.
3. Check availability and enter reservation details.
4. Review the computed package price and 50% required down payment.
5. Submit the reservation for administrator review.
6. Receive the approval and billing instructions.
7. Submit payment evidence for manual verification.
8. Track the reservation, invoice, amount paid, and remaining balance.

The main administrator flow is:

1. Review pending reservations and date capacity.
2. Approve, reject, modify, or cancel a reservation.
3. Issue or expose the reservation invoice and payment instructions.
4. Verify submitted payment evidence or record an offline payment.
5. Confirm the reservation after the required payment is verified.
6. Monitor upcoming reservations and reservation/payment reports.

## Billing Rules

The standard required down payment is **50% of the reservation total**, based on the approved paper and documented client interview. The backend is authoritative. Every frontend estimate, invoice summary, dashboard amount, test fixture, and notification must use the same rule.

The system records payment intent and evidence but does not process money through a live gateway. Supported release methods are:

- Bank transfer
- E-wallet, including GCash when LA Chef provides its payment instructions
- Cash or direct staff-recorded payment when accepted by LA Chef

Credit/debit-card selection must not be presented until a compliant gateway is implemented. Payment evidence remains subject to administrator verification. A reservation is not represented as paid or confirmed merely because a customer uploaded an image.

## Navigation And Information Architecture

The customer portal navigation will remain focused:

- Dashboard
- My Reservations
- Billing & Payments
- Profile

The administrator navigation will become:

- Overview
- Reservations
- Billing & Payments
- Customers
- Packages & Menu
- Reports

Package and add-on maintenance will be grouped under **Packages & Menu**. Technical support functions such as audit history, email delivery status, session revocation, and retry controls will not be promoted as primary business modules. Where an administrator needs them, they may be available from a secondary System or Account area or from contextual error links.

## Scope Treatment Of Existing Features

### Retain As Core

- Customer and administrator authentication
- Customer profile and account history
- Package and add-on catalog
- Availability and documented daily-capacity enforcement
- Reservation submission, pending edits, cancellation, approval, and rejection
- Package price snapshots and server-authoritative totals
- Invoices, payment instructions, balances, and payment history
- Private payment-proof upload and administrator verification
- Reservation and payment notification intents
- Reservation/payment dashboard summaries and reports

### Retain As Supporting Infrastructure

- Password recovery
- Secure session handling and all-device administrator revocation
- Audit records for sensitive administrator changes
- Email outbox, retries, and delivery diagnostics
- Private proof-storage validation
- Concurrency protection and transactional status history

These controls support security and reliability but are not advertised as separate capstone business modules.

### Remove From The Main Product Flow

- The standalone custom-event quotation workspace
- Customer quotation acceptance/decline workflow
- Quotation-specific dashboard queues and navigation
- Credit/debit-card payment choice without a real gateway

Package customization will use reservation fields such as guest count, event details, add-ons, and special requests. The administrator can review those details before approval. The system will not create a separate versioned quotation lifecycle unless the approved paper is formally expanded later.

### Preserve During Safe Retirement

The quotation subsystem currently has routes, services, tests, migrations, and database tables. It must not be deleted destructively in one step. The retirement sequence is:

1. Remove quotation links and entry points from customer and administrator navigation.
2. Prevent creation of new custom quotation requests.
3. Verify whether any existing rows are real client/customer data or disposable development data.
4. Preserve readable history if real records exist.
5. Remove unused frontend/backend code after route and test migration.
6. Use a forward SQL migration for schema retirement only after data classification and explicit destructive-change approval.

Existing migration files must not be rewritten after they have been applied. No database table or record will be dropped as part of the first alignment batch.

## Missing Paper Requirements

The alignment work must complete these gaps:

1. Change the standard down-payment calculation from 30% to 50% across backend, frontend, invoices, and tests.
2. Add a configurable floating Facebook Messenger contact action using the client-approved page or Messenger URL.
3. Add administrator customer-account update, activation, and deactivation controls with authorization and audit history.
4. Add reservation and payment reports with date/status filters, totals, and a printable or CSV export suitable for business monitoring.
5. Configure and verify live email delivery for registration, reservation, billing/payment updates, and reminders.
6. Ensure public and portal copy consistently says reservation rather than order or e-commerce checkout where appropriate.

## Reports

Reports are limited to information already owned by the reservation and billing domains:

- Reservation count by date range and status
- Upcoming approved/confirmed reservations
- Guest totals by event date or event type
- Total billed, verified payments, and outstanding balances
- Payment records by date range and method

Reports will not introduce inventory, payroll, staffing, delivery, profit accounting, or general ledger functionality.

## Notifications

Email notifications are delivery support for reservation and billing events. Required messages include registration confirmation, reservation receipt, approval/rejection, invoice/payment instructions, payment evidence receipt, payment verification/rejection, confirmation, cancellation/reschedule, and an upcoming-event reminder.

Email failure must not roll back a valid reservation or payment record. Failed messages remain retryable. The customer-facing UI must not claim that an email was delivered when it was only queued.

## Security And Data Integrity

- Customer routes enforce ownership and do not reveal another customer's records.
- Administrator mutations require an authenticated administrator.
- Prices, down payments, payment credits, and reservation statuses are validated by the backend.
- Payment evidence remains private and is never served as a public asset.
- Account deactivation revokes active sessions and prevents new login without deleting reservation or billing history.
- Reservation and payment reports expose only administrator-authorized data.
- Technical audit records remain available for security and dispute investigation even when removed from primary navigation.

## Implementation Batches

### Batch 1: Billing And Navigation Alignment

- Replace the 30% standard down payment with 50% everywhere.
- Remove credit/debit-card selection.
- Rename customer-facing booking copy to reservation terminology where needed.
- Simplify customer and administrator navigation.
- Remove quotation entry points and quotation dashboard references without dropping data.

### Batch 2: Required Missing Features

- Add the Messenger contact action.
- Complete customer account update/activation/deactivation.
- Add reservation and payment reporting.

### Batch 3: Notification Completion

- Add missing registration and upcoming-event reminder intents/templates.
- Configure staging SMTP and verify real delivery, retries, and failure display.

### Batch 4: Retirement And Release Verification

- Classify any existing custom-quotation records.
- Remove unused quotation code and use a forward migration only if safe and approved.
- Run the complete backend, SQL-backed, Angular, and browser test suites.
- Repeat the production-readiness audit against the approved-paper scope.

## Verification

Automated coverage must prove:

- The frontend and backend calculate exactly 50% for standard reservation deposits.
- A customer cannot submit unsupported payment methods or alter authoritative totals.
- Reservation submission, approval, payment proof, verification, invoice, and confirmation still work end to end.
- Customer account deactivation revokes sessions and preserves historical records.
- Reservation and payment report filters and totals are correct.
- Removed quotation entry points are absent from public, customer, and administrator navigation.
- Direct access to retired creation routes is rejected or redirected safely.
- Messenger opens the configured client contact URL.
- Required layouts remain usable at 390, 768, 1024, and 1440 pixels.

## Completion Criteria

The alignment is complete when the visible product and its tested business behavior match the approved reservation-and-billing scope, all standard deposits use the documented 50% rule, required account/package/reservation/payment/report/notification capabilities are present, unsupported payment and quotation flows are no longer available, supporting security controls remain intact, and all release verification passes.
