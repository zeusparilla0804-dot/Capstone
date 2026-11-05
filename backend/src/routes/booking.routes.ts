import { Router } from 'express'; import { availability,cancel,create,dashboard,mine,one,updateDetails } from '../controllers/booking.controller.js'; import { requireCustomer } from '../middleware/auth.middleware.js';
import { bookingCreationLimit } from '../middleware/booking-rate-limit.js';
export default Router().use(requireCustomer).get('/my',mine).get('/dashboard',dashboard).get('/availability',availability).get('/:id',one).post('/',bookingCreationLimit,create).patch('/:id/details',updateDetails).patch('/:id/cancel',cancel);
