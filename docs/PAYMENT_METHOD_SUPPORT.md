# Supported payment methods

LA Chef accepts **Cash** and **Bank Transfer**. GCash/e-wallet cannot be selected for a new payment, uploaded as new proof, added or assigned as a receiving QR, verified into a new ledger credit, or recorded as an administrator/final-event payment. Bank transfer appears to customers only when a bank QR account is available.

Existing `E-WALLET` / `E_WALLET` values remain readable in invoices, proof history, the transaction ledger, and reports. Historical filters are labelled accordingly. No migration deletes records, rewrites earlier transaction methods or amounts, or removes legacy SQL constraints/types.

For an unpaid legacy booking with no proof history, **Change payment method** opens payment selection from My Reservations or Billing & Payments. A legacy booking with payment/proof history is handled by staff: in **Billing & Payments**, choose **Record payment**, explicitly select Cash or Bank Transfer, and confirm only the new money actually received. Bank payments require a verified transaction reference; cash uses the existing durable receipt reference. Recording updates the aggregate's current method and preserves the previous method in the audit log. Existing submitted proofs are superseded and their references archived by the existing manual-payment transaction. Earlier ledger credits remain intact. A pending GCash proof can be reviewed or rejected, but cannot be verified into a new credit.

Verification uses unit tests, SQL request mocks, and the isolated production-build browser audit. These checks do not establish real bank receipt, production database state, inbox delivery, physical-device compatibility, or successful cloud deployment.

Run the full backend/frontend suites and builds, then the payment viewport matrix:

```powershell
node scripts/check-responsive-layout.cjs --payments-only
```

This checks supported bank-transfer flows, QR assignment, payment selection/confirmation, legacy customer guidance, and explicit admin cash/bank recovery forms at seven viewport sizes. API writes are blocked in this browser audit.

Local verification on 2026-11-12: backend 564 passed / 2 skipped, frontend 534 passed, and both builds passed. The payment matrix covered 105 route/viewport combinations with zero detected layout issues or browser errors. Phone screenshots were inspected. The final admin template labels also passed 9 focused tests. Existing Angular stylesheet-budget and QR-library CommonJS warnings remain.
