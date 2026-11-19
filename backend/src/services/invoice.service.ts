import {createInvoice,findInvoice,findInvoiceIdByBooking,saveInvoiceRefund} from '../repositories/invoice.repository.js';import {AppError} from '../utils/app-error.js';
import { finiteMoney, isoDate, text } from '../utils/validation.js';

const manilaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});

export async function recordInvoiceRefund(invoiceId: number, adminId: number, input: unknown) {
  if (invoiceId > 2_147_483_647) throw new AppError(400, 'Invalid identifier.');
  const body = input as Record<string, unknown> | null;
  const amount = body?.amount;
  if (typeof amount !== 'number' || amount !== finiteMoney(amount, 'Refund amount', true)) {
    throw new AppError(400, 'Enter a valid refund amount with up to two decimal places.');
  }
  const reviewNote = body?.reviewNote === undefined ? undefined : text(body.reviewNote, 'Review note', { max: 1000 });
  if (amount === 0) {
    if (body?.refundDate !== undefined || body?.reference !== undefined) {
      throw new AppError(400, 'Leave the refund date and reference blank for a zero-refund decision.');
    }
    return saveInvoiceRefund(invoiceId, adminId, { amount, ...(reviewNote ? { reviewNote } : {}) });
  }

  const date = isoDate(body?.refundDate, 'Refund date');
  if (date < '0001-01-01' || date > manilaDate.format(new Date())) {
    throw new AppError(400, 'Enter a valid refund date on or before today.');
  }
  const reference = text(body?.reference, 'Refund reference', { max: 150 });
  return saveInvoiceRefund(invoiceId, adminId, { amount, date, reference, ...(reviewNote ? { reviewNote } : {}) });
}
export const invoiceService={async issue(bookingId:number,adminId:number){let id:number|undefined;try{id=await createInvoice(bookingId,adminId);}catch(error){if(error instanceof Error&&error.message==='INVOICE_STATUS')throw new AppError(409,'Invoice can only be issued for an approved booking.');throw error;}if(!id)throw new AppError(404,'Booking not found.');return findInvoice(id);},async customerInvoice(id:number,customerId:number){const invoice=await findInvoice(id,customerId);if(!invoice)throw new AppError(404,'Invoice not found.');return invoice;},async customerBookingInvoice(bookingId:number,customerId:number){const id=await findInvoiceIdByBooking(bookingId,customerId);if(!id)throw new AppError(404,'Invoice not found.');return this.customerInvoice(id,customerId);},async adminInvoice(id:number){const invoice=await findInvoice(id);if(!invoice)throw new AppError(404,'Invoice not found.');return invoice;}};
