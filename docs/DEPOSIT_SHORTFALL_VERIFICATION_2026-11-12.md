# Incomplete down payment verification - November 12, 2026

## Behavior

For a PHP 154,000 reservation with PHP 70,000 verified, the required 50% deposit is PHP 77,000, its shortfall is PHP 7,000, and the total balance due is PHP 84,000. The shortfall is part of the total balance, not an additional charge.

- Customer reservation cards, Billing & Payments and the proof page identify the incomplete deposit and remaining amount. Receipt totals list the required and remaining down payment separately from Balance Due, including in print.
- The next bank-payment proof defaults to the remaining deposit. Existing recorded money stays credited; the existing payment-verification transaction and reservation-confirmation guard remain authoritative.
- While a proof awaits review, the customer sees review-only instructions. Explicit replacement preloads the existing submitted proof and does not show instructions to send another transfer. Replaced proofs appear superseded locally as well as in persistence.
- Proof history shows claimed amount, verified amount, correction note and Philippine review time, and remains readable after full settlement.
- Correction notes are read from the existing proof-specific administrator audit entry, scoped by reservation and proof ID. No schema migration or audit data rewrite is needed.
- New verification notifications contain a snapshot of the verified amount, deposit shortfall and overall balance. In-app incomplete-deposit notifications link to the payment record. Historical notifications retain their recorded context; current payment screens use the current cumulative paid amount.
- The 50% confirmation rule is unchanged. This change does not introduce a deferred-payment exception or automatically confirm a reservation.

## Verification

| Check | Result |
| --- | --- |
| Frontend unit suite | 550 passed across 66 files |
| Backend suite | 577 passed, 2 skipped, 0 failed |
| Production frontend and backend builds | Passed; existing frontend style-budget/CommonJS warnings remain |
| Responsive browser audit | 63 cases at 320, 390, 430, 768, 1024, 1440 and 1920px; no reported issues |
| Billing print/browser suite | 3 passed: unpaid invoice, partial-deposit receipt and fully paid receipt; PDF output generated from mocked data |
| Fresh local SQL verification | All four configured journeys passed; disposable database cleanup completed |
| Code review | Pending-payment transfer prompts and fully-paid history findings fixed and re-reviewed |

The SQL operations journey verifies one corrected partial credit despite concurrent review attempts, customer-visible audit feedback and a shortfall notification, blocked premature confirmation, a separate top-up proof, and the correct cumulative deposit after both credits. Browser checks use mocked APIs and block financial writes. Email content/outbox tests do not prove inbox delivery; no live customer payment was created or altered for verification.
