# LA Chef Empty-Database Baseline Design

## Status

The architecture, deployment-safety, and verification approach was approved on October 9, 2026. This specification is ready for user review before implementation planning.

## Objective

Make the LA Chef SQL Server database reproducible from an empty database without depending on an undocumented backup, an existing workstation database, or provisional business data. A fresh environment must be able to run the repository migrations in order and produce the schema required by the current backend.

The baseline must be safe for local, staging, production, and recovery provisioning. It must not contain customer records, administrator credentials, packages, bookings, payments, proofs, or other environment-specific business data.

## Current Problem

The tracked migration chain begins with `001_phase5_data_layer.sql`, but that migration alters foundational tables that it does not create. The repository therefore cannot provision an empty SQL Server database.

The live database migration history also records `007_starter_catalog.sql`, while no matching tracked migration exists in `backend/migrations`. That historical file must not be reconstructed from guesses or replaced with sample catalog data. The migration runner already supports a numeric gap, so a new environment may correctly apply `006` and then `008` without recording `007`.

## Selected Approach

Add `backend/migrations/000_initial_schema.sql` as a schema-only foundation. It creates the tables, relationships, constraints, defaults, and indexes that existed before migration `001`. The existing migrations remain the source of truth for all later schema changes and continue to run normally.

This approach preserves the real upgrade path, keeps every schema change reviewable as SQL, and avoids falsely marking migrations as applied. A consolidated current-schema dump or database backup will not replace the migration chain.

## Baseline Schema Boundary

Migration `000` creates only the foundational versions of:

- `CUSTOMER`
- `ADMIN`
- `EVENT`
- `PACKAGE`
- `MENU_ITEM`
- `RESERVATION`
- `PAYMENT`
- `NOTIFICATION`

The definitions must match the preconditions expected by migration `001`. Columns, names, types, nullability, identity properties, primary keys, unique constraints, foreign keys, checks, defaults, and supporting indexes must be derived from the current verified schema and the transformations in migrations `001` through `010`.

Migration `000` must not pre-create objects owned by later migrations. This includes session, audit, invoice, outbox, status-history, payment-proof, transaction, reservation-add-on, add-on, and migration-history objects, as well as the invoice number sequence and indexes introduced after the foundational schema.

The migration runner remains responsible for creating `dbo.SCHEMA_MIGRATION` before it discovers and applies migration files.

## Data Policy

Migration `000` contains no `INSERT` statements for business or identity data. In particular, it must not create:

- Administrator accounts or password hashes
- Customer accounts
- Packages or menu items
- Reservations or status history
- Payments, invoices, transactions, or payment proofs
- Notifications, email outbox messages, or audit records
- Provisional client catalog content

Migration `006_phase81_system_event_types.sql` remains responsible for its five fixed reference event types: Wedding, Birthday, Corporate, Debut, and Anniversary. These are system reference values, not sample business records.

The first administrator is created after migration by running the existing `npm run admin:create` workflow with deployment-specific input. Credentials are never stored in migrations, documentation, source code, or safe environment templates.

Real packages and catalog content will be introduced only from client-approved information through a separately reviewed import or migration. The missing historical `007_starter_catalog.sql` remains absent and is documented as an intentional gap.

## Fresh-Database Provisioning Flow

1. Create an empty SQL Server database with a least-privilege deployment identity.
2. Configure backend environment variables through the deployment platform's secret store.
3. Build the backend.
4. Run `npm run db:migrate:prod` as a controlled deployment step.
5. Confirm that migrations `000` through `006` and `008` through `010` are recorded successfully.
6. Start the backend only after migration succeeds.
7. Create the initial administrator through the secure admin-creation command when provisioning a new environment.
8. Load client-approved catalog content separately when available.

The public website domain and API subdomain do not receive database credentials. The Angular application communicates with the Express API, and only the backend connects to SQL Server.

## Migration Behavior And Failure Handling

The existing migration runner continues to sort tracked migration filenames and apply each unapplied file inside its own transaction. The new `000` filename sorts before `001`.

If any migration fails:

- Its transaction is rolled back.
- Its filename is not added to `SCHEMA_MIGRATION`.
- The migration command exits unsuccessfully.
- Deployment must stop before the new backend process is promoted.

Running the migration command again against an already migrated database must apply nothing and exit successfully. The implementation must not insert a synthetic `007` history row or mark any migration as applied without executing its tracked SQL file.

## Existing Database Compatibility

Existing databases already contain the foundational tables. Because their migration history does not contain `000_initial_schema.sql`, the baseline must use guarded `IF OBJECT_ID(...) IS NULL` creation blocks so it can be introduced without replacing or deleting existing objects.

After the creation blocks, migration `000` validates the foundational contract it owns by querying SQL Server metadata. Missing or incompatible required columns, types, nullability, identity properties, keys, relationships, checks, defaults, or indexes cause a descriptive SQL `THROW`. The surrounding migration transaction then rolls back, so `000` is not recorded as applied.

