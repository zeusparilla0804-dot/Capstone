import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { nextLoginAttempt, type LoginAttemptState } from '../services/login-attempt-policy.js';
import type { SecurityEvent } from '../services/login-security.service.js';

/** The range lock prevents concurrent requests (including other server instances) bypassing the limit. */
export async function takeLoginAttempt(key: string): Promise<boolean> {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const request = new sql.Request(transaction).input('key', sql.Char(64), key);
    const result = await request.query(`SELECT SYSUTCDATETIME() AS now;
      SELECT attempts,window_started_at,blocked_until FROM dbo.AUTH_LOGIN_ATTEMPT WITH(UPDLOCK,HOLDLOCK) WHERE subject_hash=@key;`);
    const sets = result.recordsets as sql.IRecordSet<any>[];
    const row = sets[1]?.[0];
    const state: LoginAttemptState | undefined = row ? { attempts: row.attempts, windowStartedAt: row.window_started_at, blockedUntil: row.blocked_until } : undefined;
    const next = nextLoginAttempt(state, sets[0]![0].now);
    if (next.allowed) {
      await request.input('attempts', sql.Int, next.state.attempts)
        .input('start', sql.DateTime2, next.state.windowStartedAt).input('blocked', sql.DateTime2, next.state.blockedUntil)
        .query(`UPDATE dbo.AUTH_LOGIN_ATTEMPT SET attempts=@attempts,window_started_at=@start,blocked_until=@blocked WHERE subject_hash=@key;
          IF @@ROWCOUNT=0 INSERT dbo.AUTH_LOGIN_ATTEMPT(subject_hash,attempts,window_started_at,blocked_until) VALUES(@key,@attempts,@start,@blocked);`);
    }
    await transaction.commit();
    return next.allowed;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Retain the original failure. */ }
    throw error;
  }
}
export async function clearLoginAttempts(key: string, request?: sql.Request): Promise<void> {
  await (request ?? (await getDbPool()).request()).replaceInput('securityKey', sql.Char(64), key)
    .query('DELETE dbo.AUTH_LOGIN_ATTEMPT WHERE subject_hash=@securityKey');
}
export async function recordSecurityEvent(event: SecurityEvent, request?: sql.Request): Promise<void> {
  await (request ?? (await getDbPool()).request())
    .replaceInput('securityRole', sql.VarChar(8), event.role).replaceInput('securityId', sql.Int, event.principalId ?? null)
    .replaceInput('securitySubject', sql.Char(64), event.subjectHash).replaceInput('securityIp', sql.Char(64), event.ipHash ?? null)
    .replaceInput('securityEvent', sql.VarChar(24), event.event)
    .query(`INSERT dbo.AUTH_SECURITY_EVENT(principal_type,principal_id,subject_hash,ip_hash,event_type)
      VALUES(@securityRole,@securityId,@securitySubject,@securityIp,@securityEvent)`);
}
