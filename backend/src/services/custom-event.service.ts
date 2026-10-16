import {
  acceptCustomQuote,
  declineCustomQuote,
  findOwnedCustomEventRequest,
  submitCustomEventRequest,
} from '../repositories/custom-event.repository.js';
import type { CreateCustomEventRequestDto } from '../types/custom-event.types.js';
import { AppError } from '../utils/app-error.js';
import { text } from '../utils/validation.js';

export const customEventService = {
  submit(customerId: number, input: CreateCustomEventRequestDto) {
    return submitCustomEventRequest(customerId, input);
  },
  async detail(customerId: number, requestId: number) {
    const request = await findOwnedCustomEventRequest(customerId, requestId);
    if (!request) throw new AppError(404, 'Custom event request not found.');
    return request;
  },
  accept(customerId: number, requestId: number, quoteId: number) {
    return acceptCustomQuote(customerId, requestId, quoteId);
  },
  decline(customerId: number, requestId: number, quoteId: number, rawReason?: unknown) {
    const reason = rawReason === undefined || rawReason === null || rawReason === ''
      ? undefined
      : text(rawReason, 'Decline reason', { max: 1_000 });
    return declineCustomQuote(customerId, requestId, quoteId, reason);
  },
};
