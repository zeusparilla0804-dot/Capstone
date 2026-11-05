import '../backend/node_modules/dotenv/dist/config.cjs';
import { environment } from '../backend/src/config/environment.ts';
import { getDbPool, closeDatabase } from '../backend/src/config/database.ts';
try {
  const pool = await getDbPool();
  const result = await pool.request().query(`SELECT template_key template,status,COUNT(*) count,
    MAX(sent_at) lastSentAt FROM dbo.EMAIL_OUTBOX GROUP BY template_key,status ORDER BY template_key,status`);
  console.log(JSON.stringify({ smtpConfigured: Boolean(environment.email.smtp), workerEnabled: environment.email.worker.enabled,
    resetConfigured: Boolean(environment.passwordReset.hmacSecret), deliverySummary: result.recordset }));
} finally { await closeDatabase(); }
