import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type {
  PasswordResetConsume,
  PasswordResetConsumeResult,
  PasswordResetIssue,
  PasswordResetIssueResult,
  PasswordResetNotificationQueue,
  RecoveryPrincipal,
} from '../types/password-recovery.types.js';
import type { PasswordResetPrincipal } from '../utils/password-reset-token.js';

interface RepositoryDependencies {
  readRequest: () => Promise<sql.Request>;
  transaction: <T>(work: (request: sql.Request) => Promise<T>) => Promise<T>;
}

export interface PasswordRecoveryRepository {
  findPrincipal(principalType: PasswordResetPrincipal, normalizedEmail: string): Promise<RecoveryPrincipal | undefined>;
  issue(input: PasswordResetIssue, queue: PasswordResetNotificationQueue): Promise<PasswordResetIssueResult>;
  consume(input: PasswordResetConsume, queue: PasswordResetNotificationQueue): Promise<PasswordResetConsumeResult>;
  isDeliverable(selector: string, principalType: PasswordResetPrincipal, now: Date): Promise<boolean>;
}

function principalColumn(principalType: PasswordResetPrincipal): 'customer_id' | 'admin_id' {
  return principalType === 'CUSTOMER' ? 'customer_id' : 'admin_id';
}

function mapPrincipal(row: Record<string, unknown> | undefined, principalType: PasswordResetPrincipal): RecoveryPrincipal | undefined {
  if (!row) return undefined;
  return {
    id: Number(row.id),
    principalType,
    email: String(row.email),
    displayName: String(row.displayName),
  };
}

