import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { AppError } from '../utils/app-error.js';
import { findCustomerBookings } from '../repositories/booking.repository.js';
import { assertCashPaymentWindow } from './cash-payment-policy.js';
import { assertPaymentSelection } from './booking-payment-policy.js';
import { hasAvailablePaymentQr } from '../repositories/payment-methods.repository.js';

export async function chooseBookingPayment(customerId: number, reservationId: number, method: string) {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    const result = await request.input('customerId', sql.Int, customerId)
      .input('reservationId', sql.Int, reservationId).query(`
        SELECT r.status,CONVERT(varchar(10),r.event_date,23) eventDate,r.guest_count guestCount,
          p.payment_method method,p.amount_paid amountPaid,
          CASE WHEN EXISTS(SELECT 1 FROM dbo.PAYMENT_PROOF WITH(UPDLOCK,HOLDLOCK)
            WHERE reservation_id=@reservationId) THEN 1 ELSE 0 END hasProof
        FROM dbo.RESERVATION r WITH(UPDLOCK,HOLDLOCK)
        JOIN dbo.PAYMENT p WITH(UPDLOCK,HOLDLOCK) ON p.reservation_id=r.reservation_id
        WHERE r.reservation_id=@reservationId AND r.customer_id=@customerId`);
    const booking = result.recordset[0];
    if (!booking) throw new AppError(404, 'Booking not found.');
    const selected = assertPaymentSelection({ status: booking.status, method: booking.method,
      amountPaid: Number(booking.amountPaid), hasProof: Boolean(booking.hasProof) }, method);
    if (selected !== 'CASH' && !await hasAvailablePaymentQr(selected, transaction)) {
      throw new AppError(409, 'This payment method has no available QR. Choose another available method.');
    }
    if (selected === 'CASH') assertCashPaymentWindow(String(booking.eventDate), Number(booking.guestCount), new Date(), 409);
    if (booking.method !== selected) {
      const update = await new sql.Request(transaction).input('reservationId', sql.Int, reservationId)
        .input('method', sql.NVarChar(50), selected)
        .query(`UPDATE dbo.PAYMENT SET payment_method=@method
          WHERE reservation_id=@reservationId AND amount_paid=0
            AND NOT EXISTS(SELECT 1 FROM dbo.PAYMENT_PROOF WHERE reservation_id=@reservationId)`);
      if (update.rowsAffected[0] !== 1) throw new AppError(409, 'Payment method can no longer be changed.');
    }
    await transaction.commit();
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve original error. */ }
    throw error;
  }
  const bookings = await findCustomerBookings(customerId);
  return bookings.find(booking => booking.id === reservationId)!;
}
