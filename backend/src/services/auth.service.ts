import {
  createAdminSession,
  createCustomer,
  createSession,
  deleteAdminSession,
  deleteAdminSessions,
  deleteCustomerSessions,
  deleteExpiredSessions,
  deleteSession,
  findAdminCredentials,
  findCustomerCredentials,
} from '../repositories/auth.repository.js';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createSessionToken, hashSessionToken } from '../utils/session.js';

const SESSION_DAYS = 7;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

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

async function issueSession(customerId: number) { const token=createSessionToken(); const expiresAt=new Date(Date.now()+SESSION_DAYS*86400000); await createSession(customerId,hashSessionToken(token),expiresAt); return {token,expiresAt}; }
const sessionSecurityService = createSessionSecurityService({ deleteCustomerSessions, deleteAdminSessions, deleteExpiredSessions });

export const authService = {
  async register(input:{firstName:string;lastName:string;email:string;phone:string;password:string}) { if(await findCustomerCredentials(input.email)) throw new AppError(409,'An account with that email already exists.'); const id=await createCustomer({...input,passwordHash:await hashPassword(input.password)}); return {user:{id,fullName:`${input.firstName} ${input.lastName}`,email:input.email,phone:input.phone,role:'customer' as const},session:await issueSession(id)}; },
  async login(email:string,password:string) { const row=await findCustomerCredentials(email); if(!row||!(await verifyPassword(password,row.password))) throw new AppError(401,'Invalid email or password.'); return {user:{id:Number(row.customer_id),fullName:`${row.first_name} ${row.last_name}`,email:row.email,phone:row.contact_number,role:'customer' as const},session:await issueSession(Number(row.customer_id))}; },
  logout:(token:string)=>deleteSession(hashSessionToken(token)),
  logoutAllCustomerSessions: sessionSecurityService.logoutAllCustomerSessions,
  async adminLogin(identity:string,password:string){const row=await findAdminCredentials(identity);if(!row||!(await verifyPassword(password,row.password)))throw new AppError(401,'Invalid administrator credentials.');const token=createSessionToken();const expiresAt=new Date(Date.now()+SESSION_DAYS*86400000);await createAdminSession(Number(row.admin_id),hashSessionToken(token),expiresAt);return{user:{id:Number(row.admin_id),fullName:row.full_name,email:row.email,role:'admin' as const},session:{token,expiresAt}};},
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
