# Customer bank selection and balance payments

## Review status and release constraint

Written design awaiting user review. Implementation has not started.

The user confirmed that customers should receive the selected bank QR automatically, without an administrator sending or assigning it. Customers still upload payment proof, and an administrator verifies the money received. The requested flow includes payment of the remaining balance and updated receipts.

On November 13, 2026, the user instructed us to wait until they repair Azure SQL before pushing. Keep work local until the user reports Azure is restored and live database readiness is verified. This instruction supersedes the earlier automatic-push preference for this release. Do not change Azure billing or enable paid overages as part of this feature.

## Outcome

After approval and payment request, customers select a supported payment method. For bank transfers, they select an available LA Chef receiving bank account and immediately see its QR and account details. They do not wait for an administrator to assign a QR.

After a verified down payment, the customer retains a payment action until the outstanding balance is zero. Each verified installment updates customer and administrator balances, invoice status, payment history, and the current printable receipt. Each installment retains its own bank details.

Automatic QR presentation does not initiate a transfer or verify a payment. Funds are sent through the customer's banking application; proof review remains inside LA Chef.

## Existing behavior and gaps

- `PAYMENT_DESTINATION` already holds bank labels, account names, account hints, QR images, and availability. The current code does not impose an assignment quota per bank account.
- `payment-destination.routes.ts` currently exposes only a booking's administrator-assigned QR to its customer. `BOOKING_PAYMENT_DESTINATION.assigned_by` references an administrator.
- `payment-proof.service.ts` requires that booking-level assignment before accepting a bank proof.
- `booking-card.html` and `customer-billing.page.ts` stop offering payment after the 50% deposit is complete, despite an outstanding balance.
- `PAYMENT_TRANSACTION` already appends individual verified/recorded installments. Invoice receipts read this ledger, but do not retain a receiving bank snapshot per installment.
- An uploaded proof does not currently count as verified money. Preserve this distinction.

## Decisions

1. Customers choose among available, administrator-configured receiving bank accounts. Show the selected QR immediately; remove the customer dependency on administrator QR assignment.
2. The same receiving account may serve multiple customers and reservations. Selecting it does not reserve it or reduce an application quota.
3. Customers may choose a different receiving bank for a later bank-transfer installment. Earlier proofs and receipt entries retain their original receiving bank information.
4. Keep the existing Cash and Bank Transfer methods. Cash remains an office payment recorded by an administrator. Existing staff-supported mixed-method installments remain supported. This change does not introduce new customer-facing switches between cash and bank after money has been recorded.
5. Keep the existing 50% deposit requirement, optional full settlement, custom-amount validation, preparation rules, and balance due date. Do not equate bank availability with permission to overpay.
6. Bank selection and proof upload do not change the verified amount paid. Only the existing verified/recorded payment transaction changes money totals.
7. Fully paid is a financial state. It must not automatically mark an event completed or regress a confirmed/completed event to an earlier booking state.

## Customer experience

### First payment

1. An approved booking reaches the existing payment-requested state.
2. The customer chooses Cash or Bank Transfer using the existing payment-method flow.
3. For Bank Transfer, the payment page shows an account selector labeled **Select a bank account**. Options identify the bank/account label and masked account hint.
4. Selecting an account loads its QR, receiving account name, account hint, booking reference, and selected payment amount. Do not choose a receiving account silently.
5. The customer pays through their bank, then uploads proof with the amount, actual payment date, transaction reference, and selected receiving account.
6. The page shows **Pending verification** and keeps the verified balance unchanged while review is pending.

### Down payment and remaining balance

Use one shared eligibility rule for reservation cards, Billing & Payments, and the payment page. The booking must be owned by the customer, in an existing payable lifecycle state, and have a positive outstanding balance.

| Financial/review state | Customer action |
| --- | --- |
| No verified payment | Submit payment; show bank selection for bank transfers |
| Some money recorded but deposit incomplete | Pay remaining down payment; retain the full-balance option |
| Deposit completed and balance remains | Pay remaining balance |
| Submitted proof awaits review | View payment and use the existing explicit proof-replacement flow; do not present another fresh payment instruction |
| Proof rejected and balance remains | Review the rejection and submit corrected proof/payment details |
| Outstanding balance is zero | View receipt; do not offer another payment |
| Pending approval, cancelled, rejected, or expired booking | No new payment action |

