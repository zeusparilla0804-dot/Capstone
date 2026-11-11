# Application readiness verification — November 11, 2026

The local application checks below pass. This is evidence for the current working tree, not a production deployment approval. The staging gates in PRODUCTION_READINESS_AUDIT.md remain open until verified on the actual deployment.

## Verified results

| Check | Result | Boundary |
| --- | --- | --- |
| Backend unit, repository, controller and route tests | 547 passed, 2 skipped, 0 failed (549 total) | Includes payment/completion guards and transaction rollback tests; two skipped tests were not executed |
| Frontend tests | 512 passed across 64 files | Local automated component/service coverage |
| Backend TypeScript build | Passed | Current working tree |
| Angular production build | Passed | Booking stylesheet 17.94 KB: below the existing 18 KB error limit, with a 17 KB warning remaining |
| Operations and layout scripts | 19 passed | Recovery planning, permission contracts, smoke-response validation and layout contracts |
| Fresh SQL Server verification | Passed | Migrations run twice, current schema checked, all four configured backend E2E journeys passed, baseline rerun checked, disposable database removed |
| Responsive browser checks | 4 passed | Public pages and booking at 390/1440 px; unpaid invoice and verified receipt including print visibility |
| npm dependency audit | 0 reported vulnerabilities in each project | Point-in-time registry advisory check; not a complete security audit |

The SQL journeys cover customer registration/verification/login, cash credits and idempotency, booking capacity, approval and payment request state, bank QR assignment, proof rejection/resubmission/verification, invoices, reports, customer account updates, password recovery and session security. These run in a generated disposable database; the application's existing customer database is not used for these test mutations. No SMTP worker is started by these fixtures.

The browser checks mock API responses and prohibit write requests. They check loaded package images, mixed Standard/Wedding/Debut featured packages, page overflow, preparation-note placement and date-field alignment. Billing checks confirm the invoice/receipt heading, both signature names, absence of a discount row and verified-payment print visibility. They do not replace an authenticated live browser walkthrough or paper print review.

Event completion and mixed-method final settlement are covered by repository/controller tests, including bank down payment followed by cash, zero-amount completion after full payment, future-event rejection, changed-balance rejection and rollback. A real SQL-backed final-settlement/completion journey and manual event-day acceptance remain additional release checks.

## Corrections made during verification

- Reduced duplicated booking stylesheet selectors/declarations to unblock production compilation without raising the style budget.
- Updated the schema contract for migrations 022/023 and their payment-destination, notification-read and package-image tables. Added regression coverage against the shipped migration list.
- Updated obsolete test fixtures for the current 4/6-day booking minimum, payment selection after approval, automatic payment requests, available bank destinations, current cash request identifiers and email re-verification after an address change.
- Updated layout assertions for the current intentional typography, billing layout and receipt print behavior.
- Added a repeatable mocked browser suite: run `npm run test:readiness` in `frontend` while the frontend is served locally. `PUBLIC_QA_URL` may override its base URL.

## Still requires the actual staging environment

1. Confirm Gmail verification/reset delivery and timing using approved test mailboxes; inspect retries and failed-delivery monitoring. Queue/API tests cannot establish inbox arrival time.
2. Run the runtime SQL permission probe using the production-style least-privilege account, separate from the migration/provisioning credential.
3. Rehearse coordinated SQL database and private payment-proof backup/restoration into isolated destinations, including integrity and file linkage checks.
4. Check the deployed HTTPS domain, secure cookies, proxy headers, private proof access, environment secrets and health/smoke endpoints.
5. Perform owner acceptance of event-day final payments, completed status, updated receipts and actual printed documents. These checks do not certify tax-document compliance.

Do not delete operational runbooks or CI merely because local tests pass. They support repeatable deployment and recovery verification.
