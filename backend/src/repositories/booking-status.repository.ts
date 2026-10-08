import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { BookingActor, BookingStatus, BookingStatusHistory } from '../types/admin.types.js';

export async function withBookingStatusTransaction<T>(transaction: sql.Transaction, work: (request: sql.Request) => Promise<T>): Promise<T> {
  await transaction.begin();
  try {
    const result = await work(transaction.request());
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); } catch { /* Preserve the original failure. */ }
    throw error;
  }
}

export async function runBookingStatusTransaction<T>(work: (request: sql.Request) => Promise<T>): Promise<T> {
  return withBookingStatusTransaction(new sql.Transaction(await getDbPool()), work);
}

export async function lockedBookingStatus(reservationId: number, request: sql.Request): Promise<{ status: BookingStatus; customerId: number; eventDate: string; guestCount: number } | undefined> {
  const result = await request
    .replaceInput('reservationId', sql.Int, reservationId)
    .query<{ status: BookingStatus; customerId: number; eventDate: string; guestCount: number }>(`SELECT status,customer_id customerId,
      CONVERT(varchar(10),event_date,23) eventDate,guest_count guestCount
      FROM dbo.RESERVATION WITH(UPDLOCK,HOLDLOCK) WHERE reservation_id=@reservationId`);
  return result.recordset[0];
}

export async function setBookingStatusIfCurrent(reservationId: number, previousStatus: BookingStatus, nextStatus: BookingStatus, request: sql.Request, ownerCustomerId?: number): Promise<boolean> {
  const result = await request
    .replaceInput('reservationId', sql.Int, reservationId)
    .replaceInput('previousStatus', sql.NVarChar(40), previousStatus)
    .replaceInput('nextStatus', sql.NVarChar(40), nextStatus)
    .replaceInput('ownerCustomerId', sql.Int, ownerCustomerId ?? null)
    .query('UPDATE dbo.RESERVATION SET status=@nextStatus WHERE reservation_id=@reservationId AND status=@previousStatus AND (@ownerCustomerId IS NULL OR customer_id=@ownerCustomerId)');
  return (result.rowsAffected[0] ?? 0) === 1;
}

export async function insertBookingStatusHistory(input: { reservationId: number; previousStatus: BookingStatus; nextStatus: BookingStatus; actor: BookingActor; reason?: string }, request: sql.Request): Promise<void> {
  await request
    .replaceInput('reservationId', sql.Int, input.reservationId)
    .replaceInput('previousStatus', sql.NVarChar(40), input.previousStatus)
    .replaceInput('nextStatus', sql.NVarChar(40), input.nextStatus)
    .replaceInput('actorType', sql.NVarChar(20), input.actor.type)
    .replaceInput('actorId', sql.Int, input.actor.type === 'SYSTEM' ? null : input.actor.id)
    .replaceInput('reason', sql.NVarChar(1000), input.reason ?? null)
    .query(`INSERT dbo.BOOKING_STATUS_HISTORY(reservation_id,previous_status,next_status,actor_type,actor_id,reason)
            VALUES(@reservationId,@previousStatus,@nextStatus,@actorType,@actorId,@reason)`);
}

export async function bookingStatusHistory(reservationId: number, request?: sql.Request): Promise<BookingStatusHistory[]> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner
    .replaceInput('reservationId', sql.Int, reservationId)
    .query<BookingStatusHistory>(`SELECT booking_status_history_id id,previous_status previousStatus,next_status nextStatus,
      actor_type actorType,actor_id actorId,reason,created_at createdAt
      FROM dbo.BOOKING_STATUS_HISTORY WHERE reservation_id=@reservationId
      ORDER BY created_at DESC,booking_status_history_id DESC`);
  return result.recordset;
}
