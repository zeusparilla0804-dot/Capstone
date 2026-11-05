# Approval invoice email — November 4, 2026

## Resulting flow

An administrator's successful `PENDING → APPROVED` action now issues the booking invoice and queues one consolidated `INVOICE_ISSUED` email in the same database transaction. The former separate approval notification is suppressed for this action. SMTP runs later through the existing email worker, outside the approval transaction.

Invoice creation, items, audit, status history, and email intent commit together or roll back together. Existing invoices are reused without another invoice or email intent. Delivery remains subject to the existing worker's SMTP retries; committing an email intent is not proof of inbox delivery.

Approval remains `APPROVED`. The existing Request payment step, 50% recorded/verified-deposit requirement, and separate final reservation confirmation remain intact. Failed approvals produce no invoice or success email.

## Customer email

The existing branded, email-safe layout now groups:

1. Event details: reference, event type, local Philippine event date/time, venue, and guests.
2. Invoice summary: invoice number, total, recorded payments, required deposit, remaining deposit, outstanding balance, and balance due date.
3. Payment instructions appropriate to the existing stored method: Cash, GCash, or Bank transfer.
4. A customer-owned, sign-in-required View invoice link.

Cash instructions include the fixed 50% deposit deadline, daily 8 AM–6 PM Philippine office hours, and the existing office address: Panorama Ville, Dita, Santa Rosa, Laguna. Customers bring their booking reference, pay at the office, and collect a receipt; staff record actual cash received. No online proof is required for cash. No bank-account or GCash-recipient details were invented.

Amounts are derived from invoice/payment records using the existing cents-rounded deposit policy. Stored multiline venue/event labels are normalized only in the email snapshot; database text is unchanged. Legacy queued invoice and approval emails still render. Verification-code, reset-password, and other security email paths are unchanged.

## Due-date decision

The user delegated this choice. Newly issued invoices now use the event date for the remaining-balance due date, matching the existing billing agreement, instead of issue date plus seven days. Existing invoices are not rewritten. Cash deposit due dates remain a separate field: three calendar days before the event below 500 guests, five days at 500+, by 6 PM Philippine Time. No extra office-day allowance was added.

The invoice page labels the date Balance due and formats the calendar date in UTC to avoid a display-day shift.

## Verification

- Backend: 492 tests passed, 2 Windows/POSIX permission checks skipped, no failures; TypeScript build passed.
- Frontend: 394 tests passed across 57 files; production build passed.
- Coverage includes atomic approval/issuance/queueing rollback, retry reuse, no nested invoice transaction, event-date balance deadline, cash guest thresholds and deposit rounding, persisted GCash method compatibility, multiline venue compatibility, escaped output, legacy queued payloads, and security email regressions.
- Independent review's venue-formatting finding was fixed and rechecked; no remaining findings.
- No live database approval, email delivery test, browser visual verification, package installation, migration, manual server restart, commit, backup, or record rewriting was performed.
- A sample-data HTML preview is available at `.codex-temp/invoice-email-preview.html`; generating it sends no email.
- The configured frontend origin remains `http://localhost:4200`. The existing invoice link requires a reachable site and customer sign-in; localhost on a phone refers to that phone, not the development computer.

## Modified files

- `backend/src/repositories/invoice.repository.ts`
- `backend/src/services/booking-status.service.ts`
- `backend/src/services/booking-status.service.test.ts`
- `backend/src/services/notification-domain.service.test.ts`
- `backend/src/repositories/email-outbox.repository.ts`
- `backend/src/services/notification.service.ts`
- `backend/src/templates/email-templates.ts`
- `backend/src/templates/email-invoice.test.ts`
- `frontend/src/app/features/invoice/invoice.page.html`
- `frontend/src/app/features/invoice/invoice.page.spec.ts`
