# LA Chef Empty-Database Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision and verify the complete LA Chef SQL Server schema from an empty database using only tracked repository files and no mock business or credential data.

**Architecture:** Add a guarded `000_initial_schema.sql` that creates only the eight foundational tables required by migration `001`, then retain the existing ordered migration chain for every later object. A typed schema-contract module and a production-refusing disposable-database verifier will create an isolated database, run migrations twice, execute backend SQL E2E, validate the resulting catalog, and always drop the database.

**Tech Stack:** Microsoft SQL Server 2022, T-SQL, Node.js 22.22.3+, TypeScript 7, `mssql`, Node test runner, `tsx`, npm, GitHub Actions, Angular 22.

**Spec:** `docs/superpowers/specs/2026-10-09-empty-database-baseline-design.md`

## Global Constraints

- Do not delete or modify rows in the current development or production database.
- Do not recreate, fabricate, or record `007_starter_catalog.sql`; the gap between `006` and `008` is intentional.
- Do not seed administrators, customers, packages, menu items, reservations, payments, proofs, notifications, or other business records.
- The only inserted reference data remains the five event types owned by `006_phase81_system_event_types.sql`.
- Credentials remain in secret-managed environment variables; source, logs, documentation, and example files contain placeholders only.
- The verifier must refuse `NODE_ENV=production`, require explicit disposable-database confirmation, generate its own allow-listed database name, and never target `DB_DATABASE`.
- The runtime SQL identity must not receive database create/drop permissions; those permissions belong only to the CI/deployment verifier identity.
- Existing API, authentication, booking, payment, admin, and Angular behavior must remain unchanged.

## Review Focus

- A partially present foundational schema must fail with a descriptive contract violation and leave `000` unrecorded, never silently alter unknown objects.
- Production, missing-confirmation, unsafe-name, and current-application-database inputs must be rejected before any create/drop statement runs.
- Migration discovery must apply `006` then `008` without inventing or requiring `007`.
- Migration, schema assertion, or backend E2E failure must still trigger disposable-database cleanup and preserve the original failure.
- Re-running migrations and re-executing the guarded baseline against a compatible migrated schema must create no duplicate rows or objects.

---

### Task 1: Foundational Schema Migration

**Files:**
- Create: `backend/migrations/000_initial_schema.sql`
- Create: `backend/src/migrations/initial-schema.test.ts`

**Interfaces:**
- Consumes: The existing migration runner's `^\d+_.+\.sql$` discovery and transaction behavior in `backend/src/scripts/migrate.ts`.
- Produces: The pre-`001` versions of `dbo.CUSTOMER`, `dbo.ADMIN`, `dbo.EVENT`, `dbo.PACKAGE`, `dbo.MENU_ITEM`, `dbo.RESERVATION`, `dbo.PAYMENT`, and `dbo.NOTIFICATION`.

- [ ] **Step 1: Write failing static contract tests for migration `000`**

In `initial-schema.test.ts`, read the SQL file and add these tests:

- `baseline creates exactly the eight guarded foundational tables`
- `baseline defines the pre-001 columns and relationships`
- `baseline validates compatible existing objects and throws on violations`
- `baseline contains no business inserts or later-migration objects`

Assert the pre-`001` column sets exactly:

```text
CUSTOMER: customer_id, first_name, last_name, email, contact_number, address, password, created_at
ADMIN: admin_id, username, password, full_name, role, contact_number, email, status
EVENT: event_id, event_type, description
PACKAGE: package_id, event_id, package_name, description, price_per_head, min_guest, max_guest
MENU_ITEM: menu_item_id, package_id, item_name, category, description
RESERVATION: reservation_id, customer_id, event_id, event_date, event_time, guest_count, venue_address, special_request, status, created_at
PAYMENT: payment_id, reservation_id, admin_id, amount_due, amount_paid, payment_method, payment_date, transaction_ref, status
NOTIFICATION: notification_id, reservation_id, recipient_type, recipient_id, message, status, sent_at
```

