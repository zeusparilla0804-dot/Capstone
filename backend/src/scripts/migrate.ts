import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { getDbPool, closeDatabase } from '../config/database.js';

const migrationDirectory = path.resolve(process.cwd(), 'migrations');

try {
  const pool = await getDbPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.SCHEMA_MIGRATION', 'U') IS NULL
      CREATE TABLE dbo.SCHEMA_MIGRATION (
        migration_name nvarchar(255) NOT NULL CONSTRAINT PK_SCHEMA_MIGRATION PRIMARY KEY,
        applied_at datetime2 NOT NULL CONSTRAINT DF_SCHEMA_MIGRATION_applied DEFAULT(sysdatetime())
      );
  `);

  const applied = await pool.request().query<{ migration_name: string }>('SELECT migration_name FROM dbo.SCHEMA_MIGRATION');
  const appliedNames = new Set(applied.recordset.map((row) => row.migration_name));
  const files = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();

  for (const file of files) {
    if (appliedNames.has(file)) continue;
    const script = await readFile(path.join(migrationDirectory, file), 'utf8');
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction).batch(script);
      await new sql.Request(transaction).input('name', sql.NVarChar(255), file)
        .query('INSERT dbo.SCHEMA_MIGRATION(migration_name) VALUES(@name)');
      await transaction.commit();
      console.log(`Applied ${file}`);
    } catch (error) {
      try { await transaction.rollback(); } catch { /* XACT_ABORT may already have rolled it back. */ }
      throw error;
    }
  }
  console.log('Database migrations are current.');
} finally {
  await closeDatabase();
}
