import express, { type Request, type Response } from 'express';

import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import 'dotenv/config';

import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import { addOnRoutes, packageRoutes } from './routes/catalog.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import adminRoutes from './routes/admin.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import { environment } from './config/environment.js';
import { isAllowedFrontendOrigin } from './config/cors.js';
import { paymentProofRoutes, proofFileRoutes } from './routes/payment-proof.routes.js';
import customEventRoutes from './routes/custom-event.routes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', environment.isProduction ? 1 : false);
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedFrontendOrigin(origin, environment.frontendOrigin, environment.isProduction)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset requests. Please try again later.' }
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many password reset attempts. Please try again later.' }
});

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to the La-Chef API'
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/admin/login', authLimiter);
app.use('/api/auth/password/forgot', forgotPasswordLimiter);
app.use('/api/auth/admin/password/forgot', forgotPasswordLimiter);
app.use('/api/auth/password/reset', resetPasswordLimiter);
app.use('/api/auth/admin/password/reset', resetPasswordLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/add-ons', addOnRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/bookings', paymentProofRoutes);
app.use('/api/custom-events', customEventRoutes);
app.use('/api/payment-proofs', proofFileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
