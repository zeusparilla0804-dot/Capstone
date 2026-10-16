# Approved Paper Scope Alignment - Batch 2 Design

**Date:** 2026-10-15
**Status:** Approved design, pending implementation-plan approval
**System:** LA Chef Web-Based Reservation and Billing System

## 1. Purpose

This batch completes the remaining administration and customer-contact capabilities identified in the approved project paper while preserving the existing Angular, Express, and Microsoft SQL Server architecture.

The batch adds:

1. Customer account maintenance for administrators.
2. Reservation and payment reports based on authoritative database records.
3. A configurable Facebook Messenger contact action for public and customer-facing pages.

## 2. Scope Boundaries

### Included

- Administrators can update a customer's first name, last name, phone number, and email address.
- Administrators can activate or deactivate customer accounts.
- Account-status and profile changes are written to the existing admin audit log.
- Deactivating a customer revokes that customer's active sessions without deleting business history.
- Administrators can view, filter, print, and export reservation and payment reports.
- The application exposes a floating Messenger contact action using a public, environment-configurable URL.

### Excluded

- Viewing or directly editing customer passwords.
- Inventory, payroll, staff scheduling, delivery, event-production, profit, or general-ledger reports.
- Automated payment-gateway processing.
- Storing Messenger conversations in the LA Chef database.
- SQL views or stored procedures solely for this feature batch.
- Destructive deletion of customers, reservations, invoices, or payments.

## 3. Architecture

### Backend

- Extend the existing authenticated admin routes, controllers, services, and repositories.
- Keep all new customer-maintenance and reporting endpoints behind `requireAdmin`.
- Use dedicated report endpoints and backend-owned filtering, aggregation, and validation.
- Reuse the same normalized report dataset for screen responses and CSV export so displayed and exported totals cannot diverge.
- Use transactions for customer status changes that affect sessions and audit records.

### Frontend

- Extend the existing admin customer detail workflow instead of creating a separate account-management application.
- Add one `/admin/reports` workspace with Reservation and Payment tabs.
- Add Reports to the primary admin navigation.
- Use the existing design tokens, shared controls, loading states, dialogs, and responsive admin-shell patterns.
- Add Messenger as a shared floating action on public and authenticated customer-facing layouts, not on the admin workspace.

### Configuration

- Add a public frontend environment value for the Messenger destination.
- Initially use `https://www.facebook.com/share/1F8DnqJnB9/`.
- Keep the value out of secret configuration because it is intentionally public.
- Allow replacement with LA Chef's direct `m.me` URL later without component changes.

## 4. Customer Account Administration

### Editable Fields

- First name
- Last name
- Phone number
- Email address

The backend remains authoritative for normalization and validation. Email uniqueness is checked before persistence. Existing validation conventions should be reused where possible.

### Account Status

- Active customers can authenticate normally.
- Inactive customers cannot create a new authenticated session.
- Deactivation updates the customer status, revokes only that customer's active sessions, and writes an audit entry in one transaction.
- Reactivation restores authentication eligibility and writes an audit entry.
- Existing reservations, invoices, payment records, notifications, and audit history remain intact.

### Safety And UX

- Activation and deactivation require a confirmation dialog.
- Submit controls show a loading state and cannot be submitted twice.
- The UI provides specific validation, conflict, authorization, and server-error messages.
- Administrators never receive password hashes or password-reset tokens from these endpoints.

## 5. Reservation Reports

### Filters

- Inclusive start and end date
- Reservation status
- Event type

### Summary

- Number of matching reservations
- Total guests across matching reservations
- Upcoming approved or confirmed reservations within the selected filter range

### Detail Rows

Rows include only fields needed to identify and operate on a reservation, such as reservation reference, customer, event date/time, event type, guest count, venue, package, and status.

Dates are interpreted using the application's established business timezone. Invalid ranges, including an end date before the start date, return validation errors rather than silent empty results.

## 6. Payment Reports

