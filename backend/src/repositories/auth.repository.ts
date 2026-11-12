import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { AuthenticatedAdmin, AuthenticatedCustomer } from '../types/domain.types.js';
import type { QueueNotificationInput } from '../types/notification.types.js';
import { environment } from '../config/environment.js';
import { AppError } from '../utils/app-error.js';

export async function customerEmailExists(email: string): Promise<boolean> {
  const pool = await getDbPool();
  const result = await pool.request().input('email', sql.NVarChar(255), email)
    .query('SELECT customer_id FROM dbo.CUSTOMER WHERE email=@email');
  return Boolean(result.recordset[0]);
}

export async function findCustomerCredentials(email: string) {
  const pool = await getDbPool();
  const result = await pool.request().input('email', sql.NVarChar(255), email).query(`SELECT customer_id, first_name, last_name, email, contact_number, password,requires_email_verification,verified_email FROM dbo.CUSTOMER WHERE email = @email AND status='ACTIVE'`);
  return result.recordset[0];
}

export async function updateCustomerPhone(customerId: number, phone: string): Promise<AuthenticatedCustomer | undefined> {
  const pool = await getDbPool();
  const result = await pool.request()
    .input('customerId', sql.Int, customerId)
    .input('phone', sql.NVarChar(30), phone)
    .query(`UPDATE dbo.CUSTOMER SET contact_number=@phone
      OUTPUT INSERTED.customer_id,INSERTED.first_name,INSERTED.last_name,INSERTED.email,INSERTED.contact_number
      WHERE customer_id=@customerId AND status='ACTIVE'`);
  const row = result.recordset[0];
  return row ? { id: Number(row.customer_id), fullName: `${row.first_name} ${row.last_name}`, email: row.email, phone: row.contact_number, role: 'customer' } : undefined;
}
type RegistrationNotificationQueue = (input: QueueNotificationInput, request: sql.Request) => Promise<string>;

