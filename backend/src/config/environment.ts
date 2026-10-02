import type { EmailWorkerSettings } from '../types/notification.types.js';

type NodeEnvironment = 'development' | 'test' | 'production';

export function validEmailAddress(value: string): boolean {
  return value.length <= 320 && /^[^\s<>@,;"\\\x00-\x1f\x7f]+@[^\s<>@,;"\\\x00-\x1f\x7f]+\.[^\s<>@,;"\\\x00-\x1f\x7f]+$/.test(value);
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
    pollIntervalMs: integer('EMAIL_WORKER_POLL_INTERVAL_MS', 30_000, 1000, 3_600_000),
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

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid positive integer.`);
  }
  return value;
}

const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnvironment;
if (!['development', 'test', 'production'].includes(nodeEnv)) {
  throw new Error('NODE_ENV must be development, test, or production.');
}

const frontendUrl = required('FRONTEND_URL');
let frontendOrigin: string;
try {
  frontendOrigin = new URL(frontendUrl).origin;
} catch {
  throw new Error('FRONTEND_URL must be an absolute URL.');
}

export const environment = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: positiveInteger('PORT', 3000),
  frontendOrigin,
  paymentProofUploadRoot: required('PAYMENT_PROOF_UPLOAD_ROOT'),
  email: readEmailConfiguration(process.env),
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
