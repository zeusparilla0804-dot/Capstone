import { createAdminSession, createCustomer, createSession, deleteAdminSession, deleteSession, findAdminCredentials, findCustomerCredentials } from '../repositories/auth.repository.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { createSessionToken, hashSessionToken } from '../utils/session.js';
const SESSION_DAYS = 7;
async function issueSession(customerId: number) { const token=createSessionToken(); const expiresAt=new Date(Date.now()+SESSION_DAYS*86400000); await createSession(customerId,hashSessionToken(token),expiresAt); return {token,expiresAt}; }
export const authService={
  async register(input:{firstName:string;lastName:string;email:string;phone:string;password:string}) { if(await findCustomerCredentials(input.email)) throw new AppError(409,'An account with that email already exists.'); const id=await createCustomer({...input,passwordHash:await hashPassword(input.password)}); return {user:{id,fullName:`${input.firstName} ${input.lastName}`,email:input.email,role:'customer' as const},session:await issueSession(id)}; },
  async login(email:string,password:string) { const row=await findCustomerCredentials(email); if(!row||!(await verifyPassword(password,row.password))) throw new AppError(401,'Invalid email or password.'); return {user:{id:Number(row.customer_id),fullName:`${row.first_name} ${row.last_name}`,email:row.email,role:'customer' as const},session:await issueSession(Number(row.customer_id))}; },
  logout:(token:string)=>deleteSession(hashSessionToken(token)),
  async adminLogin(identity:string,password:string){const row=await findAdminCredentials(identity);if(!row||!(await verifyPassword(password,row.password)))throw new AppError(401,'Invalid administrator credentials.');const token=createSessionToken();const expiresAt=new Date(Date.now()+SESSION_DAYS*86400000);await createAdminSession(Number(row.admin_id),hashSessionToken(token),expiresAt);return{user:{id:Number(row.admin_id),fullName:row.full_name,email:row.email,role:'admin' as const},session:{token,expiresAt}};},
  adminLogout:(token:string)=>deleteAdminSession(hashSessionToken(token)),
};
