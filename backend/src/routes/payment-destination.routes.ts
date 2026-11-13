import { Router, type NextFunction, type Request, type Response } from 'express';
import sql from 'mssql';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { getDbPool } from '../config/database.js';
import { requireAdmin, requireCustomer, requireProofActor } from '../middleware/auth.middleware.js';
import { AppError } from '../utils/app-error.js';
import { identifier, text } from '../utils/validation.js';
import { availableOnlinePaymentMethods } from '../repositories/payment-methods.repository.js';
import { assertSupportedOnlineMethod } from '../services/payment-method-policy.js';
import { listAdminBankOptions, listCustomerBankOptions, openCustomerBankQr } from '../services/payment-bank.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1_048_576, files: 1, fields: 5, parts: 6 } }).single('qr');
const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const activeStatuses = ['AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'CONFIRMED', 'COMPLETED'];

function run(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
}
function uploadQr(req: Request, res: Response, next: NextFunction) {
  upload(req, res, error => {
    if (error) return next(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? new AppError(413, 'QR image must be 1 MB or smaller.') : new AppError(400, 'Upload one QR image using the qr field.'));
    next();
  });
}
async function checkedImage(req: Request): Promise<{ bytes: Buffer; mime: string }> {
  if (!req.file?.buffer?.length) throw new AppError(400, 'Choose a QR image.');
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !allowedMime.has(detected.mime) || req.file.mimetype !== detected.mime) {
    throw new AppError(400, 'Choose a JPEG, PNG, or WebP QR image.');
  }
  return { bytes: req.file.buffer, mime: detected.mime };
}
function method(value: unknown): string {
  assertSupportedOnlineMethod(value);
  return value;
}
function metadata(req: Request) {
  return {
    method: method(req.body?.method),
    label: text(req.body?.label, 'Account label', { max: 100 }),
    name: text(req.body?.accountName, 'Account name', { max: 200 }),
    hint: text(req.body?.accountHint, 'Account number hint', { max: 50 }),
  };
}