export function createPasswordRecoveryRepository(deps: RepositoryDependencies): PasswordRecoveryRepository {
  return {
    async findPrincipal(principalType, normalizedEmail) {
      const request = (await deps.readRequest()).replaceInput('email', sql.NVarChar(255), normalizedEmail);
      const command = principalType === 'CUSTOMER'
        ? `SELECT customer_id id,email,CONCAT(first_name,' ',last_name) displayName
           FROM dbo.CUSTOMER WHERE LOWER(email)=@email`
        : `SELECT admin_id id,email,full_name displayName
           FROM dbo.ADMIN WHERE LOWER(email)=@email AND status='ACTIVE'`;
      const result = await request.query<Record<string, unknown>>(command);
      return mapPrincipal(result.recordset[0], principalType);
    },

    async issue(input, queue) {
      return deps.transaction(async request => {
        const column = principalColumn(input.principal.principalType);
        const lockedAccount = input.principal.principalType === 'CUSTOMER'
          ? await request.replaceInput('principalId', sql.Int, input.principal.id)
              .query(`SELECT customer_id id FROM dbo.CUSTOMER WITH(UPDLOCK,HOLDLOCK) WHERE customer_id=@principalId`)
          : await request.replaceInput('principalId', sql.Int, input.principal.id)
              .query(`SELECT admin_id id FROM dbo.ADMIN WITH(UPDLOCK,HOLDLOCK) WHERE admin_id=@principalId AND status='ACTIVE'`);
        if (!lockedAccount.recordset[0]) return 'COOLDOWN';

        const cooldownCutoff = new Date(input.now.getTime() - input.cooldownMs);
        const recent = await request
          .replaceInput('principalType', sql.VarChar(10), input.principal.principalType)
          .replaceInput('principalId', sql.Int, input.principal.id)
          .replaceInput('cooldownCutoff', sql.DateTime2, cooldownCutoff)
          .query(`SELECT TOP (1) CONVERT(varchar(20),reset_id) resetId
                  FROM dbo.PASSWORD_RESET_TOKEN WITH(UPDLOCK,HOLDLOCK)
                  WHERE principal_type=@principalType AND ${column}=@principalId AND created_at>=@cooldownCutoff
                  ORDER BY created_at DESC,reset_id DESC`);
        if (recent.recordset[0]) return 'COOLDOWN';

        await request
          .replaceInput('principalType', sql.VarChar(10), input.principal.principalType)
          .replaceInput('principalId', sql.Int, input.principal.id)
          .replaceInput('now', sql.DateTime2, input.now)
          .query(`UPDATE dbo.PASSWORD_RESET_TOKEN SET invalidated_at=@now
                  WHERE principal_type=@principalType AND ${column}=@principalId
                    AND used_at IS NULL AND invalidated_at IS NULL`);

        await request
          .replaceInput('selector', sql.Char(22), input.selector)
          .replaceInput('tokenHash', sql.Char(64), input.tokenHash)
          .replaceInput('principalType', sql.VarChar(10), input.principal.principalType)
          .replaceInput('customerId', sql.Int, input.principal.principalType === 'CUSTOMER' ? input.principal.id : null)
          .replaceInput('adminId', sql.Int, input.principal.principalType === 'ADMIN' ? input.principal.id : null)
          .replaceInput('expiresAt', sql.DateTime2, input.expiresAt)
          .replaceInput('now', sql.DateTime2, input.now)
          .query(`INSERT dbo.PASSWORD_RESET_TOKEN(selector,token_hash,principal_type,customer_id,admin_id,expires_at,created_at)
                  OUTPUT CONVERT(varchar(20),INSERTED.reset_id) resetId
                  VALUES(@selector,@tokenHash,@principalType,@customerId,@adminId,@expiresAt,@now)`);

        await queue({
          recipient: input.principal.email,
          templateKey: 'PASSWORD_RESET_REQUESTED',
          payload: {
            accountName: input.principal.displayName,
            selector: input.selector,
            accountType: input.principal.principalType,
          },
        }, request);
        return 'ISSUED';
      });
    },

    async consume(input, queue) {
      return deps.transaction(async request => {
        const lookup = input.principalType === 'CUSTOMER'
          ? `SELECT CONVERT(varchar(20),r.reset_id) resetId,r.customer_id principalId,c.email,
                CONCAT(c.first_name,' ',c.last_name) displayName
             FROM dbo.PASSWORD_RESET_TOKEN r WITH(UPDLOCK,HOLDLOCK)
             JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
             WHERE r.selector=@selector AND r.token_hash=@tokenHash AND r.principal_type=@principalType
               AND r.used_at IS NULL AND r.invalidated_at IS NULL AND r.expires_at>@now`
          : `SELECT CONVERT(varchar(20),r.reset_id) resetId,r.admin_id principalId,a.email,a.full_name displayName
             FROM dbo.PASSWORD_RESET_TOKEN r WITH(UPDLOCK,HOLDLOCK)
             JOIN dbo.ADMIN a ON a.admin_id=r.admin_id AND a.status='ACTIVE'
             WHERE r.selector=@selector AND r.token_hash=@tokenHash AND r.principal_type=@principalType
               AND r.used_at IS NULL AND r.invalidated_at IS NULL AND r.expires_at>@now`;
        const result = await request
          .replaceInput('selector', sql.Char(22), input.selector)
          .replaceInput('tokenHash', sql.Char(64), input.tokenHash)
          .replaceInput('principalType', sql.VarChar(10), input.principalType)
          .replaceInput('now', sql.DateTime2, input.now)
          .query<Record<string, unknown>>(lookup);
        const row = result.recordset[0];
        if (!row) return 'INVALID';

        const principalId = Number(row.principalId);
        const passwordResult = input.principalType === 'CUSTOMER'
          ? await request.replaceInput('principalId', sql.Int, principalId).replaceInput('passwordHash', sql.NVarChar(255), input.passwordHash)
              .query('UPDATE dbo.CUSTOMER SET password=@passwordHash WHERE customer_id=@principalId')
          : await request.replaceInput('principalId', sql.Int, principalId).replaceInput('passwordHash', sql.NVarChar(255), input.passwordHash)
              .query("UPDATE dbo.ADMIN SET password=@passwordHash WHERE admin_id=@principalId AND status='ACTIVE'");
        if ((passwordResult.rowsAffected[0] ?? 0) !== 1) throw new Error('Password reset principal changed during consumption.');

        const used = await request
          .replaceInput('resetId', sql.BigInt, String(row.resetId))
          .replaceInput('now', sql.DateTime2, input.now)
          .query(`UPDATE dbo.PASSWORD_RESET_TOKEN SET used_at=@now
                  WHERE reset_id=@resetId AND used_at IS NULL AND invalidated_at IS NULL`);
        if ((used.rowsAffected[0] ?? 0) !== 1) throw new Error('Password reset token changed during consumption.');

        const column = principalColumn(input.principalType);
        await request
          .replaceInput('principalType', sql.VarChar(10), input.principalType)
          .replaceInput('principalId', sql.Int, principalId)
          .replaceInput('resetId', sql.BigInt, String(row.resetId))
          .replaceInput('now', sql.DateTime2, input.now)
          .query(`UPDATE dbo.PASSWORD_RESET_TOKEN SET invalidated_at=@now
                  WHERE principal_type=@principalType AND ${column}=@principalId AND reset_id<>@resetId
                    AND used_at IS NULL AND invalidated_at IS NULL`);

        if (input.principalType === 'CUSTOMER') {
          await request.replaceInput('principalId', sql.Int, principalId)
            .query('DELETE dbo.AUTH_SESSION WHERE customer_id=@principalId');
        } else {
          await request.replaceInput('principalId', sql.Int, principalId)
            .query('DELETE dbo.ADMIN_SESSION WHERE admin_id=@principalId');
        }

        await queue({
          recipient: String(row.email),
          templateKey: 'PASSWORD_CHANGED',
          payload: { displayName: String(row.displayName) },
        }, request);
        return 'CONSUMED';
      });
    },

    async isDeliverable(selector, principalType, now) {
      const request = (await deps.readRequest())
        .replaceInput('selector', sql.Char(22), selector)
        .replaceInput('principalType', sql.VarChar(10), principalType)
        .replaceInput('now', sql.DateTime2, now);
      const command = principalType === 'CUSTOMER'
        ? `SELECT TOP (1) 1 deliverable FROM dbo.PASSWORD_RESET_TOKEN r
           JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
           WHERE r.selector=@selector AND r.principal_type=@principalType AND r.used_at IS NULL
             AND r.invalidated_at IS NULL AND r.expires_at>@now`
        : `SELECT TOP (1) 1 deliverable FROM dbo.PASSWORD_RESET_TOKEN r
           JOIN dbo.ADMIN a ON a.admin_id=r.admin_id AND a.status='ACTIVE'
           WHERE r.selector=@selector AND r.principal_type=@principalType AND r.used_at IS NULL
             AND r.invalidated_at IS NULL AND r.expires_at>@now`;
      const result = await request.query(command);
      return Boolean(result.recordset[0]);
    },
  };
}

async function transaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T> {
  const tx = new sql.Transaction(await getDbPool());
  await tx.begin();
  try {
    const result = await work(tx.request());
    await tx.commit();
    return result;
  } catch (error) {
    try { await tx.rollback(); } catch { /* Preserve the original error. */ }
    throw error;
  }
}

export const passwordRecoveryRepository = createPasswordRecoveryRepository({
  readRequest: async () => (await getDbPool()).request(),
  transaction,
});