Also assert guarded `OBJECT_ID` checks, named PK/UQ/FK/default/check/index contracts, `SET XACT_ABORT ON`, transaction boundaries, metadata-validation queries, and SQL `THROW`. Reject inserts or merges into persistent `dbo` tables, `SCHEMA_MIGRATION`, every table owned by migrations `001`-`010`, `INVOICE_NUMBER_SEQUENCE`, and later columns such as `PACKAGE.is_active` and `RESERVATION.package_id`. Inserts into a local table variable used to collect validation failures are allowed.

- [ ] **Step 2: Run the focused test and confirm the missing migration failure**

Run: `npm.cmd exec -- tsx --test src/migrations/initial-schema.test.ts`

Expected: FAIL because `backend/migrations/000_initial_schema.sql` does not exist.

- [ ] **Step 3: Implement the guarded foundational migration**

Create each table only when `OBJECT_ID(..., 'U') IS NULL`, in dependency order. Preserve the current verified foundational identifiers, SQL types, identity settings, nullability, keys, status/payment checks, defaults, foreign keys, and original supporting indexes.

After creation, collect baseline-owned metadata violations into a table variable and `THROW` one descriptive error if any required contract is absent or incompatible. Validate the required subset and allow columns/indexes added by later tracked migrations. Do not repair, drop, rename, reseed, or populate an existing object.

- [ ] **Step 4: Run the focused and complete backend unit suites**

Run: `npm.cmd exec -- tsx --test src/migrations/initial-schema.test.ts`

Expected: PASS with four baseline contract tests.

Run: `npm.cmd test`

Expected: all backend unit tests pass; SQL E2E is not part of this command.

- [ ] **Step 5: Commit the baseline migration**

```powershell
git add backend/migrations/000_initial_schema.sql backend/src/migrations/initial-schema.test.ts
git commit -m "feat: add foundational database baseline"
```

---

### Task 2: Executable Current-Schema Contract

**Files:**
- Create: `backend/src/migrations/schema-contract.ts`
- Create: `backend/src/migrations/schema-contract.test.ts`

**Interfaces:**
- Consumes: A connected `mssql.ConnectionPool` after the full tracked migration chain has run.
- Produces: `loadSchemaSnapshot(pool: sql.ConnectionPool): Promise<SchemaSnapshot>`, `findSchemaContractViolations(snapshot: SchemaSnapshot, options: SchemaContractOptions): string[]`, `assertCurrentSchema(pool: sql.ConnectionPool, options?: SchemaContractOptions): Promise<void>`, and `EXPECTED_MIGRATIONS`. `SchemaContractOptions.migrationHistory` is `'fresh' | 'compatible'` and defaults to `'compatible'`.

- [ ] **Step 1: Write failing schema-contract comparison tests**

Define test fixtures and assertions for:

- `complete migrated schema satisfies the contract`
- `missing or incompatible columns produce named violations`
- `missing keys constraints indexes defaults and sequence produce named violations`
- `fresh migration history requires 000-006 and 008-010 without 007`
- `compatible migration history permits the historical 007 record but still requires every tracked migration`
- `unexpected business rows are not part of schema validation`

The synthetic valid snapshot must include all current tables, every backend-used column with type/nullability/identity metadata, stable named PK/UQ/FK/check/default contracts, query-supporting indexes, and `dbo.INVOICE_NUMBER_SEQUENCE`.

- [ ] **Step 2: Run tests and confirm the contract module is missing**

Run: `npm.cmd exec -- tsx --test src/migrations/schema-contract.test.ts`

Expected: FAIL because `schema-contract.ts` and its exported interfaces do not exist.

- [ ] **Step 3: Implement the schema snapshot and comparison module**

Use structured SQL Server catalog queries against `sys.tables`, `sys.columns`, `sys.types`, `sys.identity_columns`, `sys.key_constraints`, `sys.foreign_keys`, `sys.foreign_key_columns`, `sys.check_constraints`, `sys.default_constraints`, `sys.indexes`, `sys.index_columns`, and `sys.sequences`. Query `dbo.SCHEMA_MIGRATION` separately.

`findSchemaContractViolations` must be deterministic and return human-readable object paths such as `dbo.RESERVATION.booking_reference: missing column` or `IX_RESERVATION_event_capacity: missing index`. `assertCurrentSchema` throws one redacted error containing all violations and no row contents or connection details. Fresh mode requires the exact tracked list below; compatible mode requires every tracked filename but permits the known historical `007_starter_catalog.sql` record on an existing database.

