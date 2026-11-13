# Supported payment methods

LA Chef accepts **Cash** and **Bank Transfer**. GCash/e-wallet cannot be selected for a new payment, uploaded as new proof, added or assigned as a receiving QR, verified into a new ledger credit, or recorded as an administrator/final-event payment. Bank transfer appears to customers only when a bank QR account is available. Customers choose an available receiving bank and immediately see its QR, without an administrator assigning an account. Bank selection and proof upload do not credit money; administrators still verify receipt of funds.

Existing `E-WALLET` / `E_WALLET` values remain readable in invoices, proof history, the transaction ledger, and reports. Historical filters are labelled accordingly. No migration deletes records, rewrites earlier transaction methods or amounts, or removes legacy SQL constraints/types.

For an unpaid legacy booking with no proof history, **Change payment method** opens payment selection from My Reservations or Billing & Payments. A legacy booking with payment/proof history is handled by staff: in **Billing & Payments**, choose **Record payment**, explicitly select Cash or Bank Transfer, and confirm only the new money actually received. Bank payments require an explicit receiving bank and a verified transaction reference; cash uses the existing durable receipt reference. Recording updates the aggregate's current method and preserves the previous method in the audit log. Existing submitted proofs are superseded and their references archived by the existing manual-payment transaction. Earlier ledger credits remain intact. A pending GCash proof can be reviewed or rejected, but cannot be verified into a new credit.

Verification uses unit tests, SQL request mocks, and the isolated production-build browser audit. These checks do not establish real bank receipt, production database state, inbox delivery, physical-device compatibility, or successful cloud deployment.

Run the full backend/frontend suites and builds, then the payment viewport matrix:

```powershell
node scripts/check-responsive-layout.cjs --payments-only
```

This checks supported bank-transfer flows, customer bank selection, payment selection/confirmation, legacy customer guidance, and explicit admin cash/bank recovery forms at seven viewport sizes. API writes are blocked in this browser audit.

Local verification on 2026-11-12: backend 564 passed / 2 skipped, frontend 534 passed, and both builds passed. The payment matrix covered 105 route/viewport combinations with zero detected layout issues or browser errors. Phone screenshots were inspected. The final admin template labels also passed 9 focused tests. Existing Angular stylesheet-budget and QR-library CommonJS warnings remain.

Customers retain **Pay remaining balance** after their verified deposit until fully paid. Pending proofs show **View Payment**. Explicit proof replacement preserves the stored bank for an image correction, or permits correcting the receiving bank without requesting another transfer. Customers enter the actual date shown on their receipt.

Every new proof and verified bank installment records its receiving-account snapshot. Receipts and history read that installment snapshot; editing an account does not rewrite prior payments. Historical bank entries without a trustworthy snapshot display **Bank not recorded**. Cash has no receiving-bank label.

Apply additive migration `024_customer_bank_payment_snapshots.sql` before releasing the new API, then deploy the frontend after the API is ready. This release must not query missing production columns.
