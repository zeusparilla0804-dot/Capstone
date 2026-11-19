# Packages & Menu verification and final handover

Date: November 19, 2026 (Asia/Manila).

## Coding result

The Packages & Menu fix passed local verification. The live rollout still requires migration 028 and deployment of the updated API and frontend.

- `PACKAGE.menu_key` retains the menu identity when an administrator edits the package name or price. Migration `028_package_menu_keys.sql` backfills the nine recognized catalog templates and leaves unknown packages unassigned.
- Public catalog lookup, booking creation and pending-booking updates use the saved menu identity. Public inclusions and default galleries also follow that identity after a rename. Existing reservation menu/pricing snapshots are preserved.
- Booking options use the current numeric pricing fields. A name such as `PHP 580 Per Head` no longer overrides an updated price of PHP 625. Per-head and base-plus-excess pricing retain their existing calculation rules.
- Creating a package with a recognized catalog name assigns its menu key. This change does not introduce a menu-template editor for arbitrary new packages.

## Verification completed in this session

| Check | Result and boundary |
| --- | --- |
| Regression reproduction | Before the fix, renamed-package menu mapping/validation and public inclusions failed; the booking option displayed the old price. The same targeted tests pass after the fix. |
| Backend suite | 635 passed, 2 skipped, 0 failed. Local tests; dotenv disabled for the suite. |
| Frontend suite | 646 passed in 74 files. Local component/service tests. |
| Backend build | Passed. |
| Frontend production build | Passed. Warnings remain for the 17.94 KB booking stylesheet and CommonJS QR dependencies. |
| Disposable SQL verification | All migrations applied, migration history rerun, schema checked, all four configured SQL-backed E2E journeys passed, baseline rerun checked, generated database removed. |
| Menu migration on SQL Server | Verified recognized-name backfill (including repeated spaces, tabs and nonbreaking spaces), rename plus price update, repeat execution preserving the saved key, and no unrelated menu assignment for an unknown package. Test rows were rolled back inside the disposable database. |
| Code review | Independent review found a whitespace-normalization upgrade gap; the SQL regression reproduced it, the migration was corrected, the full disposable verifier passed again, and re-review found no remaining important correctness issues. |
| Deployed readiness | `GET https://api.la-chef.online/api/health/ready` returned `success: true, status: ready`. This does not identify a Render deployment commit. |
| Deployed catalog | Public API returned nine packages with menus and the existing published prices. None exposed the new `menuKey` property. All nine current names match the migration's backfill cases. |

SQL E2E fixtures use test accounts and a disposable database. Their queued email assertions do not prove real inbox delivery. They do not prove an Azure restore or real mobile/desktop acceptance.

## Rollout of this fix

1. Review migration 028 and the target package inventory. An already-renamed, unrecognized package needs its intended menu identified explicitly; do not infer a menu from its price or row ID.
2. Apply migrations with the migration credential **before starting the new backend**, because its catalog queries read `menu_key`. Keep the application runtime credential separate.
3. Deploy the reviewed backend and frontend revision. Record the exact successful deployment commit(s).
4. On an approved test package, verify admin rename and price update, the matching public menu/inclusions, booking option price, selected menu submission, and server-calculated total. Verify an existing booking retains its saved snapshot. Restore approved catalog values after acceptance.

The application's existing database was not migrated in this session. No production package, booking, payment or account was changed.

## Final handover gates still open

| Gate | Evidence required to close it | Current status |
| --- | --- | --- |
| Exact Render rescheduling deployment | Successful deploy ID, full commit SHA containing local commit `8d3b379` (or a reviewed equivalent), service/environment, and authenticated rescheduling acceptance with availability conflict handling and customer notification. | Not verified. Health is ready, but the public endpoint does not expose a commit. Desktop/browser connection failed with native pipe unavailable. |
| Verification and password-reset email delivery | Approved test recipient, request/send/receive times, actual received verification and reset messages, successful verification/reset, and delivery/retry evidence without recording codes or reset tokens. | Not verified. No mailbox/provider session is available; local staging has the email worker disabled. |
| Azure runtime permissions | Confirm actual runtime identity and Azure database, required application operations, and lack of schema/database/login administration rights; use the migration identity separately. | Not verified. Local staging configuration is not an Azure SQL host and cannot establish deployed runtime permissions. Existing SQL Server permission probes require review for the actual Azure deployment type. |
| Coordinated database and payment-proof recovery | Approved database recovery point/export and matching private proof snapshot, isolated restore target, integrity checks, sampled storage-key/file reconciliation, and application access to restored proofs. | Not executed. Confirm Azure SQL recovery method and actual durable proof storage before choosing restore commands. A database restore alone does not recover proof files. |
| Phone and desktop acceptance | Actual browser/device records for registration, verification, login, package/menu choice, booking, admin approval, payment selection, proof upload/rejection/resubmission/verification, invoice/receipt and balances. Include rescheduling and recovery checks where applicable. | Not executed on live devices. Local automated suites are supporting evidence only. |

Required next access: the intended Render service's deployment details, approved test mailbox access, the Azure runtime identity/connection through the approved operator, actual proof-storage/recovery destinations, and phone/desktop acceptance participants. Keep credentials and tokens in the platform secret store, not this document.
