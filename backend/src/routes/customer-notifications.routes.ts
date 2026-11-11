import { Router } from 'express';
import { requireCustomer } from '../middleware/auth.middleware.js';
import { customerUpdates, markCustomerUpdatesRead } from '../repositories/customer-notifications.repository.js';
import { AppError } from '../utils/app-error.js';

export default Router().use(requireCustomer)
  .get('/', async (req, res, next) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json({ success: true, data: await customerUpdates(req.customer!.id) }); }
    catch (error) { next(error); }
  })
  .post('/read', async (req, res, next) => {
    try {
      const ids: unknown = req.body?.ids;
      if (!Array.isArray(ids) || ids.length > 80 || ids.some(id => typeof id !== 'string' || id.length > 120)) throw new AppError(400, 'Invalid notification selection.');
      await markCustomerUpdatesRead(req.customer!.id, ids);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