export const adminPaymentDestinationRoutes = Router().use(requireAdmin)
  .get('/options', run(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await listAdminBankOptions() });
  }))
  .get('/', run(async (_req, res) => {
    const rows = await (await getDbPool()).request().query(`SELECT d.destination_id id,d.method,d.label,d.account_name accountName,
      d.account_hint accountHint,d.is_available isAvailable,d.updated_at updatedAt,
      (SELECT COUNT(*) FROM dbo.BOOKING_PAYMENT_DESTINATION a WHERE a.destination_id=d.destination_id) assignmentCount
      FROM dbo.PAYMENT_DESTINATION d WHERE d.method='BANK_TRANSFER' ORDER BY d.method,d.label`);
    res.json({ success: true, data: rows.recordset });
  }))
  .get('/waiting-bookings', run(async (_req, res) => {
    const rows = await (await getDbPool()).request().query(`SELECT r.reservation_id id,r.booking_reference reference,
      CONCAT(c.first_name,' ',c.last_name) customerName,e.event_type eventType,CONVERT(varchar(10),r.event_date,23) eventDate,
      CONVERT(varchar(5),r.event_time,108) eventTime,p.payment_method paymentMethod,p.amount_due amountDue,p.amount_paid amountPaid,
      assigned.label assignedQrLabel,assigned.account_hint assignedQrHint
      FROM dbo.RESERVATION r JOIN dbo.CUSTOMER c ON c.customer_id=r.customer_id
      JOIN dbo.EVENT e ON e.event_id=r.event_id JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
      LEFT JOIN dbo.BOOKING_PAYMENT_DESTINATION a ON a.reservation_id=r.reservation_id
      LEFT JOIN dbo.PAYMENT_DESTINATION assigned ON assigned.destination_id=a.destination_id
      WHERE r.status='AWAITING_PAYMENT' AND p.amount_paid<p.amount_due AND p.payment_method='BANK_TRANSFER'
        AND (assigned.destination_id IS NULL OR assigned.is_available=0 OR assigned.method<>p.payment_method)
      ORDER BY r.created_at DESC,r.reservation_id DESC`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: rows.recordset });
  }))
  .post('/', uploadQr, run(async (req, res) => {
    const data = metadata(req); const image = await checkedImage(req);
    const result = await (await getDbPool()).request()
      .input('method', sql.NVarChar(30), data.method).input('label', sql.NVarChar(100), data.label)
      .input('name', sql.NVarChar(200), data.name).input('hint', sql.NVarChar(50), data.hint)
      .input('mime', sql.NVarChar(30), image.mime).input('image', sql.VarBinary(sql.MAX), image.bytes)
      .query(`INSERT dbo.PAYMENT_DESTINATION(method,label,account_name,account_hint,image_mime,image_bytes)
        OUTPUT inserted.destination_id id VALUES(@method,@label,@name,@hint,@mime,@image)`);
    res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  }))
  .put('/:id', uploadQr, run(async (req, res) => {
    const id = identifier(req.params['id']); const data = metadata(req);
    const image = req.file ? await checkedImage(req) : null;
    const result = await (await getDbPool()).request().input('id', sql.Int, id)
      .input('method', sql.NVarChar(30), data.method).input('label', sql.NVarChar(100), data.label)
      .input('name', sql.NVarChar(200), data.name).input('hint', sql.NVarChar(50), data.hint)
      .input('mime', sql.NVarChar(30), image?.mime ?? null).input('image', sql.VarBinary(sql.MAX), image?.bytes ?? null)
      .query(`UPDATE dbo.PAYMENT_DESTINATION SET method=@method,label=@label,account_name=@name,account_hint=@hint,
        image_mime=COALESCE(@mime,image_mime),image_bytes=COALESCE(@image,image_bytes),updated_at=sysdatetime()
        WHERE destination_id=@id AND method='BANK_TRANSFER'`);
    if (!result.rowsAffected[0]) throw new AppError(404, 'QR account not found or its assigned payment method cannot be changed.');
    res.json({ success: true });
  }))
  .patch('/:id/availability', run(async (req, res) => {
    const id = identifier(req.params['id']);
    if (typeof req.body?.isAvailable !== 'boolean') throw new AppError(400, 'Availability must be true or false.');
    const result = await (await getDbPool()).request().input('id', sql.Int, id)
      .input('available', sql.Bit, req.body.isAvailable)
      .query("UPDATE dbo.PAYMENT_DESTINATION SET is_available=@available,updated_at=sysdatetime() WHERE destination_id=@id AND method='BANK_TRANSFER'");
    if (!result.rowsAffected[0]) throw new AppError(404, 'QR account not found.');
    res.json({ success: true });
  }))
  .get('/bookings/:id/assignment', run(async (req, res) => {
    const id = identifier(req.params['id']);
    const result = await (await getDbPool()).request().input('id', sql.Int, id).query(`SELECT d.destination_id id,d.method,d.label,d.account_name accountName,
      d.account_hint accountHint,d.is_available isAvailable
      FROM dbo.BOOKING_PAYMENT_DESTINATION a JOIN dbo.PAYMENT_DESTINATION d ON d.destination_id=a.destination_id
      WHERE a.reservation_id=@id AND d.method='BANK_TRANSFER'`);
    res.json({ success: true, data: result.recordset[0] ?? null });
  }))
  .put('/bookings/:id/assignment', run(async (req, res) => {
    const reservationId = identifier(req.params['id']); const destinationId = identifier(req.body?.destinationId, 'QR account');
    const transaction = new sql.Transaction(await getDbPool()); await transaction.begin();
    try {
      const booking = await new sql.Request(transaction).input('id', sql.Int, reservationId).query(`SELECT r.status,p.payment_method method,p.amount_due amountDue,p.amount_paid amountPaid
        FROM dbo.RESERVATION r WITH(UPDLOCK,HOLDLOCK) JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
        WHERE r.reservation_id=@id`);
      const row = booking.recordset[0];
      if (!row) throw new AppError(404, 'Booking not found.');
      assertSupportedOnlineMethod(row.method);
      if (!activeStatuses.includes(row.status) || Number(row.amountPaid) >= Number(row.amountDue)) throw new AppError(409, 'Booking is not awaiting payment.');
      const destination = await new sql.Request(transaction).input('id', sql.Int, destinationId)
        .query('SELECT method,is_available available FROM dbo.PAYMENT_DESTINATION WITH(UPDLOCK,HOLDLOCK) WHERE destination_id=@id');
      if (!destination.recordset[0]?.available) throw new AppError(409, 'This QR account is unavailable.');
      if (destination.recordset[0].method !== row.method) throw new AppError(409, 'QR account does not match the selected payment method.');
      await new sql.Request(transaction).input('reservationId', sql.Int, reservationId)
        .input('destinationId', sql.Int, destinationId).input('adminId', sql.Int, req.admin!.id)
        .query(`MERGE dbo.BOOKING_PAYMENT_DESTINATION WITH(HOLDLOCK) AS target
          USING (SELECT @reservationId reservation_id) source ON target.reservation_id=source.reservation_id
          WHEN MATCHED THEN UPDATE SET destination_id=@destinationId,assigned_by=@adminId,assigned_at=sysdatetime()
          WHEN NOT MATCHED THEN INSERT(reservation_id,destination_id,assigned_by) VALUES(@reservationId,@destinationId,@adminId);`);
      await transaction.commit(); res.json({ success: true });
    } catch (error) { try { await transaction.rollback(); } catch { /* preserve original */ } throw error; }
  }));

