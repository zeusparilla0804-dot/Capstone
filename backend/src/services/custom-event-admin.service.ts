import {
  createAndSendCustomQuote,
  findAdminCustomEventRequest,
  listAdminCustomEventRequests,
  rejectCustomEventRequest,
  requestCustomEventClarification,
} from '../repositories/custom-event.repository.js';
import type {
  AdminCustomEventQuery,
  CustomEventRequestDetail,
  CustomEventRequestStatus,
  CustomQuote,
  SendCustomQuoteInput,
} from '../types/custom-event.types.js';
import type { PageResult } from '../types/admin.types.js';
import { AppError } from '../utils/app-error.js';
import { isoDate, text } from '../utils/validation.js';
import { calculateQuoteTotals, type QuoteLineInput } from './custom-quote-domain.service.js';

const requestStatuses: readonly CustomEventRequestStatus[] = [
  'AWAITING_QUOTE', 'NEEDS_CLARIFICATION', 'QUOTE_SENT', 'ACCEPTED', 'DECLINED', 'REJECTED', 'EXPIRED',
];

type QueueResult = PageResult<import('../types/custom-event.types.js').AdminCustomEventQueueItem>;

export interface CustomEventAdminDependencies {
  list(input: AdminCustomEventQuery): Promise<QueueResult>;
  detail(requestId: number): Promise<CustomEventRequestDetail | undefined>;
  sendQuote(adminId: number, requestId: number, input: SendCustomQuoteInput): Promise<CustomQuote>;
  clarify(adminId: number, requestId: number, reason: string): Promise<void>;
  reject(adminId: number, requestId: number, reason: string): Promise<void>;
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'Request body is invalid.');
  return value as Record<string, unknown>;
}

function reasonBody(value: unknown): string {
  return text(objectBody(value)['reason'], 'Reason', { max: 1_000 });
}

export function createCustomEventAdminService(deps: CustomEventAdminDependencies) {
  return {
    async list(raw: Record<string, unknown>): Promise<QueueResult> {
      const page = Math.max(Number(raw['page']) || 1, 1);
      const pageSize = Math.min(Math.max(Number(raw['pageSize']) || 20, 1), 100);
      const status = typeof raw['status'] === 'string' ? raw['status'].trim().toUpperCase() : '';
      if (status && !requestStatuses.includes(status as CustomEventRequestStatus)) {
        throw new AppError(400, 'Custom request status is invalid.');
      }
      const search = typeof raw['search'] === 'string' ? raw['search'].trim() : '';
      if (search.length > 100) throw new AppError(400, 'Search is too long.');
      return deps.list({ page, pageSize, status: status as CustomEventRequestStatus | '', search });
    },
    async detail(requestId: number): Promise<CustomEventRequestDetail> {
      const result = await deps.detail(requestId);
      if (!result) throw new AppError(404, 'Custom event request not found.');
      return result;
    },
    async sendQuote(adminId: number, requestId: number, value: unknown): Promise<CustomQuote> {
      const body = objectBody(value);
      if (!Array.isArray(body['items'])) throw new AppError(400, 'Quotation lines are required.');
      const items: QuoteLineInput[] = body['items'].map(raw => {
        const item = objectBody(raw);
        return {
          description: typeof item['description'] === 'string' ? item['description'].trim() : '',
          quantity: Number(item['quantity']),
          unitPrice: Number(item['unitPrice']),
        };
      });
      const requiredDownPayment = Number(body['requiredDownPayment']);
      const totals = calculateQuoteTotals(items, requiredDownPayment);
      const validUntil = isoDate(body['validUntil'], 'Quotation validity date', true);
      const terms = body['terms'] === undefined || body['terms'] === null || body['terms'] === ''
        ? null
        : text(body['terms'], 'Quotation terms', { max: 4_000 });
      return deps.sendQuote(adminId, requestId, {
        items: items.map((item, index) => ({ ...item, lineTotal: totals.lineTotals[index]! })),
        subtotal: totals.subtotal,
        total: totals.total,
        requiredDownPayment: totals.requiredDownPayment,
        validUntil,
        terms,
      });
    },
    async requestClarification(adminId: number, requestId: number, value: unknown): Promise<void> {
      return deps.clarify(adminId, requestId, reasonBody(value));
    },
    async reject(adminId: number, requestId: number, value: unknown): Promise<void> {
      return deps.reject(adminId, requestId, reasonBody(value));
    },
  };
}

export const customEventAdminService = createCustomEventAdminService({
  list: listAdminCustomEventRequests,
  detail: findAdminCustomEventRequest,
  sendQuote: createAndSendCustomQuote,
  clarify: requestCustomEventClarification,
  reject: rejectCustomEventRequest,
});
