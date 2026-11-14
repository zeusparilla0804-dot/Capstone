import { Router } from 'express';
import { adminNotificationService } from '../services/admin-notifications.service.js';

// Mounted only beneath the existing requireAdmin-protected admin router.
export default Router()
  .get('/', async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: await adminNotificationService.list(req.admin!.id, req.query) });
    } catch (error) { next(error); }
  })
  .post('/read', async (req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      await adminNotificationService.markRead(req.admin!.id, req.body);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
