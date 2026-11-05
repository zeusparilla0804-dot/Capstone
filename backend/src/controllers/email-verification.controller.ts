import type { NextFunction, Request, Response } from 'express';
import { emailAddress, text } from '../utils/validation.js';
import { emailVerificationService } from '../services/email-verification.service.js';

export async function verifyCustomerEmail(req: Request, res: Response, next: NextFunction) {
  try {
    await emailVerificationService.verify(emailAddress(req.body?.email), text(req.body?.code, 'Verification code', { min: 6, max: 6 }));
    res.json({ success: true, message: 'Your email address has been verified. Please sign in to continue.' });
  } catch (error) { next(error); }
}
export async function resendCustomerEmailCode(req: Request, res: Response, next: NextFunction) {
  try {
    await emailVerificationService.requestCode(emailAddress(req.body?.email));
    res.status(202).json({ success: true, message: 'If your account needs verification, a code will arrive shortly. Check your Inbox and Spam folder.', resendAfterSeconds: 60 });
  } catch (error) { next(error); }
}
