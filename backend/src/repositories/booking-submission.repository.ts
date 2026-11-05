import sql from 'mssql';
import type { BookingRecord } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';

export async function lockedBookingSubmission(customerId: number, submissionKey: string, requestHash: string, request: sql.Request): Promise<BookingRecord | undefined> {
  // The composite primary key makes the missing-key read a serializable range lock.
  // Acquire it before any catalog, capacity, reservation, payment, or outbox work.
  const result = await request.input('customerId', sql.Int, customerId)
    .input('submissionKey', sql.UniqueIdentifier, submissionKey)
    .query<{ requestHash: string; reservationId: number; responseJson: string }>(`SELECT request_hash requestHash,reservation_id reservationId,response_json responseJson
      FROM dbo.BOOKING_SUBMISSION WITH(UPDLOCK,HOLDLOCK)
      WHERE customer_id=@customerId AND submission_key=@submissionKey`);
  const previous = result.recordset[0];
  if (!previous) return undefined;
  if (previous.requestHash !== requestHash) {
    throw new AppError(409, 'This submission key has already been used for different booking details. Review your bookings before submitting again.', 'BOOKING_SUBMISSION_CONFLICT');
  }
  const response = JSON.parse(previous.responseJson) as BookingRecord;
  if (!response || response.id !== Number(previous.reservationId)) throw new Error('Stored booking submission response is inconsistent.');
  return response;
}

export async function saveBookingSubmission(customerId: number, submissionKey: string, requestHash: string, response: BookingRecord, request: sql.Request): Promise<void> {
  await request.input('customerId', sql.Int, customerId).input('submissionKey', sql.UniqueIdentifier, submissionKey)
    .input('requestHash', sql.Char(64), requestHash).input('reservationId', sql.Int, response.id)
    .input('responseJson', sql.NVarChar(sql.MAX), JSON.stringify(response))
    .query(`INSERT dbo.BOOKING_SUBMISSION(customer_id,submission_key,request_hash,reservation_id,response_json)
      VALUES(@customerId,@submissionKey,@requestHash,@reservationId,@responseJson)`);
}