For example: a PHP 100,000 booking with a verified PHP 50,000 deposit shows PHP 50,000 outstanding and **Pay remaining balance**. A verified PHP 30,000 installment leaves PHP 20,000 payable. After the final verified PHP 20,000, the receipt shows PHP 100,000 received and zero balance.

Keep access for the existing confirmed/completed bookings that still have an outstanding balance, without changing their event status.

### Refresh and errors

- Refresh booking totals and proof history after submission and when returning to the page. Refresh totals after administrative verification using the existing focus/refresh patterns.
- Show loading, retry, and empty states for bank options and QR images.
- If no bank account is available, show a clear message and retain any supported alternative payment instructions. Do not show a permanent **Waiting for Payment QR** assignment state.
- Ignore a late QR response for an account the customer has already changed.
- If an account or QR changes before proof submission, preserve the form/file selection and show a clear conflict. When money has already been transferred, direct the customer to LA Chef to reconcile the transfer rather than asking them to pay again.

## Administrator experience

The QR management page remains the place to add/edit receiving accounts, upload QR images, and control availability. Remove the ordinary reservation assignment queue and **Send selected QR to customer** action from this flow.

Proof review shows the receiving bank snapshot next to the amount, reference, date, and proof. Verification and rejection keep their existing authorization, reasons, amount-correction rules, audit trail, and duplicate-credit protection.

Retain legacy assignment records for history and transition compatibility. A customer choosing a bank must never be recorded as a fictitious administrator assignment.

## Backend boundaries and API contract

Keep the Express authentication and controller/service/repository patterns. Bank eligibility and snapshot validation belong in a shared service used by listing, image access, and proof submission.

### Available bank accounts

Add `GET /api/payment-destinations/bookings/:id/options` for an authenticated owner of a payable bank-transfer booking. Return active Bank Transfer destinations with a nonempty QR image, ordered by account label and stable ID.

Each option includes `id`, `method`, `label`, `accountName`, `accountHint`, and an opaque `version` identifying the displayed metadata and QR image. Generate this version from the stored account/image content; do not rely only on a seconds-resolution timestamp.

List and image responses use `Cache-Control: no-store`. Do not expose other customers' bookings, private payment proofs, admin-only settings, or raw storage keys.

### QR image

Add a booking-scoped QR image endpoint at `GET /api/payment-destinations/bookings/:bookingId/options/:destinationId/image`, with the selected `version` query parameter. Authorize the booking owner, payable state, supported payment method, account availability, and matching version before returning the image. Customer access does not require `BOOKING_PAYMENT_DESTINATION`.

Keep existing administrator image access and any legacy readers functional during the transition. The new customer flow must not rely on the old assignment API.

### Proof submission

Extend the existing multipart proof submission with `destinationId` and `destinationVersion` for bank transfers. After locking the reservation and payment in the existing order, validate ownership, payable state, current outstanding amount, active destination, and version. Read receiving account details from the database, never from client-supplied labels or account names.

Insert the proof and its receiving bank snapshot in the same transaction. Use the selected account rather than the booking-level assignment. A request without the new fields may follow the legacy assignment path only when it has a valid existing assignment; do not select an arbitrary bank as a fallback.

Retain existing file validation, duplicate-reference protection, proof replacement, and recovery for stored files when a database write fails. Selecting another bank cannot overwrite a previously verified payment.

An account being disabled or edited after proof submission does not prevent staff from reviewing that proof. Review uses the submitted snapshot and verifies the actual transfer, not current account availability.

## Persistence and historical accuracy

Add migration `024_customer_bank_payment_snapshots.sql` with nullable receiving-bank fields on `PAYMENT_PROOF` and `PAYMENT_TRANSACTION`:

- `destination_id`: reference to the configured receiving account.
- `destination_label`: bank/account label at submission.
- `destination_account_name`: account name at submission.
- `destination_account_hint`: masked account details at submission.
- `destination_version`: version of the account metadata/QR used for submission.

