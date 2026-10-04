import { Router } from 'express';
import { getDbPool } from '../config/database.js';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'La-Chef API is running'
  });
});

router.get('/database', async (_req, res, next) => {
  try {
    const pool = await getDbPool();

    const result = await pool
      .request()
      .query<{ connected: number }>(
        'SELECT 1 AS connected;'
      );

    res.status(200).json({
      success: true,
      message: 'SQL Server connection is working',
      connected: result.recordset[0]?.connected === 1
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ready', async (_req, res) => {
  try {
    const pool = await getDbPool();
    await pool.request().query('SELECT 1 AS ready;');
    res.status(200).json({ success: true, status: 'ready' });
  } catch {
    res.status(503).json({ success: false, status: 'not_ready' });
  }
});

export default router;
