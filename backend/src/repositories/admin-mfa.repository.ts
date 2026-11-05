import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { createAdminSession } from './auth.repository.js';
import { clearLoginAttempts } from './login-security.repository.js';
import { AppError } from '../utils/app-error.js';
import { createSessionToken, hashSessionToken } from '../utils/session.js';
import { decryptSecret, encryptSecret, newRecoveryCodes, newTotpSecret, recoveryCodeHash, verifyTotp } from '../utils/admin-mfa.js';
import { digest } from '../services/login-security.service.js';

const invalid = () => new AppError(401, 'Invalid or expired administrator verification code.');

export async function beginAdminMfa(adminId: number, passwordHash: string, email: string, key: Buffer) {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const admin = await new sql.Request(transaction).input('id', sql.Int, adminId)
      .query("SELECT password FROM dbo.ADMIN WITH(UPDLOCK,HOLDLOCK) WHERE admin_id=@id AND status='ACTIVE'");
    if (admin.recordset[0]?.password !== passwordHash) throw invalid();
    const existing = await new sql.Request(transaction).input('id', sql.Int, adminId)
      .query('SELECT secret_ciphertext,enabled FROM dbo.ADMIN_MFA WITH(UPDLOCK,HOLDLOCK) WHERE admin_id=@id');
    const enabled = Boolean(existing.recordset[0]?.enabled);
    const secret = enabled ? undefined : newTotpSecret();
    const challenge = createSessionToken();
    await new sql.Request(transaction).input('id', sql.Int, adminId)
      .input('secret', sql.VarBinary(128), secret ? encryptSecret(secret, key) : null)
      .input('hash', sql.Char(64), hashSessionToken(challenge))
      .input('password', sql.NVarChar(255), passwordHash)
      .input('expiry', sql.DateTime2, new Date(Date.now() + 5 * 60_000))
      .query(`IF EXISTS(SELECT 1 FROM dbo.ADMIN_MFA WHERE admin_id=@id)
        UPDATE dbo.ADMIN_MFA SET secret_ciphertext=COALESCE(@secret,secret_ciphertext),challenge_hash=@hash,
          challenge_password_hash=@password,challenge_expires_at=@expiry WHERE admin_id=@id;
        ELSE INSERT dbo.ADMIN_MFA(admin_id,secret_ciphertext,recovery_code_hashes,challenge_hash,challenge_password_hash,challenge_expires_at)
          VALUES(@id,@secret,N'[]',@hash,@password,@expiry);`);
    await transaction.commit();
    return { requiresMfa: true as const, challenge, setupSecret: secret,
      setupUri: secret ? `otpauth://totp/${encodeURIComponent(`La Chef:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('La Chef')}&algorithm=SHA1&digits=6&period=30` : undefined };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Keep original error. */ }
    throw error;
  }
}

export async function completeAdminMfa(challenge: string, code: string, key: Buffer) {
  const challengeHash = hashSessionToken(challenge);
  const pool = await getDbPool();
  const lookup = await pool.request().input('hash', sql.Char(64), challengeHash)
    .query('SELECT admin_id FROM dbo.ADMIN_MFA WHERE challenge_hash=@hash AND challenge_expires_at>SYSUTCDATETIME()');
  const adminId = Number(lookup.recordset[0]?.admin_id);
  if (!adminId) throw invalid();
  const attemptKey = digest(`admin-mfa:${adminId}`);
  const { takeLoginAttempt } = await import('./login-security.repository.js');
  if (!await takeLoginAttempt(attemptKey)) throw new AppError(429, 'Too many verification attempts. Please try again in 15 minutes.');
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction).input('id', sql.Int, adminId)
      .query("SELECT admin_id FROM dbo.ADMIN WITH(UPDLOCK,HOLDLOCK) WHERE admin_id=@id AND status='ACTIVE'");
    const result = await new sql.Request(transaction).input('hash', sql.Char(64), challengeHash)
      .query(`SELECT m.admin_id,m.secret_ciphertext,m.enabled,m.last_step,m.recovery_code_hashes,m.challenge_password_hash,
        a.full_name,a.email,a.password FROM dbo.ADMIN_MFA m WITH(UPDLOCK,HOLDLOCK)
        JOIN dbo.ADMIN a ON a.admin_id=m.admin_id
        WHERE m.challenge_hash=@hash AND m.challenge_expires_at>SYSUTCDATETIME() AND a.status='ACTIVE'`);
    const row = result.recordset[0];
    if (!row || row.password !== row.challenge_password_hash) throw invalid();
    const secret = decryptSecret(row.secret_ciphertext, key);
    const step = verifyTotp(secret, code, Date.now(), row.last_step === null ? null : Number(row.last_step));
    let recoveryCodes: string[] | undefined;
    let hashes: string[] = JSON.parse(row.recovery_code_hashes);
    const recoveryHash = recoveryCodeHash(code, adminId, key);
    const recoveryIndex = row.enabled && /^[0-9A-Fa-f]{20}$/.test(code) ? hashes.indexOf(recoveryHash) : -1;
    if (step === null && recoveryIndex < 0) throw invalid();
    if (recoveryIndex >= 0) hashes.splice(recoveryIndex, 1);
    if (!row.enabled) {
      recoveryCodes = newRecoveryCodes();
      hashes = recoveryCodes.map(value => recoveryCodeHash(value, adminId, key));
    }
    await new sql.Request(transaction).input('id', sql.Int, adminId)
      .input('step', sql.BigInt, step).input('hashes', sql.NVarChar(sql.MAX), JSON.stringify(hashes))
      .query(`UPDATE dbo.ADMIN_MFA SET enabled=1,last_step=COALESCE(@step,last_step),recovery_code_hashes=@hashes,
        challenge_hash=NULL,challenge_password_hash=NULL,challenge_expires_at=NULL WHERE admin_id=@id`);
    if (!row.enabled) await new sql.Request(transaction).input('id', sql.Int, adminId)
      .query('DELETE dbo.ADMIN_SESSION WHERE admin_id=@id');
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    await createAdminSession(adminId, hashSessionToken(token), expiresAt, row.password, new sql.Request(transaction));
    await clearLoginAttempts(attemptKey, new sql.Request(transaction));
    await transaction.commit();
    return { user: { id: adminId, fullName: row.full_name, email: row.email, role: 'admin' as const },
      session: { token, expiresAt }, recoveryCodes };
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Keep original error. */ }
    throw error;
  }
}