Set `EXPECTED_MIGRATIONS` to these exact filenames:

```text
000_initial_schema.sql
001_phase5_data_layer.sql
002_phase6_admin.sql
003_phase7_invoices.sql
004_phase8_production_hardening.sql
005_phase81_admin_audit.sql
006_phase81_system_event_types.sql
008_admin_operations_core.sql
009_release_rejected_proof_references.sql
010_booking_capacity_availability.sql
```

- [ ] **Step 4: Run schema-contract and full backend tests**

Run: `npm.cmd exec -- tsx --test src/migrations/schema-contract.test.ts src/migrations/initial-schema.test.ts`

Expected: PASS, including explicit absence of `007` from expected history.

Run: `npm.cmd test`

Expected: all backend unit tests pass.

- [ ] **Step 5: Commit the executable contract**

```powershell
git add backend/src/migrations/schema-contract.ts backend/src/migrations/schema-contract.test.ts
git commit -m "test: define current database schema contract"
```

---

### Task 3: Guarded Disposable-Database Verifier

**Files:**
- Create: `backend/src/migrations/fresh-database-verifier.ts`
- Create: `backend/src/migrations/fresh-database-verifier.test.ts`
- Create: `backend/e2e/fresh-database.e2e.ts`

**Interfaces:**
- Consumes: `VERIFY_DB_SERVER`, `VERIFY_DB_PORT`, `VERIFY_DB_ADMIN_DATABASE`, `VERIFY_DB_USER`, `VERIFY_DB_PASSWORD`, `VERIFY_DB_ENCRYPT`, `VERIFY_DB_TRUST_SERVER_CERTIFICATE`, and `VERIFY_DB_CONFIRM_DISPOSABLE`; the migration and backend E2E npm scripts; `assertCurrentSchema(pool, options)` from Task 2.
- Produces: `readFreshDatabaseConfig(env: NodeJS.ProcessEnv): FreshDatabaseConfig`, `createDisposableDatabaseName(uuid?: string): string`, `runFreshDatabaseVerification(config: FreshDatabaseConfig, dependencies: FreshDatabaseVerifierDependencies): Promise<void>`, and a runnable `fresh-database.e2e.ts` entry point.

- [ ] **Step 1: Write failing verifier guard and lifecycle tests**

Cover these exact cases in `fresh-database-verifier.test.ts`:

- `rejects production before connecting`
- `requires VERIFY_DB_CONFIRM_DISPOSABLE=true`
- `requires every verifier credential and a valid port/boolean`
- `generates only LA_CHEF_VERIFY_<hex> database names`
- `rejects an unsafe database name or the configured DB_DATABASE`
- `runs create migrate migrate-again contract-and-data-check e2e drop in order`
- `drops the database when migration contract or e2e fails`
- `preserves the original verification error when cleanup also fails`

Use injected fake dependencies; unit tests must not connect to SQL Server or spawn npm.

- [ ] **Step 2: Run tests and confirm verifier exports are missing**

Run: `npm.cmd exec -- tsx --test src/migrations/fresh-database-verifier.test.ts`

Expected: FAIL because the verifier module does not exist.

- [ ] **Step 3: Implement pure configuration guards and orchestration**

The generated name must match `^LA_CHEF_VERIFY_[A-F0-9]{32}$`. Build identifier SQL only after this allow-list check. The orchestration interface delegates create, migrate, schema/data verification, backend E2E, and drop operations so failure/cleanup ordering is unit-testable.

Reject `NODE_ENV=production`, any confirmation value other than lowercase `true`, missing verifier values, and a generated name equal to `DB_DATABASE`. Never log configuration values.

- [ ] **Step 4: Implement the real SQL Server and child-process adapter**

In `fresh-database.e2e.ts`:

