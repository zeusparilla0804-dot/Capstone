import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { assertSupportedOnlineMethod } from '../services/payment-method-policy.js';

export type OnlinePaymentMethod = 'BANK_TRANSFER' | 'E-WALLET';

export async function availableOnlinePaymentMethods(): Promise<OnlinePaymentMethod[]> {
  const result = await (await getDbPool()).request().query<{ method: OnlinePaymentMethod }>(`
    SELECT DISTINCT method FROM dbo.PAYMENT_DESTINATION
    WHERE is_available=1 AND DATALENGTH(image_bytes)>0
      AND method='BANK_TRANSFER' ORDER BY method`);
  return result.recordset.map(row => row.method);
}

export async function hasAvailablePaymentQr(method: OnlinePaymentMethod, transaction?: sql.Transaction): Promise<boolean> {
  assertSupportedOnlineMethod(method);
  const request = transaction ? new sql.Request(transaction) : (await getDbPool()).request();
  const result = await request.input('method', sql.NVarChar(30), method).query(`
    SELECT TOP (1) destination_id FROM dbo.PAYMENT_DESTINATION ${transaction ? 'WITH(UPDLOCK,HOLDLOCK)' : ''}
    WHERE method=@method AND is_available=1 AND DATALENGTH(image_bytes)>0`);
  return result.recordset.length > 0;
}
