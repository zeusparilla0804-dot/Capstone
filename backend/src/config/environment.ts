import type { EmailWorkerSettings } from '../types/notification.types.js';

export type NodeEnvironment = 'development' | 'test' | 'production';

export function readPasswordResetConfiguration(env: NodeJS.ProcessEnv, nodeEnv: NodeEnvironment) {
  const hmacSecret = env.PASSWORD_RESET_HMAC_SECRET?.trim();

  if (!hmacSecret) {
    if (nodeEnv === 'production') {
      throw new Error('Missing required environment variable: PASSWORD_RESET_HMAC_SECRET');
    }

    return { hmacSecret: undefined, ttlMs: 900_000, cooldownMs: 60_000 };
  }

  if (Buffer.byteLength(hmacSecret, 'utf8') < 32) {
    throw new Error('PASSWORD_RESET_HMAC_SECRET must be at least 32 bytes.');
  }

  return { hmacSecret, ttlMs: 900_000, cooldownMs: 60_000 };
}

export function validEmailAddress(value: string): boolean {
  return value.length <= 320 && /^[^\s<>@,;"\\\x00-\x1f\x7f]+@[^\s<>@,;"\\\x00-\x1f\x7f]+\.[^\s<>@,;"\\\x00-\x1f\x7f]+$/.test(value);
}

export function readAdminMfaConfiguration(env: NodeJS.ProcessEnv, nodeEnv: NodeEnvironment): { key?: Buffer } {
  const value = env.ADMIN_MFA_ENCRYPTION_KEY?.trim();
  if (!value) {
    if (nodeEnv === 'production') throw new Error('Missing required environment variable: ADMIN_MFA_ENCRYPTION_KEY');
    return {};
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return { key };
}

export function readEmailConfiguration(env: NodeJS.ProcessEnv) {
  const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_ADDRESS', 'SMTP_FROM_NAME'];
  const configured = names.some(name => env[name] !== undefined);
  function integer(name: string, fallback: number, min: number, max: number): number {
    const text = env[name] ?? String(fallback);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < min || Number(text) > max) throw new Error(`${name} is invalid.`);
    return Number(text);
  }
  function boolean(name: string, fallback: boolean): boolean {
    const value = env[name];
    if (value === undefined) return fallback;
    if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false.`);
    return value === 'true';
  }
  const worker: EmailWorkerSettings = {
    enabled: boolean('EMAIL_WORKER_ENABLED', configured),
    pollIntervalMs: integer('EMAIL_WORKER_POLL_INTERVAL_MS', 5_000, 1000, 3_600_000),
    batchSize: integer('EMAIL_WORKER_BATCH_SIZE', 10, 1, 100),
    maxAttempts: integer('EMAIL_WORKER_MAX_ATTEMPTS', 5, 1, 100),
    retryBaseMs: integer('EMAIL_WORKER_RETRY_BASE_MS', 60_000, 1000, 86_400_000),
    retryCapMs: integer('EMAIL_WORKER_RETRY_CAP_MS', 3_600_000, 1000, 86_400_000),
    leaseMs: integer('EMAIL_WORKER_LEASE_MS', 300_000, 60_000, 3_600_000)
  };
  if (worker.retryBaseMs > worker.retryCapMs) throw new Error('Email retry base must not exceed its cap.');
  if (!configured) return { smtp: undefined, worker: { ...worker, enabled: false } };
  for (const name of names.slice(0, 6)) {
    if (!env[name]?.trim()) throw new Error(`Missing required SMTP configuration: ${name}`);
  }
  const host = env.SMTP_HOST!.trim();
  const address = env.SMTP_FROM_ADDRESS!.trim();
  const name = env.SMTP_FROM_NAME?.trim() ?? 'LA Chef Event Catering Services';
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !validEmailAddress(address) || !name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new Error('SMTP host or sender identity is invalid.');
  }
  return { smtp: { host, port: integer('SMTP_PORT', 587, 1, 65535), secure: boolean('SMTP_SECURE', false),
    auth: { user: env.SMTP_USER!.trim(), pass: env.SMTP_PASSWORD! }, from: { name, address } }, worker };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function booleanValue(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false.`);
  return value === 'true';
}

function positiveInteger(name: string, fallback: number, max = 65535): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be a valid positive integer.`);
  }
  return value;
}

const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnvironment;
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

const frontendUrl = required('FRONTEND_URL');
const emailVerificationSecret = (process.env.EMAIL_VERIFICATION_HMAC_SECRET ?? process.env.PASSWORD_RESET_HMAC_SECRET)?.trim();
if (emailVerificationSecret && Buffer.byteLength(emailVerificationSecret, 'utf8') < 32) {
  throw new Error('Email verification HMAC secret must be at least 32 bytes.');
}
export function readFrontendOrigin(value: string, nodeEnv: NodeEnvironment): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('FRONTEND_URL must be an absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must use HTTP or HTTPS.');
  if (nodeEnv === 'production' && url.protocol !== 'https:') throw new Error('FRONTEND_URL must use HTTPS in production.');
  if (url.username || url.password) throw new Error('FRONTEND_URL must not contain credentials.');
  return url.origin;
}
const frontendOrigin = readFrontendOrigin(frontendUrl, nodeEnv);

export const environment = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: positiveInteger('PORT', 3000),
  adminIdleMinutes: positiveInteger('ADMIN_IDLE_TIMEOUT_MINUTES', 30, 1440),
  frontendOrigin,
  paymentProofUploadRoot: required('PAYMENT_PROOF_UPLOAD_ROOT'),
  email: readEmailConfiguration(process.env),
  passwordReset: readPasswordResetConfiguration(process.env, nodeEnv),
  adminMfa: readAdminMfaConfiguration(process.env, nodeEnv),
  emailVerificationSecret,
  db: {
    server: required('DB_SERVER'),
    port: positiveInteger('DB_PORT', 1433),
    database: required('DB_DATABASE'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    encrypt: booleanValue('DB_ENCRYPT', nodeEnv === 'production'),
    trustServerCertificate: booleanValue('DB_TRUST_SERVER_CERTIFICATE', nodeEnv !== 'production')
  }
});
