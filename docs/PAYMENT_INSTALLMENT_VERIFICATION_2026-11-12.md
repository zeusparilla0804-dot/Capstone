# Payment installment verification - November 12, 2026

Completed the pending mixed-method installment regression work in the existing checkout.

- After a recorded payment, staff can choose Cash or Bank transfer for the next installment and enter the actual received date.
- Cash generates its receipt reference through the existing request flow. Bank payments still require a verified transaction reference.
- The first payment still follows the selected booking method, with the existing retired-GCash recovery exception preserved.
- Each installment appends a transaction; earlier transaction methods and dates are not rewritten. The payment summary reflects the latest received payment.
- Recording a balance does not automatically complete the event.

## Fresh local verification

| Check | Result |
| --- | --- |
| Frontend unit suite | 538 passed across 65 files |
| Backend suite | 568 passed, 2 skipped, 0 failed |
| Frontend production build | Passed; existing booking stylesheet and QR CommonJS warnings remain |
| Backend TypeScript build | Passed |
| Installment responsive browser audit | 14 cases passed, 0 issues or unhandled API endpoints |

The responsive audit covers cash after bank and bank after cash at 320, 390, 430, 768, 1024, 1440 and 1920 px. Run `node scripts/check-responsive-layout.cjs --installments-only --screenshots --report=installments-final.json` after a frontend production build. Reports and screenshots are generated under `.codex-temp/responsive/`.

Repository tests use mocked database requests; browser checks use mocked API responses and block payment writes. No live SQL payment, inbox delivery, deployed staging acceptance or actual printed receipt was verified by these checks. Existing footer and responsive-layout changes were preserved and included in the verified working tree.
