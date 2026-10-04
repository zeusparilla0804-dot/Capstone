import { Router } from 'express'; import { cancel,create,dashboard,mine,one } from '../controllers/booking.controller.js'; import { requireCustomer } from '../middleware/auth.middleware.js';
export default Router().use(requireCustomer).get('/my',mine).get('/dashboard',dashboard).get('/:id',one).post('/',create).patch('/:id/cancel',cancel);
