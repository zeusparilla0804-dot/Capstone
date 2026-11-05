import 'dotenv/config';
import sql from 'mssql';
import { closeDatabase, getDbPool } from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { newPassword } from '../utils/password-policy.js';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

try {
  const username = required('ADMIN_USERNAME');
  const email = required('ADMIN_EMAIL').toLowerCase();
  const fullName = required('ADMIN_FULL_NAME');
  const password = newPassword(required('ADMIN_PASSWORD'));
  const pool = await getDbPool();
  await pool.request()
    .input('username', sql.NVarChar(100), username)
    .input('email', sql.NVarChar(255), email)
    .input('fullName', sql.NVarChar(200), fullName)
    .input('password', sql.NVarChar(255), await hashPassword(password))
    .query(`INSERT dbo.ADMIN(username,password,full_name,role,email,status)
      VALUES(@username,@password,@fullName,'ADMIN',@email,'ACTIVE')`);
  console.log(`Administrator ${username} created.`);
} finally {
  await closeDatabase();
}
