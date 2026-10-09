import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDisposableDatabaseName,
  npmScriptInvocation,
  readFreshDatabaseConfig,
  runFreshDatabaseVerification,
  type FreshDatabaseConfig,
  type FreshDatabaseVerifierDependencies,
} from './fresh-database-verifier.js';

const validEnvironment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  DB_DATABASE: 'LaChef',
  VERIFY_DB_SERVER: 'localhost',
  VERIFY_DB_PORT: '1433',
  VERIFY_DB_ADMIN_DATABASE: 'master',
  VERIFY_DB_USER: 'verification_user',
  VERIFY_DB_PASSWORD: 'placeholder-secret',
  VERIFY_DB_ENCRYPT: 'false',
  VERIFY_DB_TRUST_SERVER_CERTIFICATE: 'true',
  VERIFY_DB_CONFIRM_DISPOSABLE: 'true',
});

function validConfig(overrides: Partial<FreshDatabaseConfig> = {}): FreshDatabaseConfig {
  return {
    nodeEnv: 'test',
    applicationDatabase: 'LaChef',
    databaseName: 'LA_CHEF_VERIFY_0123456789ABCDEF0123456789ABCDEF',
    server: 'localhost',
    port: 1433,
    adminDatabase: 'master',
    user: 'verification_user',
    password: 'placeholder-secret',
    encrypt: false,
    trustServerCertificate: true,
    confirmedDisposable: true,
    ...overrides,
  };
}

function recordingDependencies(events: string[]): FreshDatabaseVerifierDependencies {
  return {
    createDatabase: async () => { events.push('create'); },
    runMigrations: async () => { events.push('migrate'); },
    verifySchemaAndData: async () => { events.push('contract-and-data-check'); },
    runEndToEndVerification: async () => { events.push('e2e'); },
    dropDatabase: async () => { events.push('drop'); },
  };
}

test('rejects production before connecting', async () => {
  const env = validEnvironment();
  env.NODE_ENV = 'production';
  assert.throws(() => readFreshDatabaseConfig(env), /disabled in production/i);

  const events: string[] = [];
  await assert.rejects(
    runFreshDatabaseVerification(validConfig({ nodeEnv: 'production' }), recordingDependencies(events)),
    /disabled in production/i,
  );
  assert.deepEqual(events, []);
});

test('requires VERIFY_DB_CONFIRM_DISPOSABLE=true', () => {
  for (const confirmation of [undefined, 'false', 'TRUE', 'yes']) {
    const env = validEnvironment();
    if (confirmation === undefined) delete env.VERIFY_DB_CONFIRM_DISPOSABLE;
    else env.VERIFY_DB_CONFIRM_DISPOSABLE = confirmation;
    assert.throws(() => readFreshDatabaseConfig(env), /VERIFY_DB_CONFIRM_DISPOSABLE must be exactly true/);
  }
});

test('requires every verifier credential and a valid port/boolean', () => {
  for (const name of [
    'DB_DATABASE',
    'VERIFY_DB_SERVER',
    'VERIFY_DB_PORT',
    'VERIFY_DB_ADMIN_DATABASE',
    'VERIFY_DB_USER',
    'VERIFY_DB_PASSWORD',
    'VERIFY_DB_ENCRYPT',
    'VERIFY_DB_TRUST_SERVER_CERTIFICATE',
  ]) {
    const env = validEnvironment();
    delete env[name];
    assert.throws(() => readFreshDatabaseConfig(env), new RegExp(name));
  }

  for (const port of ['0', '65536', '1433.5', 'not-a-port']) {
    assert.throws(() => readFreshDatabaseConfig({ ...validEnvironment(), VERIFY_DB_PORT: port }), /VERIFY_DB_PORT/);
  }
  for (const name of ['VERIFY_DB_ENCRYPT', 'VERIFY_DB_TRUST_SERVER_CERTIFICATE']) {
    assert.throws(() => readFreshDatabaseConfig({ ...validEnvironment(), [name]: '1' }), new RegExp(name));
  }
});

test('generates only LA_CHEF_VERIFY_<hex> database names', () => {
  const name = createDisposableDatabaseName('12345678-90ab-cdef-1234-567890abcdef');
  assert.equal(name, 'LA_CHEF_VERIFY_1234567890ABCDEF1234567890ABCDEF');
  assert.match(createDisposableDatabaseName(), /^LA_CHEF_VERIFY_[A-F0-9]{32}$/);
  assert.throws(() => createDisposableDatabaseName('not-a-uuid'), /valid UUID/i);
});

test('uses ComSpec for npm scripts on Windows and direct npm elsewhere', () => {
  assert.deepEqual(npmScriptInvocation('db:migrate', 'win32', 'C:\\Windows\\System32\\cmd.exe'), {
    executable: 'C:\\Windows\\System32\\cmd.exe',
    arguments: ['/d', '/s', '/c', 'npm.cmd run db:migrate'],
  });
  assert.deepEqual(npmScriptInvocation('test:e2e', 'linux'), {
    executable: 'npm',
    arguments: ['run', 'test:e2e'],
  });
  assert.throws(() => npmScriptInvocation('db:migrate & whoami', 'win32'), /npm script name/i);
});

test('rejects an unsafe database name or the configured DB_DATABASE', async () => {
  for (const databaseName of ['LaChef', 'LA_CHEF_VERIFY_BAD]; DROP DATABASE LaChef;--']) {
    const events: string[] = [];
    await assert.rejects(
      runFreshDatabaseVerification(validConfig({ databaseName }), recordingDependencies(events)),
      /database name/i,
    );
    assert.deepEqual(events, []);
  }
});

test('runs create migrate migrate-again contract-and-data-check e2e drop in order', async () => {
  const events: string[] = [];
  await runFreshDatabaseVerification(validConfig(), recordingDependencies(events));
  assert.deepEqual(events, ['create', 'migrate', 'migrate', 'contract-and-data-check', 'e2e', 'drop']);
});

test('drops the database when migration contract or e2e fails', async () => {
  for (const failingStep of ['migrate', 'contract-and-data-check', 'e2e']) {
    const events: string[] = [];
    const dependencies = recordingDependencies(events);
    const original = dependencies[
      failingStep === 'migrate'
        ? 'runMigrations'
        : failingStep === 'contract-and-data-check'
          ? 'verifySchemaAndData'
          : 'runEndToEndVerification'
    ];
    let calls = 0;
    const failure = new Error(`${failingStep} failed`);
    const replacement = async (databaseName: string) => {
      calls += 1;
      await original(databaseName);
      if (failingStep !== 'migrate' || calls === 1) throw failure;
    };
    if (failingStep === 'migrate') dependencies.runMigrations = replacement;
    else if (failingStep === 'contract-and-data-check') dependencies.verifySchemaAndData = replacement;
    else dependencies.runEndToEndVerification = replacement;

    await assert.rejects(runFreshDatabaseVerification(validConfig(), dependencies), failure);
    assert.equal(events.at(-1), 'drop');
  }
});

test('preserves the original verification error when cleanup also fails', async () => {
  const verificationFailure = new Error('migration failed');
  const cleanupFailure = new Error('drop failed');
  const dependencies = recordingDependencies([]);
  dependencies.runMigrations = async () => { throw verificationFailure; };
  dependencies.dropDatabase = async () => { throw cleanupFailure; };

  await assert.rejects(runFreshDatabaseVerification(validConfig(), dependencies), (error) => {
    assert.equal(error, verificationFailure);
    return true;
  });
});