1. Connect to `VERIFY_DB_ADMIN_DATABASE` (normally `master`) with verifier credentials.
2. Create the generated database.
3. Spawn `npm run db:migrate` twice with `NODE_ENV=test`, generated `DB_DATABASE`, verifier connection values mapped to `DB_*`, safe local `FRONTEND_URL`, a temporary proof-upload directory, and email delivery disabled.
4. Connect to the generated database and call `assertCurrentSchema(pool, { migrationHistory: 'fresh' })`.
5. Assert exactly five `EVENT` reference rows and zero rows in `ADMIN`, `CUSTOMER`, `PACKAGE`, `MENU_ITEM`, `RESERVATION`, `PAYMENT`, `PAYMENT_PROOF`, `PAYMENT_TRANSACTION`, `INVOICE`, `NOTIFICATION`, and `EMAIL_OUTBOX` before E2E fixtures run.
6. Execute `npm run test:e2e` against the generated database.
7. After E2E fixture cleanup, capture the business-row counts, execute raw `000_initial_schema.sql` once against the fully migrated database, then assert the schema contract and captured counts remain unchanged.
8. Close all pools, set the generated database to `SINGLE_USER WITH ROLLBACK IMMEDIATE`, drop it, and remove the temporary upload directory in `finally`.

Use `npm.cmd` on Windows and `npm` elsewhere. Capture child exit status while streaming useful output, but redact environment values and never print row contents.

- [ ] **Step 5: Run unit tests and TypeScript build**

Run: `npm.cmd exec -- tsx --test src/migrations/fresh-database-verifier.test.ts src/migrations/schema-contract.test.ts src/migrations/initial-schema.test.ts`

Expected: PASS.

Run: `npm.cmd run build`

Expected: TypeScript compilation succeeds.

- [ ] **Step 6: Run the disposable SQL verification when test credentials are available**

Run: `npm.cmd exec -- tsx e2e/fresh-database.e2e.ts`

Expected: with non-production verifier credentials, report two current migration runs, a valid schema, passing backend E2E, and successful disposal. Without those credentials, fail before connecting with a missing verifier configuration error. SQL Server Object Explorer must show no remaining `LA_CHEF_VERIFY_*` database after a connected run.

- [ ] **Step 7: Commit the verifier implementation**

```powershell
git add backend/src/migrations/fresh-database-verifier.ts backend/src/migrations/fresh-database-verifier.test.ts backend/e2e/fresh-database.e2e.ts
git commit -m "test: verify migrations from an empty database"
```

---

### Task 4: Package Scripts And CI Provisioning

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `backend/e2e/fresh-database.e2e.ts` and GitHub secrets for a SQL provisioning identity.
- Produces: `npm run db:verify:fresh` and an opt-in CI fresh-database gate.

- [ ] **Step 1: Add the local verifier command and placeholder configuration**

Add:

```json
"db:verify:fresh": "tsx e2e/fresh-database.e2e.ts"
```

Add a commented `Fresh database verification only` block to `.env.example` for all `VERIFY_DB_*` variables. Use obvious placeholders and leave `VERIFY_DB_CONFIRM_DISPOSABLE=false` by default.

- [ ] **Step 2: Wire the verifier into the opt-in operations E2E job**

Map the existing server/port/encryption values plus dedicated `E2E_DB_PROVISIONER_USER` and `E2E_DB_PROVISIONER_PASSWORD` secrets to `VERIFY_DB_*`. Set `VERIFY_DB_ADMIN_DATABASE=master` and `VERIFY_DB_CONFIRM_DISPOSABLE=true` only in the job. Run `npm run db:verify:fresh` before the existing persistent integration-database migration and browser E2E steps.

Do not expose secret values in command arguments or workflow output. Keep the normal `build-and-test` job independent of SQL Server.

- [ ] **Step 3: Verify package metadata, guards, and CI references**

Run: `npm.cmd exec -- tsx --test src/migrations/fresh-database-verifier.test.ts`

Expected: PASS.

Run: `npm.cmd run build`

Expected: PASS.

Run from the repository root: `rg -n "db:verify:fresh|VERIFY_DB_CONFIRM_DISPOSABLE|E2E_DB_PROVISIONER" backend/package.json backend/.env.example .github/workflows/ci.yml`

Expected: the command, safe default, explicit CI confirmation, and dedicated provisioner secrets are present.

- [ ] **Step 4: Run the full disposable verifier**

Configure non-production verifier credentials in the local environment, then run: `npm.cmd run db:verify:fresh`

Expected: all migrations and backend SQL E2E pass; the generated database is dropped. If create/drop privileges are unavailable, record the command as blocked rather than treating it as passed.

