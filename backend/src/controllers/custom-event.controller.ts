import type { NextFunction, Request, Response } from 'express';
import { customEventService } from '../services/custom-event.service.js';
import type { CreateCustomEventRequestDto } from '../types/custom-event.types.js';
import { AppError } from '../utils/app-error.js';
import { finiteMoney, identifier, isoDate, text, time24 } from '../utils/validation.js';

function optionalText(value: unknown, name: string, max: number): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : text(value, name, { max });
}

function requestedServices(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new AppError(400, 'Requested services must contain at most 20 entries.');
  }
  const services = value.map(item => text(item, 'Requested service', { max: 100 }));
  if (new Set(services.map(item => item.toLocaleLowerCase())).size !== services.length) {
    throw new AppError(400, 'Requested services contain duplicate entries.');
  }
  return services;
}

export function parseCustomEventRequest(body: Record<string, unknown>): CreateCustomEventRequestDto {
  const guestCount = Number(body['guestCount']);
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 10_000) {
    throw new AppError(400, 'Guest count is invalid.');
  }
  return {
    eventType: text(body['eventType'], 'Event type', { max: 100 }),
    eventDate: isoDate(body['eventDate'], 'Event date', true),
    eventTime: time24(body['eventTime']),
    venue: text(body['venue'], 'Venue', { max: 500 }),
    guestCount,
    sourcePackageId: body['sourcePackageId'] === undefined || body['sourcePackageId'] === null
      ? undefined
      : identifier(body['sourcePackageId'], 'Source package identifier'),
    targetBudget: body['targetBudget'] === undefined || body['targetBudget'] === null
      ? undefined
      : finiteMoney(body['targetBudget'], 'Target budget', true),
    menuPreferences: optionalText(body['menuPreferences'], 'Menu preferences', 2_000),
    dietaryNotes: optionalText(body['dietaryNotes'], 'Dietary notes', 2_000),
    setupPreferences: optionalText(body['setupPreferences'], 'Setup preferences', 2_000),
    requestedServices: requestedServices(body['requestedServices']),
    specialRequest: optionalText(body['specialRequest'], 'Special request', 2_000),
  };
}

export const customEventController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customEventService.submit(req.customer!.id, parseCustomEventRequest(req.body));
      res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
  },
  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customEventService.detail(req.customer!.id, identifier(req.params['id']));
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await customEventService.accept(
        req.customer!.id, identifier(req.params['id']), identifier(req.params['quoteId'], 'Quotation identifier'),
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
  async decline(req: Request, res: Response, next: NextFunction) {
    try {
      await customEventService.decline(
        req.customer!.id, identifier(req.params['id']), identifier(req.params['quoteId'], 'Quotation identifier'), req.body?.reason,
      );
      res.json({ success: true, message: 'Quotation declined.' });
    } catch (error) { next(error); }
  },
};
