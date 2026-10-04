# LA Chef Catering Management System

LA Chef is an Angular customer/admin application backed by an Express API and Microsoft SQL Server 2022. Runtime business data comes from SQL Server; the repository does not seed fake customers, bookings, payments, or invoices.

## Requirements

- Node.js 22.22.3 or newer supported by Angular 22
- npm 10 or newer
- Microsoft SQL Server 2022
- A SQL login with access to the application database and permission to run reviewed migrations

The frontend uses Angular 22.2 with standalone components, Angular Router, Reactive Forms, HttpClient, and signals.

## Backend

1. Run `npm install` in `backend/`.
2. Create `backend/.env` from `backend/.env.example` and provide real local values. Never commit this file.
3. Create the SQL Server database and its original baseline tables.
4. Back up the database, then run `npm run db:migrate`. It records each applied script in `dbo.SCHEMA_MIGRATION` and applies files from `backend/migrations/` in numeric order.
5. Run `npm run dev` for development, or `npm run build` followed by `npm start` for production.
6. Create the initial administrator with temporary `ADMIN_*` variables and `npm run admin:create`; remove those variables afterward.

Required production values are `NODE_ENV=production`, `PORT`, `FRONTEND_URL`, `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_ENCRYPT=true`, and normally `DB_TRUST_SERVER_CERTIFICATE=false`. Startup fails when required configuration is absent. Store secrets in the deployment platform's secret store.

## Frontend

Run `npm install` and `npm start` in `frontend/` for development. Run `npm run build` for the optimized production output in `frontend/dist/`.

Development uses `http://localhost:3000/api`. Production uses same-origin `/api`, allowing a reverse proxy to serve Angular at `/` and forward `/api/` to Express. For a separate API origin, update the production Angular environment at build time and set `FRONTEND_URL` to the exact HTTPS frontend origin.

## Production Operations

Terminate TLS at the hosting platform or reverse proxy and forward the original protocol. Express trusts one production proxy hop so secure cookies work correctly. Restrict SQL Server network access to the API host and use a least-privilege login.

Before migrations, take a SQL Server full backup using the organization's encrypted backup destination and retention policy. Record the backup identifier, run `RESTORE VERIFYONLY`, and periodically test restoring to non-production. Never place credentials or backups in this repository.

Deploy migrations once before starting the new API version. Do not run destructive reset or sample-data scripts in production. Monitor `/api/health` for liveness and `/api/health/database` for minimal dependency health; neither exposes connection details.

## Verification

- Backend: `npm test` then `npm run build`
- Frontend: `npm test -- --watch=false` then `npm run build`
- Manually verify customer and admin flows over HTTPS, including ownership denial, logout, invalid identifiers, overpayment rejection, duplicate payment-reference rejection, and persistence after an API restart.

SQL-backed end-to-end checks require a configured disposable test database. Do not run mutation tests against production.

Run backend `npm run test:e2e` only against a development/test database; it creates uniquely tagged records, verifies customer/admin/security flows, reconnects to prove persistence, and removes those records. Production deployment and responsive-browser procedures are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/RESPONSIVE_QA.md](docs/RESPONSIVE_QA.md).
