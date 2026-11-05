import '../backend/node_modules/dotenv/dist/config.cjs';
import { readdir } from 'node:fs/promises';
import { environment } from '../backend/src/config/environment.ts';
import { getDbPool, closeDatabase } from '../backend/src/config/database.ts';
if (environment.isProduction) throw new Error('This check is for the local development database only.');
try {
  const pool = await getDbPool();
  const result = await pool.request().query('SELECT migration_name FROM dbo.SCHEMA_MIGRATION');
  const names = new Set(result.recordset.map(row => row.migration_name));
  const files = (await readdir('migrations')).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  console.log(JSON.stringify({ localDevelopment: true, pending: files.filter(name => !names.has(name)) }));
} finally { await closeDatabase(); }