export const paymentDestinationRoutes = Router()
  .get('/bookings/:id/options', requireCustomer, run(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await listCustomerBankOptions(req.customer!.id, identifier(req.params['id'])) });
  }))
  .get('/bookings/:bookingId/options/:destinationId/image', requireCustomer, run(async (req, res) => {
    const image = await openCustomerBankQr(req.customer!.id, identifier(req.params['bookingId']),
      identifier(req.params['destinationId']), text(req.query['version'], 'Bank account version', { max: 64 }));
    res.setHeader('Cache-Control', 'no-store'); res.type(image.mime).send(image.bytes);
  }))
  .get('/methods', requireCustomer, run(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: await availableOnlinePaymentMethods() });
  }))
  .get('/bookings/:id', requireCustomer, run(async (req, res) => {
    const id = identifier(req.params['id']);
    const result = await (await getDbPool()).request().input('id', sql.Int, id).input('customerId', sql.Int, req.customer!.id)
      .query(`SELECT r.reservation_id bookingId,r.status,p.payment_method method,d.destination_id id,d.label,
        d.account_name accountName,d.account_hint accountHint,d.is_available isAvailable,d.method destinationMethod
        FROM dbo.RESERVATION r JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
        LEFT JOIN dbo.BOOKING_PAYMENT_DESTINATION a ON a.reservation_id=r.reservation_id
        LEFT JOIN dbo.PAYMENT_DESTINATION d ON d.destination_id=a.destination_id
        WHERE r.reservation_id=@id AND r.customer_id=@customerId`);
    const row = result.recordset[0]; if (!row) throw new AppError(404, 'Booking not found.');
    const assigned = !!row.id && row.isAvailable && row.method === 'BANK_TRANSFER' && row.method === row.destinationMethod && activeStatuses.includes(row.status);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: assigned ? { id: row.id, method: row.method, label: row.label,
      accountName: row.accountName, accountHint: row.accountHint } : null });
  }))
  .get('/:id/image', requireProofActor, run(async (req, res) => {
    const id = identifier(req.params['id']);
    const request = (await getDbPool()).request().input('id', sql.Int, id);
    if (req.customer) request.input('customerId', sql.Int, req.customer.id);
    const result = await request.query(`SELECT d.image_mime mime,d.image_bytes image FROM dbo.PAYMENT_DESTINATION d
      WHERE d.destination_id=@id AND d.method='BANK_TRANSFER' AND (${req.admin ? '1=1' : `d.is_available=1 AND EXISTS(
        SELECT 1 FROM dbo.BOOKING_PAYMENT_DESTINATION a JOIN dbo.RESERVATION r ON r.reservation_id=a.reservation_id
        JOIN dbo.PAYMENT p ON p.reservation_id=r.reservation_id
        WHERE a.destination_id=d.destination_id AND r.customer_id=@customerId AND p.payment_method=d.method
          AND r.status IN ('AWAITING_PAYMENT','PAYMENT_SUBMITTED','PAYMENT_VERIFIED','CONFIRMED','COMPLETED'))`})`);
    const row = result.recordset[0]; if (!row) throw new AppError(404, 'QR image not found.');
    res.setHeader('Cache-Control', 'no-store'); res.type(row.mime).send(row.image);
  }));
