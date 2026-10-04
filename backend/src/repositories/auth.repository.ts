import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { AuthenticatedAdmin, AuthenticatedCustomer } from '../types/domain.types.js';

export async function findCustomerCredentials(email: string) {
  const pool = await getDbPool();
  const result = await pool.request().input('email', sql.NVarChar(255), email).query(`SELECT customer_id, first_name, last_name, email, password FROM dbo.CUSTOMER WHERE email = @email`);
  return result.recordset[0];
}
export async function createCustomer(input: { firstName: string; lastName: string; email: string; phone: string; passwordHash: string }): Promise<number> {
  const pool = await getDbPool();
  const result = await pool.request().input('firstName', sql.NVarChar(100), input.firstName).input('lastName', sql.NVarChar(100), input.lastName).input('email', sql.NVarChar(255), input.email).input('phone', sql.NVarChar(30), input.phone).input('password', sql.NVarChar(255), input.passwordHash).query(`INSERT dbo.CUSTOMER(first_name,last_name,email,contact_number,password) OUTPUT INSERTED.customer_id VALUES(@firstName,@lastName,@email,@phone,@password)`);
  return Number(result.recordset[0].customer_id);
}
export async function createSession(customerId: number, tokenHash: string, expiresAt: Date): Promise<void> {
  const pool = await getDbPool();
  await pool.request().input('customerId', sql.Int, customerId).input('tokenHash', sql.Char(64), tokenHash).input('expiresAt', sql.DateTime2, expiresAt).query(`INSERT dbo.AUTH_SESSION(customer_id,token_hash,expires_at) VALUES(@customerId,@tokenHash,@expiresAt)`);
}
export async function findCustomerBySession(tokenHash: string): Promise<AuthenticatedCustomer | undefined> {
  const pool = await getDbPool();
  const result = await pool.request().input('tokenHash', sql.Char(64), tokenHash).query(`SELECT c.customer_id,c.first_name,c.last_name,c.email FROM dbo.AUTH_SESSION s JOIN dbo.CUSTOMER c ON c.customer_id=s.customer_id WHERE s.token_hash=@tokenHash AND s.expires_at>SYSUTCDATETIME()`);
  const row = result.recordset[0];
  return row ? { id: Number(row.customer_id), fullName: `${row.first_name} ${row.last_name}`, email: row.email, role: 'customer' } : undefined;
}
export async function deleteSession(tokenHash: string): Promise<void> {
  const pool = await getDbPool();
  await pool.request().input('tokenHash', sql.Char(64), tokenHash).query('DELETE dbo.AUTH_SESSION WHERE token_hash=@tokenHash');
}
export async function findAdminCredentials(identity:string){const pool=await getDbPool();const result=await pool.request().input('identity',sql.NVarChar(255),identity).query(`SELECT admin_id,full_name,email,password FROM dbo.ADMIN WHERE (email=@identity OR username=@identity) AND status='ACTIVE'`);return result.recordset[0];}
export async function createAdminSession(adminId:number,tokenHash:string,expiresAt:Date){const pool=await getDbPool();await pool.request().input('adminId',sql.Int,adminId).input('tokenHash',sql.Char(64),tokenHash).input('expiresAt',sql.DateTime2,expiresAt).query('INSERT dbo.ADMIN_SESSION(admin_id,token_hash,expires_at) VALUES(@adminId,@tokenHash,@expiresAt)');}
export async function findAdminBySession(tokenHash:string):Promise<AuthenticatedAdmin|undefined>{const pool=await getDbPool();const result=await pool.request().input('tokenHash',sql.Char(64),tokenHash).query(`SELECT a.admin_id,a.full_name,a.email FROM dbo.ADMIN_SESSION s JOIN dbo.ADMIN a ON a.admin_id=s.admin_id WHERE s.token_hash=@tokenHash AND s.expires_at>SYSUTCDATETIME() AND a.status='ACTIVE'`);const row=result.recordset[0];return row?{id:Number(row.admin_id),fullName:row.full_name,email:row.email,role:'admin'}:undefined;}
export async function deleteAdminSession(tokenHash:string){const pool=await getDbPool();await pool.request().input('tokenHash',sql.Char(64),tokenHash).query('DELETE dbo.ADMIN_SESSION WHERE token_hash=@tokenHash');}
