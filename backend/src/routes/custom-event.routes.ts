import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { customEventController } from '../controllers/custom-event.controller.js';
import { requireCustomer } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/app-error.js';

function retiredCustomQuotation(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(
    410,
    'Custom quotation requests are no longer available. Select a package and add special requests to your reservation.',
    'CUSTOM_QUOTATION_RETIRED',
  ));
}

export default Router()
  .use(requireCustomer)
  .post('/', retiredCustomQuotation)
  .post('/:id/quotes/:quoteId/accept', customEventController.accept)
  .post('/:id/quotes/:quoteId/decline', customEventController.decline)
  .get('/:id', customEventController.detail);
