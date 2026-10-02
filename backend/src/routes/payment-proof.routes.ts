import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { downloadProof, listCustomerProofs, submitProof } from '../controllers/payment-proof.controller.js';
import { requireCustomer, requireProofActor } from '../middleware/auth.middleware.js';
import { paymentProofUpload } from '../middleware/payment-proof-upload.middleware.js';

const uploadLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, message: 'Too many payment proof submissions. Please try again later.' } });

export const paymentProofRoutes = Router()
  .post('/:id/payment-proofs', requireCustomer, uploadLimit, paymentProofUpload, submitProof)
  .get('/:id/payment-proofs', requireCustomer, listCustomerProofs);

export const proofFileRoutes = Router().get('/:id/file', requireProofActor, downloadProof);
