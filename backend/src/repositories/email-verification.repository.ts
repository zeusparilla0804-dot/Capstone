import sql from 'mssql';
import { timingSafeEqual } from 'node:crypto';
import { getDbPool } from '../config/database.js';
import type { QueueNotificationInput } from '../types/notification.types.js';
import { canIssueEmailCode, canAttemptEmailCode } from '../services/email-verification-policy.js';
import { emailCodeHash } from '../utils/email-verification-code.js';

export type VerificationQueue = (input: QueueNotificationInput, request: sql.Request) => Promise<string>;
interface Dependencies { readRequest(): Promise<sql.Request>; transaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T>; }
interface IssueInput { email: string; selector: string; codeHash: string; now: Date; expiresAt: Date; }

async function pendingCustomer(request: sql.Request, email: string) {
  const result = await request.replaceInput('email', sql.NVarChar(255), email.trim().toLowerCase())
    .query(`SELECT customer_id customerId,email,CONCAT(first_name,' ',last_name) accountName,
      requires_email_verification verificationRequired,verified_email verifiedEmail
      FROM dbo.CUSTOMER WITH(UPDLOCK,HOLDLOCK) WHERE email=@email AND status='ACTIVE'
        AND requires_email_verification=1 AND (verified_email IS NULL OR verified_email<>email)`);
  return result.recordset[0];
}
async function lockedChallenge(request: sql.Request, customerId: number) {
  const result = await request.replaceInput('customerId', sql.Int, customerId)
    .query(`SELECT selector,email,code_hash codeHash,attempts,created_at createdAt,expires_at expiresAt,
      window_started_at windowStartedAt,issuance_count issuanceCount,locked_until lockedUntil
      FROM dbo.EMAIL_VERIFICATION_CHALLENGE WITH(UPDLOCK,HOLDLOCK) WHERE customer_id=@customerId`);
  return result.recordset[0];
}
export function createEmailVerificationRepository(deps: Dependencies) {
  return {
    async issue(input: IssueInput, queue: VerificationQueue, supplied?: sql.Request): Promise<boolean> {
      const work = async (request: sql.Request) => {
        const customer = await pendingCustomer(request, input.email);
        if (!customer) return false;
        const previous = await lockedChallenge(request, Number(customer.customerId));
        if (!canIssueEmailCode(previous, input.now)) return false;
        const newWindow = !previous || +input.now - +previous.windowStartedAt >= 900_000;
        await request.replaceInput('selector', sql.Char(22), input.selector).replaceInput('codeHash', sql.Char(64), input.codeHash)
          .replaceInput('now', sql.DateTime2, input.now).replaceInput('expiresAt', sql.DateTime2, input.expiresAt)
          .replaceInput('windowStart', sql.DateTime2, newWindow ? input.now : previous.windowStartedAt)
          .replaceInput('issuanceCount', sql.Int, newWindow ? 1 : Number(previous.issuanceCount) + 1)
          .query(`UPDATE dbo.EMAIL_VERIFICATION_CHALLENGE SET selector=@selector,email=@email,code_hash=@codeHash,
            attempts=0,created_at=@now,expires_at=@expiresAt,window_started_at=@windowStart,issuance_count=@issuanceCount,locked_until=NULL
            WHERE customer_id=@customerId;
            IF @@ROWCOUNT=0 INSERT dbo.EMAIL_VERIFICATION_CHALLENGE(customer_id,selector,email,code_hash,attempts,created_at,expires_at,window_started_at,issuance_count)
              VALUES(@customerId,@selector,@email,@codeHash,0,@now,@expiresAt,@windowStart,@issuanceCount);`);
        await queue({ recipient: String(customer.email), templateKey: 'EMAIL_VERIFICATION_CODE',
          payload: { accountName: String(customer.accountName), selector: input.selector, accountType: 'CUSTOMER' },
          relatedEntityType: 'CUSTOMER', relatedEntityId: String(customer.customerId) }, request);
        return true;
      };
      return supplied ? work(supplied) : deps.transaction(work);
    },
    async consume(email: string, code: string, secret: string, now: Date, queue: VerificationQueue): Promise<boolean> {
      return deps.transaction(async request => {
        const customer = await pendingCustomer(request, email);
        if (!customer) return false;
        const challenge = await lockedChallenge(request, Number(customer.customerId));
        if (!challenge || challenge.email.toLowerCase() !== email.trim().toLowerCase() || !canAttemptEmailCode(challenge, now)) return false;
        const proof = emailCodeHash(challenge.selector, email, code, secret);
        const valid = /^[a-f0-9]{64}$/.test(challenge.codeHash) && timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(challenge.codeHash, 'hex'));
        request.replaceInput('now', sql.DateTime2, now);
        if (!valid) {
          const attempts = Math.min(5, Number(challenge.attempts) + 1);
          await request.replaceInput('attempts', sql.Int, attempts).replaceInput('lockedUntil', sql.DateTime2, attempts === 5 ? new Date(+now + 900_000) : null)
            .query('UPDATE dbo.EMAIL_VERIFICATION_CHALLENGE SET attempts=@attempts,locked_until=@lockedUntil WHERE customer_id=@customerId');
          return false;
        }
        await request.query(`UPDATE dbo.CUSTOMER SET email_verified_at=@now,verified_email=@email WHERE customer_id=@customerId;
          DELETE dbo.EMAIL_VERIFICATION_CHALLENGE WHERE customer_id=@customerId;
          DELETE dbo.AUTH_SESSION WHERE customer_id=@customerId;`);
        await queue({ recipient: String(customer.email), templateKey: 'ACCOUNT_REGISTERED', payload: { displayName: String(customer.accountName) },
          relatedEntityType: 'CUSTOMER', relatedEntityId: String(customer.customerId) }, request);
        return true;
      });
    },
    async isDeliverable(selector: string, email: string, now: Date, codeHash: string): Promise<boolean> {
      const result = await (await deps.readRequest()).replaceInput('selector', sql.Char(22), selector)
        .replaceInput('email', sql.NVarChar(255), email.trim().toLowerCase()).replaceInput('now', sql.DateTime2, now)
        .replaceInput('codeHash', sql.Char(64), codeHash)
        .query(`SELECT TOP(1) 1 deliverable FROM dbo.EMAIL_VERIFICATION_CHALLENGE v JOIN dbo.CUSTOMER c ON c.customer_id=v.customer_id
          WHERE v.selector=@selector AND v.code_hash=@codeHash AND LOWER(v.email)=@email AND LOWER(c.email)=@email AND c.status='ACTIVE'
            AND c.requires_email_verification=1 AND (c.verified_email IS NULL OR c.verified_email<>c.email)
            AND v.expires_at>@now AND v.attempts<5 AND (v.locked_until IS NULL OR v.locked_until<=@now)`);
      return Boolean(result.recordset[0]);
    },
  };
}

export const emailVerificationRepository = createEmailVerificationRepository({
  readRequest: async () => (await getDbPool()).request(),
  async transaction(work) {
    const transaction = new sql.Transaction(await getDbPool());
    await transaction.begin();
    try { const result = await work(new sql.Request(transaction)); await transaction.commit(); return result; }
    catch (error) { try { await transaction.rollback(); } catch { /* Preserve original failure. */ } throw error; }
  },
});