Use bounded SQL types matching the existing destination fields and an optional foreign key to `PAYMENT_DESTINATION`. The migration is additive and repeat-safe. Update the migration registry, schema contract, and fresh-database verification expectations together.

Require complete snapshots in application validation for new customer-selected bank proofs. Nullable columns preserve existing cash payments, historical transfers, and already-submitted proofs. Do not invent a bank for older transactions by joining the current booking assignment; show **Bank not recorded** where no trustworthy historical snapshot exists.

On verification, copy the proof's snapshot into the newly appended ledger entry. On explicit administrator-recorded bank installments, capture an administrator-selected receiving account for that new installment; require an available configured account for new records while leaving historical records readable. Cash installments have no receiving-bank snapshot.

Do not overwrite a prior ledger entry, proof snapshot, or earlier payment method/date when another installment is received. Bank account editing changes future choices, not the bank shown for past verified installments.

## Atomic money updates and receipts

Continue using the existing lock order: reservation, payment aggregate, then proof and invoice. Under that transaction, verify the proof once, append its ledger credit, update the aggregate, synchronize invoice status, and write the audit/notification intent. Concurrent reviews and retries must not credit a proof twice or exceed the real outstanding balance.

Use integer cents for comparisons and existing decimal storage. Pending, rejected, and superseded proofs contribute zero verified money. Preserve existing correction reasons when verified amount differs from claimed amount.

Extend the invoice/receipt DTO and printable payment history with the receiving bank label, account name, and account hint per installment. The current receipt displays all verified installments, verified total received, and remaining balance. Fully paid requires a zero financial balance. Preserve the issued invoice's line items and original business pricing.

Update customer booking cards, customer billing, payment page, administrator proof review/detail, administrator payment records/history, invoice/receipt, and reports that expose payment records to use the same recorded totals and available receiving-bank snapshots. Keep booking/event status separate from payment status throughout.

## Verification criteria

1. An owned payable booking can list banks and display a selected QR without an admin assignment. Other customers cannot use those booking-scoped endpoints.
2. Multiple customers can choose the same active bank without reducing its availability or changing each other's selection.
3. Selecting Bank A then Bank B displays only Bank B's QR even if Bank A's response arrives later.
4. A new bank proof persists its server-read bank snapshot. Invalid, inactive, mismatched, and stale destination choices fail without crediting money or losing the form state.
5. A valid legacy assigned proof remains supported during deployment transition. Missing historical bank details are not fabricated.
6. A submitted proof stays reviewable with its snapshot after an admin edits/disables the receiving account.
7. A verified 50% deposit leaves **Pay remaining balance** visible in Reservations and Billing. Additional verified installments retain the action until zero balance.
8. A pending proof shows review status rather than another payment instruction. Rejection and explicit proof replacement preserve existing behavior.
9. Verification with corrected amounts, retries, duplicate references, and concurrent final payments produces one correct ledger credit and consistent invoice totals.
10. A deposit to Bank A and balance to Bank B retain both banks, amounts, dates, and references on the receipt and administrator history.
11. Staff cash/bank installment recording and existing cash instructions continue to work. Full settlement does not complete the event.
12. Full backend/frontend suites and production builds pass. Exercise focused customer/admin payment flows and receipts at mobile and desktop widths; label mocked browser/database checks as local evidence.

## Rollout and operational evidence

The user's Azure-first instruction is a release gate. No push, production migration, or feature deployment occurs while waiting for the user's Azure repair.

After the user reports recovery, verify the live API readiness, database health, and package-read endpoints. Record database readiness separately from process liveness.

Apply and verify the additive migration using the existing deployment procedure before deploying an API build that queries the new columns. Coordinate API then frontend deployment so the bank selector does not call endpoints absent from the deployed API. Keep nullable schema additions during any code rollback.

Only claim the live feature is verified after customer bank selection, QR access, admin review, remaining-balance actions, and receipt readback are observed against the deployed system. Do not create, verify, or settle a real customer's payment merely to test a deployment. Use an authorized test scenario or report that production transaction acceptance is still unverified.
