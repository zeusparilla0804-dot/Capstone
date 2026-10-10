import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import {
  npmScriptInvocation,
  readFreshDatabaseConfig,
  runFreshDatabaseVerification,
  type FreshDatabaseConfig,
  type FreshDatabaseVerifierDependencies,
} from '../src/migrations/fresh-database-verifier.js';
import { assertCurrentSchema } from '../src/migrations/schema-contract.js';

const BUSINESS_TABLES = [
  'ADMIN',
  'ADMIN_AUDIT_LOG',
  'ADMIN_SESSION',
  'AUTH_SESSION',
  'CUSTOMER',
  'PACKAGE',
  'MENU_ITEM',
  'ADD_ON',
  'RESERVATION',
  'RESERVATION_ADD_ON',
  'BOOKING_STATUS_HISTORY',
  'PAYMENT',
  'PAYMENT_TRANSACTION',
  'PAYMENT_PROOF',
  'INVOICE',
  'INVOICE_ITEM',
  'NOTIFICATION',
  'EMAIL_OUTBOX',
  'PASSWORD_RESET_TOKEN',
] as const;

type BusinessTable = (typeof BUSINESS_TABLES)[number];
type RowCounts = Record<BusinessTable, number>;

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(backendRoot, 'migrations', '000_initial_schema.sql');
const config = readFreshDatabaseConfig(process.env);
const uploadRoot = await mkdtemp(path.join(tmpdir(), 'la-chef-fresh-db-'));

function connectionConfig(database: string): sql.config {
  return {
    server: config.server,
    port: config.port,
    database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
      enableArithAbort: true,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30_000 },
  };
}

function disposableIdentifier(databaseName: string): string {
  if (!/^LA_CHEF_VERIFY_[A-F0-9]{32}$/.test(databaseName)) {
    throw new Error('Refusing SQL identifier outside the disposable database allow-list.');
  }
  return `[${databaseName}]`;
}

function childEnvironment(databaseName: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://127.0.0.1:4200',
    DB_SERVER: config.server,
    DB_PORT: String(config.port),
    DB_DATABASE: databaseName,
    DB_USER: config.user,
    DB_PASSWORD: config.password,
    DB_ENCRYPT: String(config.encrypt),
    DB_TRUST_SERVER_CERTIFICATE: String(config.trustServerCertificate),
    PAYMENT_PROOF_UPLOAD_ROOT: uploadRoot,
    EMAIL_WORKER_ENABLED: 'false',
  };
  for (const name of [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM_ADDRESS',
    'SMTP_FROM_NAME',
  ]) delete environment[name];
  return environment;
}

async function runNpmScript(script: string, databaseName: string): Promise<void> {
  const invocation = npmScriptInvocation(script);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.arguments, {
      cwd: backendRoot,
      env: childEnvironment(databaseName),
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed with ${signal ? `signal ${signal}` : `exit code ${String(code)}`}.`));
    });
  });
}

async function withDatabase<T>(databaseName: string, action: (pool: sql.ConnectionPool) => Promise<T>): Promise<T> {
  const pool = await new sql.ConnectionPool(connectionConfig(databaseName)).connect();
  try {
    return await action(pool);
  } finally {
    await pool.close();
  }
}

async function businessRowCounts(pool: sql.ConnectionPool): Promise<RowCounts> {
  const columns = BUSINESS_TABLES
    .map((table) => `(SELECT COUNT_BIG(*) FROM dbo.[${table}]) AS [${table}]`)
    .join(',\n');
  const result = await pool.request().query<Record<string, number>>(`SELECT ${columns};`);
  const row = result.recordset[0];
  assert.ok(row, 'Business-row count query returned no result.');
  return Object.fromEntries(BUSINESS_TABLES.map((table) => [table, Number(row[table])])) as RowCounts;
}

async function verifyFreshSchemaAndData(databaseName: string): Promise<void> {
  await withDatabase(databaseName, async (pool) => {
    await assertCurrentSchema(pool, { migrationHistory: 'fresh' });
    const events = await pool.request().query<{ count: number }>('SELECT COUNT_BIG(*) count FROM dbo.EVENT;');
    assert.equal(Number(events.recordset[0]?.count), 5, 'Fresh provisioning must contain exactly five system event types.');
    const counts = await businessRowCounts(pool);
    for (const [table, count] of Object.entries(counts)) {
      assert.equal(count, 0, `Fresh provisioning unexpectedly populated dbo.${table}.`);
    }
  });
}

async function verifyE2eAndBaselineRerun(databaseName: string): Promise<void> {
  await runNpmScript('test:e2e', databaseName);
  await withDatabase(databaseName, async (pool) => {
    const before = await businessRowCounts(pool);
    const baseline = await readFile(baselinePath, 'utf8');
    await pool.request().batch(baseline);
    await assertCurrentSchema(pool, { migrationHistory: 'fresh' });
    const after = await businessRowCounts(pool);
    assert.deepEqual(after, before, 'Re-running the foundational migration changed business-row counts.');
  });
}

let adminPool: sql.ConnectionPool | undefined;
async function getAdminPool(): Promise<sql.ConnectionPool> {
  if (adminPool?.connected) return adminPool;
  adminPool = await new sql.ConnectionPool(connectionConfig(config.adminDatabase)).connect();
  return adminPool;
}

const dependencies: FreshDatabaseVerifierDependencies = {
  async createDatabase(databaseName) {
    const identifier = disposableIdentifier(databaseName);
    const pool = await getAdminPool();
    const existing = await pool.request().input('databaseName', sql.NVarChar(128), databaseName)
      .query('SELECT DB_ID(@databaseName) databaseId;');
    assert.equal(existing.recordset[0]?.databaseId, null, 'Generated disposable database already exists.');
    await pool.request().query(`CREATE DATABASE ${identifier};`);
  },
  async runMigrations(databaseName) {
    await runNpmScript('db:migrate', databaseName);
  },
  async verifySchemaAndData(databaseName) {
    await verifyFreshSchemaAndData(databaseName);
  },
  async runEndToEndVerification(databaseName) {
    await verifyE2eAndBaselineRerun(databaseName);
  },
  async dropDatabase(databaseName) {
    const identifier = disposableIdentifier(databaseName);
    const pool = await getAdminPool();
    await pool.request().input('databaseName', sql.NVarChar(128), databaseName).query(`
      IF DB_ID(@databaseName) IS NOT NULL
      BEGIN
        ALTER DATABASE ${identifier} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE ${identifier};
      END;
    `);
  },
};

try {
  await runFreshDatabaseVerification(config, dependencies);
  console.log('Fresh disposable database verification passed and cleanup completed.');
} finally {
  if (adminPool) await adminPool.close();
  await rm(uploadRoot, { recursive: true, force: true });
}
