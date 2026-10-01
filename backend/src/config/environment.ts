type NodeEnvironment = 'development' | 'test' | 'production';

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