### Filters

- Inclusive start and end date
- Payment method
- Payment status

### Summary

- Total billed for the matching report scope
- Total verified payments
- Outstanding balance

### Detail Rows

Rows include only fields needed for payment monitoring, such as payment reference, reservation reference, customer, transaction date, method, amount, status, and verification details where available.

Pending, verified, and rejected payments remain visibly distinct. Financial totals use decimal-safe database/application handling and the same filter definition for screen, print, and CSV output.

## 7. Export And Print

- CSV export is generated from the backend report service using the current validated filters.
- CSV output contains a stable header order and safely escapes commas, quotes, and line breaks.
- Angular provides print-specific styles that hide navigation and controls while preserving report title, active filters, generation timestamp, summaries, and rows.
- Export and print never include credentials, tokens, password data, or unnecessary personal information.

## 8. Messenger Contact Action

- The action uses a familiar Messenger/contact icon with an accessible label and tooltip where appropriate.
- It opens the configured destination in a new browser tab with safe external-link attributes.
- It is positioned responsively and does not cover mobile navigation, form actions, alerts, or system dialogs.
- If the configured URL is empty or invalid, the action is not rendered.
- No Messenger conversation or third-party response is stored by the application.

## 9. Responsive And Accessible UI

- Desktop reports use compact, readable tables.
- Narrow viewports use stacked report records or controlled horizontal treatment consistent with the current admin system.
- Filter controls wrap without clipping and remain usable at phone, tablet, laptop, and desktop widths.
- Loading, empty, error, retry, disabled, and success states are included.
- Forms and dialogs support keyboard navigation, visible focus, semantic labels, and sufficient contrast.
- White surfaces, near-black typography, and restrained gold dividers remain consistent with the approved LA Chef visual direction.

## 10. API Behavior

Exact route names will follow existing route conventions, with these responsibilities:

- Update a customer profile.
- Activate or deactivate a customer account.
- Return filtered reservation report data and totals.
- Export the filtered reservation report as CSV.
- Return filtered payment report data and totals.
- Export the filtered payment report as CSV.

All endpoints validate identifiers, filters, date ranges, and allowed enum values. They return established error-envelope formats and do not expose raw database errors.

## 11. Verification

### Backend

- Admin authorization is required for every new admin endpoint.
- Customer update validation and duplicate-email handling are tested.
- Deactivation revokes the correct sessions and preserves business records.
- Inactive customers cannot log in; reactivated customers can log in again.
- Report filters, boundary dates, summaries, decimal totals, empty results, and CSV escaping are tested.

### Frontend

- Customer edit and status-change workflows are tested, including confirmation and loading states.
- Report tab, filter, empty, error, retry, CSV, and print behaviors are tested.
- Messenger visibility, URL, safe new-tab behavior, and missing-configuration behavior are tested.
- Responsive browser checks cover representative phone, tablet, laptop, and desktop widths.

### Completion Gate

- Backend build and full automated test suite pass.
- Angular production build and automated tests pass.
- Existing Playwright workflows pass, with new critical-path coverage added where appropriate.
- No secrets or real credentials are introduced.
- No unrelated architecture or business behavior is changed.

## 12. Delivery Order

1. Backend customer-account update/status behavior and tests.
2. Frontend customer-account administration and tests.
3. Backend reservation/payment report services, endpoints, CSV output, and tests.
4. Frontend reports workspace, navigation, print styling, and tests.
5. Configurable Messenger action and responsive tests.
6. Full build, test, browser, security, and regression verification.

## 13. Decisions Recorded

- Dedicated report APIs were selected over client-side aggregation.
- A single Reports workspace with two tabs was selected over separate top-level pages.
- CSV export and print output are both required.
- Customer passwords remain outside administrator control.
- Deactivation revokes sessions but preserves all reservation and billing history.
- Messenger is a redirect-only integration and is configured as public frontend data.
- Scope stays focused on the approved reservation and billing system.