- [ ] **Step 5: Commit scripts and CI wiring**

```powershell
git add backend/package.json backend/.env.example .github/workflows/ci.yml
git commit -m "ci: verify fresh database provisioning"
```

---

### Task 5: Deployment And Release Documentation

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/RELEASE.md`
- Modify: `docs/RELEASE_FILE_INVENTORY.md`
- Modify: `docs/PRODUCTION_READINESS_AUDIT.md`

**Interfaces:**
- Consumes: The verified `000` migration, `db:verify:fresh` command, dedicated provisioner/runtime identity boundary, and intentional `007` gap.
- Produces: An operator-facing fresh provisioning procedure and an accurate release/readiness record.

- [ ] **Step 1: Replace the pre-baselined-database limitation**

Document this deployment order: backup, build, `db:verify:fresh` in CI/staging infrastructure, `db:migrate:prod` using the migration principal, backend readiness, frontend promotion, and secure `admin:create` for a genuinely new environment.

State that domains route traffic only and never receive SQL credentials. Document that migration failure stops deployment and that numbered migrations are not automatically reversed.

- [ ] **Step 2: Document exact migration and data boundaries**

List `000`-`006` and `008`-`010` in order, explain the honest `007` gap, identify the five system event types as the only reference rows, and keep provisional catalog/sample cleanup outside this release task.

Update the release inventory to classify `000`, the verifier source/tests, and safe CI/templates as committed release inputs. Remove obsolete claims that a pre-baselined backup is required or that migration `010` is absent.

- [ ] **Step 3: Update the readiness finding without overstating production status**

After successful disposable verification, mark the empty-database baseline finding resolved with command evidence and date. Keep unrelated unresolved production blockers unchanged, and do not declare the whole application production-ready solely because this item is fixed.

- [ ] **Step 4: Review documentation for secrets and contradictions**

Run: `rg -n "pre-baselined|001.*009|empty-database baseline is not yet|007_starter_catalog|DB_PASSWORD=" docs backend/.env.example`

Expected: only intentional historical/audit wording remains; no credential value appears.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Commit deployment documentation**

```powershell
git add docs/DEPLOYMENT.md docs/RELEASE.md docs/RELEASE_FILE_INVENTORY.md docs/PRODUCTION_READINESS_AUDIT.md
git commit -m "docs: document fresh database provisioning"
```

---

### Task 6: Complete Release Verification

**Files:**
- Verify only; modify a source file only to fix a failure caused by Tasks 1-5.

**Interfaces:**
- Consumes: All deliverables from Tasks 1-5.
- Produces: Final evidence that the baseline is release-candidate ready without deploying or cleaning live data.

- [ ] **Step 1: Run backend unit and build verification**

Run from `backend`:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all backend unit tests and TypeScript compilation pass.

- [ ] **Step 2: Run disposable SQL Server verification**

Run: `npm.cmd run db:verify:fresh`

Expected: empty provisioning, second migration pass, schema contract, zero-business-data assertions, compatible raw-baseline rerun, backend E2E, and database cleanup all pass.

- [ ] **Step 3: Run Angular regression verification**

Run from `frontend`:

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

Expected: all Angular tests and the production build pass with Node.js `22.22.3` or newer.

- [ ] **Step 4: Inspect repository and migration ordering**

Run from the repository root:

```powershell
git diff --check
git status --short
Get-ChildItem backend/migrations -File | Sort-Object Name | Select-Object -ExpandProperty Name
```

Expected: migration order starts at `000`, intentionally skips `007`, ends at `010`, and no `.env`, upload, log, build output, generated database artifact, or provisional fixture is staged.

- [ ] **Step 5: Commit only failure-driven fixes, if any**

If verification required changes, stage only those exact files and commit:

```powershell
git commit -m "fix: complete database baseline verification"
```

If no changes were required, do not create an empty commit.

- [ ] **Step 6: Report completion evidence**

Report backend unit/build status, fresh-database and SQL E2E status, Angular unit/build status, exact migration order, whether cleanup removed the generated database, final Git status, and any verification that could not run. Do not deploy, push, clean the current database, or declare production readiness while unrelated audit blockers remain.
