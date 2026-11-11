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
  // Seed the three payment QR images provided by LA Chef. Existing admin edits are preserved.
  const initialDestinations = [
    { file: 'gotyme.jpg', label: 'GoTyme Bank', name: 'JOSEL ATIENZA', hint: 'Ending 2996' },
    { file: 'unionbank.jpg', label: 'UnionBank', name: 'JOSELLELIUS JOHN PAUL VIRAY ATIENZA', hint: 'Ending 4714' },
    { file: 'bdo.jpg', label: 'BDO', name: 'LaChef', hint: 'Ending 2708' },
  ];
  const seedMarker = '022_payment_destinations_seed';
  if (!appliedNames.has(seedMarker)) {
    for (const destination of initialDestinations) {
      const exists = await pool.request().input('label', sql.NVarChar(100), destination.label)
        .query("SELECT 1 FROM dbo.PAYMENT_DESTINATION WHERE method='BANK_TRANSFER' AND label=@label");
      if (exists.recordset.length) continue;
      const image = await readFile(path.resolve(process.cwd(), 'assets/payment-qrs', destination.file));
      await pool.request()
        .input('label', sql.NVarChar(100), destination.label)
        .input('name', sql.NVarChar(200), destination.name)
        .input('hint', sql.NVarChar(50), destination.hint)
        .input('image', sql.VarBinary(sql.MAX), image)
        .query(`IF NOT EXISTS (SELECT 1 FROM dbo.PAYMENT_DESTINATION WHERE method='BANK_TRANSFER' AND label=@label)
          INSERT dbo.PAYMENT_DESTINATION(method,label,account_name,account_hint,image_mime,image_bytes)
          VALUES('BANK_TRANSFER',@label,@name,@hint,'image/jpeg',@image)`);
    }
    await pool.request().input('name', sql.NVarChar(255), seedMarker)
      .query('INSERT dbo.SCHEMA_MIGRATION(migration_name) VALUES(@name)');
  }
  console.log('Database migrations are current.');
} finally {
  await closeDatabase();
}
