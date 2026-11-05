# Restore pre-November 2 booking flow

User-approved scope: restore the entire booking/payment timing flow that preceded the policy-v2 update. Preserve unrelated changes and all stored business records.

- [x] Restore calendar-day booking/cash validation and ordinary admin status transitions.
- [x] Remove policy-v2 runtime hooks, routes, worker, and payment extensions.
- [x] Restore customer/admin forms and remove policy-v2 information panels.
- [x] Update focused regression tests; run backend/frontend checks and builds.

Ruling: retain applied migration 020 and its additive schema as dormant historical metadata. Do not drop tables, rewrite reservation statuses, delete records, or create backups/commits. Existing EXPIRED values remain readable, but automatic expiry is disabled.

Ruling: work in the existing dirty workspace using targeted edits. A whole-file Git restore would discard earlier unrelated fixes.

Final verification: backend 462 passed, 2 skipped (464 total); backend TypeScript build passed. Frontend 357 passed across 55 files; production build passed. `git diff --check` passed. Active source scan found no policy-v2 runtime hooks or metadata references outside the retained schema contract. Independent read-only review found no important/critical issue; its cash-copy note was corrected. No live browser or SQL end-to-end verification was performed.