export async function createCustomer(
  input: { firstName: string; lastName: string; email: string; phone: string; passwordHash: string },
  queueNotification: RegistrationNotificationQueue,
  issueVerification: (email: string, request: sql.Request, queue: RegistrationNotificationQueue) => Promise<void>
): Promise<number> {
  const pool = await getDbPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const result = await request.input('firstName', sql.NVarChar(100), input.firstName)
      .input('lastName', sql.NVarChar(100), input.lastName)
      .input('email', sql.NVarChar(255), input.email)
      .input('phone', sql.NVarChar(30), input.phone)
      .input('password', sql.NVarChar(255), input.passwordHash)
      .query(`INSERT dbo.CUSTOMER(first_name,last_name,email,contact_number,password,requires_email_verification)
        OUTPUT INSERTED.customer_id VALUES(@firstName,@lastName,@email,@phone,@password,1)`);
    const customerId = Number(result.recordset[0].customer_id);
    await issueVerification(input.email, request, queueNotification);
    await transaction.commit();
    return customerId;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original error. */ }
    throw error;
  }
}
export async function createSession(customerId: number, tokenHash: string, expiresAt: Date, expectedPasswordHash?: string, request?: sql.Request): Promise<void> {
  const result = await (request ?? (await getDbPool()).request()).input('customerId', sql.Int, customerId)
    .input('tokenHash', sql.Char(64), tokenHash).input('expiresAt', sql.DateTime2, expiresAt)
    .input('expectedPasswordHash', sql.NVarChar(255), expectedPasswordHash ?? null)
    .query(`INSERT dbo.AUTH_SESSION(customer_id,token_hash,expires_at)
      SELECT customer_id,@tokenHash,@expiresAt FROM dbo.CUSTOMER WITH(UPDLOCK,HOLDLOCK)
      WHERE customer_id=@customerId AND status='ACTIVE' AND (requires_email_verification=0 OR verified_email=email)
        AND (@expectedPasswordHash IS NULL OR password=@expectedPasswordHash)`);
  if ((result.rowsAffected[0] ?? 0) !== 1) throw new AppError(401, 'Invalid email or password.');
}
export async function findCustomerBySession(tokenHash: string, request?: sql.Request): Promise<AuthenticatedCustomer | undefined> {
  const result = await (request ?? (await getDbPool()).request()).input('tokenHash', sql.Char(64), tokenHash).query(`SELECT c.customer_id,c.first_name,c.last_name,c.email,c.contact_number FROM dbo.AUTH_SESSION s JOIN dbo.CUSTOMER c ON c.customer_id=s.customer_id WHERE s.token_hash=@tokenHash AND s.expires_at>SYSUTCDATETIME() AND c.status='ACTIVE' AND (c.requires_email_verification=0 OR c.verified_email=c.email)`);
  const row = result.recordset[0];
  return row ? { id: Number(row.customer_id), fullName: `${row.first_name} ${row.last_name}`, email: row.email, phone: row.contact_number, role: 'customer' } : undefined;
}
export async function deleteSession(tokenHash: string): Promise<void> {
  const pool = await getDbPool();
  await pool.request().input('tokenHash', sql.Char(64), tokenHash).query('DELETE dbo.AUTH_SESSION WHERE token_hash=@tokenHash');
}
export async function deleteCustomerSessions(customerId: number): Promise<void> {
  const pool = await getDbPool();
  await pool.request().input('customerId', sql.Int, customerId)
    .query('DELETE dbo.AUTH_SESSION WHERE customer_id=@customerId');
}
export async function findAdminCredentials(identity:string){const pool=await getDbPool();const result=await pool.request().input('identity',sql.NVarChar(255),identity).query(`SELECT admin_id,full_name,email,password FROM dbo.ADMIN WHERE (email=@identity OR username=@identity) AND status='ACTIVE'`);return result.recordset[0];}
export async function createAdminSession(adminId: number, tokenHash: string, expiresAt: Date, expectedPasswordHash?: string, request?: sql.Request): Promise<void> {
  const result = await (request ?? (await getDbPool()).request()).input('adminId', sql.Int, adminId)
    .input('tokenHash', sql.Char(64), tokenHash).input('expiresAt', sql.DateTime2, expiresAt)
    .input('expectedPasswordHash', sql.NVarChar(255), expectedPasswordHash ?? null)
    .query(`INSERT dbo.ADMIN_SESSION(admin_id,token_hash,expires_at)
      SELECT admin_id,@tokenHash,@expiresAt FROM dbo.ADMIN WITH(UPDLOCK,HOLDLOCK)
      WHERE admin_id=@adminId AND status='ACTIVE' AND (@expectedPasswordHash IS NULL OR password=@expectedPasswordHash)`);
  if ((result.rowsAffected[0] ?? 0) !== 1) throw new AppError(401, 'Invalid administrator credentials.');
}
export async function findAdminBySession(tokenHash: string, request?: sql.Request, renewActivity = true): Promise<AuthenticatedAdmin | undefined> {
  // One atomic conditional update: idle sessions can never be refreshed back into validity.
  // Avoid referencing the migration table in development installations where MFA is disabled.
  const mfaCondition = environment.adminMfa.key
    ? 'AND EXISTS(SELECT 1 FROM dbo.ADMIN_MFA m WHERE m.admin_id=a.admin_id AND m.enabled=1)'
    : '';
  const result = await (request ?? (await getDbPool()).request()).input('tokenHash', sql.Char(64), tokenHash)
    .input('idleMinutes', sql.Int, environment.adminIdleMinutes)
    .query(`${renewActivity ? 'UPDATE s SET last_seen_at=SYSUTCDATETIME() OUTPUT INSERTED.admin_id,a.full_name,a.email'
      : 'SELECT s.admin_id,a.full_name,a.email'}
      FROM dbo.ADMIN_SESSION s JOIN dbo.ADMIN a ON a.admin_id=s.admin_id
      WHERE s.token_hash=@tokenHash AND s.expires_at>SYSUTCDATETIME() AND a.status='ACTIVE'
        ${mfaCondition}
        AND s.last_seen_at>DATEADD(minute,-@idleMinutes,SYSUTCDATETIME())`);
  const row = result.recordset[0];
  return row ? { id: Number(row.admin_id), fullName: row.full_name, email: row.email, role: 'admin' } : undefined;
}
export async function deleteAdminSession(tokenHash:string){const pool=await getDbPool();await pool.request().input('tokenHash',sql.Char(64),tokenHash).query('DELETE dbo.ADMIN_SESSION WHERE token_hash=@tokenHash');}
export async function deleteAdminSessions(adminId: number): Promise<void> {
  const pool = await getDbPool();
  await pool.request().input('adminId', sql.Int, adminId)
    .query('DELETE dbo.ADMIN_SESSION WHERE admin_id=@adminId');
}
export async function deleteExpiredSessions(): Promise<{ customers: number; administrators: number }> {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    DELETE dbo.AUTH_LOGIN_ATTEMPT WHERE window_started_at<=DATEADD(day,-1,SYSUTCDATETIME())
      AND (blocked_until IS NULL OR blocked_until<=SYSUTCDATETIME());
    DECLARE @customers int;
    DELETE dbo.AUTH_SESSION WHERE expires_at<=SYSUTCDATETIME();
    SET @customers=@@ROWCOUNT;
    DELETE dbo.ADMIN_SESSION WHERE expires_at<=SYSUTCDATETIME();
    SELECT @customers AS customers, @@ROWCOUNT AS administrators;
  `);
  const row = result.recordset[0] ?? {};
  return { customers: Number(row.customers ?? 0), administrators: Number(row.administrators ?? 0) };
}