For a compatible existing database, running the updated migration chain records `000` after validation succeeds. The baseline must not alter populated tables, overwrite constraints, reseed identities, or insert rows. Later migrations remain skipped according to their existing migration-history records.

Before production rollout, the implementation must compare the required foundational shape with the target database and fail with a clear diagnostic if a required existing object is structurally incompatible. It must not silently repair an unknown production schema through destructive changes.

## Sample-Data Cleanup Boundary

Cleaning the current database is not part of baseline implementation. Baseline deployment must never delete data automatically.

A later cleanup task will:

1. Create and verify a database backup.
2. Produce a read-only report of suspected sample records and their dependencies.
3. Distinguish provisional data from approved client catalog and real operational records.
4. Obtain explicit confirmation for the exact records to remove.
5. Delete confirmed sample records transactionally in dependency-safe order.
6. Re-run integrity and application-flow verification.

Customer, administrator, reservation, payment, and proof records require explicit review even when they appear to be test data.

## Verification Tooling

Add an isolated fresh-database verification command for development and CI-capable environments. It must use a disposable database name, require an explicit non-production test configuration, and reject execution when pointed at the configured application database or a production environment.

The verifier performs the following sequence:

1. Create a disposable empty database.
2. Run the complete tracked migration chain.
3. Run the migration chain a second time to verify repeat safety.
4. Assert the required tables, columns, keys, constraints, indexes, and sequence.
5. Run applicable SQL-backed integration tests against the disposable database.
6. Drop the disposable database in a `finally` cleanup path whether verification succeeds or fails.

Database creation and deletion permissions are needed only by this verifier or deployment operator, not by the runtime application identity.

## Schema Contract Verification

The schema contract must cover all backend-required objects after the complete migration chain, including:

- Core and later-added tables
- Primary, unique, foreign-key, and check constraints
- Required defaults and nullability
- Query-supporting indexes used by authentication, booking, capacity, payment, invoice, audit, and outbox flows
- `dbo.INVOICE_NUMBER_SEQUENCE`
- Complete expected migration history, excluding the intentionally absent `007`

Assertions should check stable object contracts rather than environment-generated constraint identifiers. A mismatch must identify the missing or incompatible object clearly.

## Testing Strategy

### Migration Tests

- An empty database applies every tracked migration successfully.
- A second migration run applies no files and succeeds.
- Migration history includes `000` through `006` and `008` through `010` in filename order.
- Migration history does not contain a fabricated `007` entry.
- No administrator, customer, package, menu, reservation, or payment row is created by the baseline.
- The five system event types exist once after the full chain.

### Compatibility Tests

- Applying the new baseline to the existing development schema does not change or delete business rows.
- An incompatible pre-existing foundational object causes a clear failure before unsafe deployment.
- The existing migration runner continues to roll back and omit history records for failed migrations.

### Application Verification

- Backend build and automated tests pass.
- SQL-backed end-to-end tests pass against the fresh migrated database.
- Backend startup and health checks succeed against the fresh migrated database.
- Angular production build and non-watch tests pass to detect cross-project regressions.

### Deployment Verification

- Staging is provisioned from an empty database using only tracked repository files and secret configuration.
- The backend does not start if migrations fail.
- Runtime database credentials cannot create or drop databases.
- No database secret is present in frontend bundles, tracked environment files, or logs.

## Documentation Changes

Update deployment and release documentation to:

- Replace the current pre-baselined-database limitation with the new fresh-provisioning procedure.
- Document the intentional absence of historical migration `007`.
- Separate schema provisioning, initial administrator creation, and approved catalog loading.
- Document backup and restore expectations without treating a backup as the schema source of truth.
- Record the fresh-database verification command and its safety guardrails.

## Security Requirements

- All real credentials remain in environment-specific secret storage.
- Example environment files contain placeholders only.
- The baseline and verification tooling must not print passwords, connection strings, tokens, or row contents.
- Migration and verification SQL remains parameterized where runtime values are required.
- The disposable-database verifier refuses production configuration and uses a recognizable test-only name.
- No frontend code receives direct database access.

## Out Of Scope

- Removing records from the current development or production database
- Reconstructing or committing the missing provisional `007_starter_catalog.sql`
- Loading unapproved client packages, prices, menus, images, or add-ons
- Changing booking, payment, authentication, capacity, or admin business rules
- Changing API routes, Angular routing, or user-interface behavior
- Deploying the application or purchasing/configuring a domain
- Replacing operational SQL Server backups and restore drills

## Completion Definition

The work is complete when a disposable empty SQL Server database can be provisioned exclusively from tracked repository files, the full migration chain and application tests pass, rerunning migrations is safe, no mock business or credential data is introduced, existing databases remain non-destructively compatible, the missing `007` is documented honestly, and staging deployment instructions no longer depend on an undocumented pre-existing schema.
