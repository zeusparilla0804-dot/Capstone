import sql from 'mssql';
import { environment } from './environment.js';
import { logger } from '../utils/logger.js';

const dbConfig: sql.config = {
  server: environment.db.server,
  port: environment.db.port,
  database: environment.db.database,
  user: environment.db.user,
  password: environment.db.password,

  options: {
    encrypt: environment.db.encrypt,
    trustServerCertificate: environment.db.trustServerCertificate,
    enableArithAbort: true
  },

  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | null = null;

export async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) {
    return pool;
  }

  pool = await new sql.ConnectionPool(dbConfig).connect();

  return pool;
}

export async function connectDatabase(): Promise<void> {
  await getDbPool();

  logger.info('database.connected', 'SQL Server connection established.');
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;

    logger.info('database.closed', 'SQL Server connection closed.');
  }
}
