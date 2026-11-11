import type { NextFunction, Request, Response } from 'express';
import { completeEventPayment } from '../services/event-completion.service.js';
import { identifier } from '../utils/validation.js';

export async function completeEvent(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const data = await completeEventPayment(request.admin!.id, identifier(request.params['id'], 'Booking identifier'), request.body);
    response.json({ success: true, message: 'Event completed. The receipt reflects all recorded payments.', data });
  } catch (error) { next(error); }
}
