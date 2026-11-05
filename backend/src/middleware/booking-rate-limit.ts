import { rateLimit } from 'express-rate-limit';

// Mounted after requireCustomer; use the trusted principal, never a client-supplied account ID.
export const bookingCreationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: request => `customer:${request.customer!.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many booking requests. Please wait before submitting another request.' },
});
