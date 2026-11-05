import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireCustomer } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/app-error.js';

export function retiredCustomQuotation(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(
    410,
    'Custom quotation requests are no longer available. Select a package and add special requests to your reservation.',
    'CUSTOM_QUOTATION_RETIRED',
  ));
}

export default Router()
  .use(requireCustomer)
  .post('/', retiredCustomQuotation)
  .post('/:id/quotes/:quoteId/accept', retiredCustomQuotation)
  .post('/:id/quotes/:quoteId/decline', retiredCustomQuotation)
  .get('/:id', retiredCustomQuotation);
