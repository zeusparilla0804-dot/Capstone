import { randomUUID } from 'node:crypto';

const DISPOSABLE_DATABASE_PATTERN = /^LA_CHEF_VERIFY_[A-F0-9]{32}$/;

export interface FreshDatabaseConfig {
  nodeEnv: string;
  applicationDatabase: string;
  databaseName: string;
  server: string;
  port: number;
  adminDatabase: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  confirmedDisposable: boolean;
}

export interface FreshDatabaseVerifierDependencies {
  createDatabase(databaseName: string): Promise<void>;
  runMigrations(databaseName: string): Promise<void>;
  verifySchemaAndData(databaseName: string): Promise<void>;
  runEndToEndVerification(databaseName: string): Promise<void>;
  dropDatabase(databaseName: string): Promise<void>;
}

export interface NpmScriptInvocation {
  executable: string;
  arguments: string[];
}

export function npmScriptInvocation(
  script: string,
  platform = process.platform,
  comSpec = process.env.ComSpec,
): NpmScriptInvocation {
  if (!/^[a-z0-9][a-z0-9:-]*$/i.test(script)) throw new Error('Invalid npm script name.');
  if (platform === 'win32') {
    return {
      executable: comSpec?.trim() || 'cmd.exe',
      arguments: ['/d', '/s', '/c', `npm.cmd run ${script}`],
    };
  }
  return { executable: 'npm', arguments: ['run', script] };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required fresh-database verification variable: ${name}.`);
  return value;
}

function strictBoolean(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = required(env, name);
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false.`);
  return value === 'true';
}

function port(env: NodeJS.ProcessEnv): number {
  const text = required(env, 'VERIFY_DB_PORT');
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new Error('VERIFY_DB_PORT must be an integer from 1 through 65535.');
  }
  return value;
}

export function createDisposableDatabaseName(uuid = randomUUID()): string {
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid)) {
    throw new Error('A valid UUID is required to create a disposable database name.');
  }
  return `LA_CHEF_VERIFY_${uuid.replaceAll('-', '').toUpperCase()}`;
}

export function readFreshDatabaseConfig(env: NodeJS.ProcessEnv): FreshDatabaseConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  if (nodeEnv === 'production') throw new Error('Fresh-database verification is disabled in production.');
  if (env.VERIFY_DB_CONFIRM_DISPOSABLE !== 'true') {
    throw new Error('VERIFY_DB_CONFIRM_DISPOSABLE must be exactly true.');
  }

  return {
    nodeEnv,
    applicationDatabase: required(env, 'DB_DATABASE'),
    databaseName: createDisposableDatabaseName(),
    server: required(env, 'VERIFY_DB_SERVER'),
    port: port(env),
    adminDatabase: required(env, 'VERIFY_DB_ADMIN_DATABASE'),
    user: required(env, 'VERIFY_DB_USER'),
    password: required(env, 'VERIFY_DB_PASSWORD'),
    encrypt: strictBoolean(env, 'VERIFY_DB_ENCRYPT'),
    trustServerCertificate: strictBoolean(env, 'VERIFY_DB_TRUST_SERVER_CERTIFICATE'),
    confirmedDisposable: true,
  };
}

function assertSafeConfig(config: FreshDatabaseConfig): void {
  if (config.nodeEnv === 'production') throw new Error('Fresh-database verification is disabled in production.');
  if (!config.confirmedDisposable) throw new Error('Disposable database confirmation is required.');
  if (!DISPOSABLE_DATABASE_PATTERN.test(config.databaseName)) {
    throw new Error('The generated database name is outside the disposable allow-list.');
  }
  if (config.databaseName.toLowerCase() === config.applicationDatabase.trim().toLowerCase()) {
    throw new Error('The disposable database name must not equal the configured application database name.');
  }
}

export async function runFreshDatabaseVerification(
  config: FreshDatabaseConfig,
  dependencies: FreshDatabaseVerifierDependencies,
): Promise<void> {
  assertSafeConfig(config);

  let databaseCreated = false;
  let verificationError: unknown;
  try {
    await dependencies.createDatabase(config.databaseName);
    databaseCreated = true;
    await dependencies.runMigrations(config.databaseName);
    await dependencies.runMigrations(config.databaseName);
    await dependencies.verifySchemaAndData(config.databaseName);
    await dependencies.runEndToEndVerification(config.databaseName);
  } catch (error) {
    verificationError = error;
    throw error;
  } finally {
    if (databaseCreated) {
      try {
        await dependencies.dropDatabase(config.databaseName);
      } catch (cleanupError) {
        if (verificationError === undefined) throw cleanupError;
      }
    }
  }
}
