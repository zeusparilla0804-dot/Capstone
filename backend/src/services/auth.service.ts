import {
  createAdminSession,
  createCustomer,
  customerEmailExists,
  createSession,
  deleteAdminSession,
  deleteAdminSessions,
  deleteCustomerSessions,
  deleteExpiredSessions,
  deleteSession,
  findAdminCredentials,
  findCustomerCredentials,
  updateCustomerPhone,
} from '../repositories/auth.repository.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createSessionToken, hashSessionToken } from '../utils/session.js';
import { queueNotification } from './notification.service.js';
import { createLoginSecurity, throttleKey } from './login-security.service.js';
import { clearLoginAttempts, recordSecurityEvent, takeLoginAttempt } from '../repositories/login-security.repository.js';
import { newPassword } from '../utils/password-policy.js';
import { emailVerificationService } from './email-verification.service.js';
import { environment } from '../config/environment.js';
import { beginAdminMfa, completeAdminMfa } from '../repositories/admin-mfa.repository.js';

const SESSION_DAYS = 7;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let dummyHash: Promise<string> | undefined;
const loginSecurity = createLoginSecurity({
  takeAttempt: takeLoginAttempt, clearAttempts: clearLoginAttempts, recordEvent: recordSecurityEvent,
  verify: verifyPassword,
  dummyHash: () => dummyHash ??= hashPassword(createSessionToken()),
});

interface SessionSecurityRepository {
  deleteCustomerSessions(customerId: number): Promise<void>;
  deleteAdminSessions(adminId: number): Promise<void>;
  deleteExpiredSessions(): Promise<{ customers: number; administrators: number }>;
}

export function createSessionSecurityService(repository: SessionSecurityRepository) {
  return {
    logoutAllCustomerSessions: (customerId: number) => repository.deleteCustomerSessions(customerId),
    logoutAllAdminSessions: (adminId: number) => repository.deleteAdminSessions(adminId),
    cleanupExpiredSessions: () => repository.deleteExpiredSessions(),
  };
}

interface SessionCleanupWorkerDependencies {
  cleanup(): Promise<unknown>;
  intervalMs: number;
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
  onError?: () => void;
}

export function createSessionCleanupWorker(deps: SessionCleanupWorkerDependencies) {
  let timer: unknown;
  let running: Promise<void> | undefined;
  let started = false;
  let stopping = false;

  async function tick(): Promise<void> {
    if (stopping || running) return;
    running = (async () => {
      try {
        await deps.cleanup();
      } catch {
        deps.onError?.();
      }
    })();
    try {
      await running;
    } finally {
      running = undefined;
      if (!stopping) timer = deps.schedule(() => { void tick(); }, deps.intervalMs);
    }
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      stopping = false;
      void tick();
    },
    async stop(): Promise<void> {
      if (!started) return;
      stopping = true;
      if (timer !== undefined) deps.cancel(timer);
      await running;
      timer = undefined;
      started = false;
    },
  };
}

async function issueSession(customerId: number, passwordHash: string) { const token=createSessionToken(); const expiresAt=new Date(Date.now()+SESSION_DAYS*86400000); await createSession(customerId,hashSessionToken(token),expiresAt,passwordHash); return {token,expiresAt}; }
const sessionSecurityService = createSessionSecurityService({ deleteCustomerSessions, deleteAdminSessions, deleteExpiredSessions });

interface RegistrationInput { firstName: string; lastName: string; email: string; phone: string; password: string; }
interface RegistrationDependencies {
  customerEmailExists(email: string): Promise<boolean>;
  hashPassword(password: string): Promise<string>;
  createCustomer(input: RegistrationInput & { passwordHash: string }): Promise<number>;
}

export function createRegistrationService(deps: RegistrationDependencies) {
  return {
    async register(input: RegistrationInput) {
      input = { ...input, password: newPassword(input.password) };
      const conflict = () => new AppError(409, 'An account with that email already exists.');
      if (await deps.customerEmailExists(input.email)) throw conflict();
      let id: number;
      try {
        id = await deps.createCustomer({ ...input, passwordHash: await deps.hashPassword(input.password) });
      } catch (error) {
        const detail = error as { number?: number; originalError?: { info?: { number?: number } } } | null;
        if ([2601, 2627].includes(detail?.number ?? detail?.originalError?.info?.number ?? 0)) throw conflict();
        throw error;
      }
      return { user: { id, fullName: `${input.firstName} ${input.lastName}`, email: input.email, phone: input.phone, role: 'customer' as const } };
    },
  };
}

const registrationService = createRegistrationService({
  customerEmailExists,
  hashPassword,
  createCustomer: input => createCustomer(input, queueNotification, emailVerificationService.requestCode),
});

export const authService = {
  async updatePhone(customerId: number, phone: string) {
    const user = await updateCustomerPhone(customerId, phone);
    if (!user) throw new AppError(404, 'Customer not found.');
    return user;
  },
  register: registrationService.register,
  async login(email: string, password: string, ip?: string) {
    const row = await findCustomerCredentials(email);
    const success = await loginSecurity.authenticate({ role: 'CUSTOMER', principalId: row ? Number(row.customer_id) : undefined,
      identity: email, password, passwordHash: row?.password, ip });
    if (Number(row.requires_email_verification) === 1 && String(row.verified_email ?? '').toLowerCase() !== String(row.email).toLowerCase()) {
      throw new AppError(403, 'Please verify your email address before signing in.', 'EMAIL_NOT_VERIFIED');
    }
    const session = await issueSession(Number(row.customer_id), row.password);
    await recordSecurityEvent(success);
    return { user: { id: Number(row.customer_id), fullName: `${row.first_name} ${row.last_name}`, email: row.email,
      phone: row.contact_number, role: 'customer' as const }, session };
  },
  logout:(token:string)=>deleteSession(hashSessionToken(token)),
  logoutAllCustomerSessions: sessionSecurityService.logoutAllCustomerSessions,
  async adminLogin(identity: string, password: string, ip?: string) {
    const row = await findAdminCredentials(identity);
    const success = await loginSecurity.authenticate({ role: 'ADMIN', principalId: row ? Number(row.admin_id) : undefined,
      identity, password, passwordHash: row?.password, ip });
    if (environment.adminMfa.key) {
      return beginAdminMfa(Number(row.admin_id), row.password, row.email, environment.adminMfa.key);
    }
    const token = createSessionToken(); const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
    await createAdminSession(Number(row.admin_id), hashSessionToken(token), expiresAt, row.password);
    await recordSecurityEvent(success);
    return { user: { id: Number(row.admin_id), fullName: row.full_name, email: row.email, role: 'admin' as const }, session: { token, expiresAt } };
  },
  async completeAdminMfa(challenge: string, code: string) {
    if (!environment.adminMfa.key) throw new AppError(404, 'Administrator verification is unavailable.');
    const result = await completeAdminMfa(challenge, code, environment.adminMfa.key);
    await recordSecurityEvent({ role: 'ADMIN', principalId: result.user.id,
      subjectHash: throttleKey('ADMIN', result.user.id, ''), event: 'LOGIN_SUCCESS' });
    return result;
  },
  adminLogout:(token:string)=>deleteAdminSession(hashSessionToken(token)),
  logoutAllAdminSessions: sessionSecurityService.logoutAllAdminSessions,
};

export const sessionCleanupWorker = createSessionCleanupWorker({
  cleanup: sessionSecurityService.cleanupExpiredSessions,
  intervalMs: SESSION_CLEANUP_INTERVAL_MS,
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  onError: () => logger.error('session_cleanup.failed', 'Expired session cleanup failed safely.'),
});
