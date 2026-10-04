import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { AddOnRecord, PackageRecord } from '../types/domain.types.js';

export async function findPackages(): Promise<PackageRecord[]> {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT p.package_id, p.package_name, p.description, p.price_per_head, p.min_guest, p.max_guest,
      e.event_type, m.item_name
    FROM dbo.PACKAGE p JOIN dbo.EVENT e ON e.event_id = p.event_id
    LEFT JOIN dbo.MENU_ITEM m ON m.package_id = p.package_id
    WHERE p.is_active = 1 ORDER BY p.package_id, m.menu_item_id`);
  const packages = new Map<number, PackageRecord>();
  for (const row of result.recordset) {
    const id = Number(row.package_id);
    const item: PackageRecord = packages.get(id) ?? { id, name: row.package_name, category: String(row.event_type).toLowerCase(), description: row.description ?? '', pricePerGuest: Number(row.price_per_head), minGuests: row.min_guest, maxGuests: row.max_guest, features: [] };
    if (row.item_name) item.features.push({ label: row.item_name });
    packages.set(id, item);
  }
  return [...packages.values()];
}

export async function findPackageById(id: number, request?: sql.Request): Promise<PackageRecord | undefined> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner.input('id', sql.Int, id).query(`
    SELECT p.package_id, p.package_name, p.description, p.price_per_head, p.min_guest, p.max_guest, e.event_type
    FROM dbo.PACKAGE p JOIN dbo.EVENT e ON e.event_id = p.event_id
    WHERE p.package_id = @id AND p.is_active = 1`);
  const row = result.recordset[0];
  return row ? { id: Number(row.package_id), name: row.package_name, category: String(row.event_type).toLowerCase(), description: row.description ?? '', pricePerGuest: Number(row.price_per_head), minGuests: row.min_guest, maxGuests: row.max_guest, features: [] } : undefined;
}

export async function findAddOns(ids?: number[], request?: sql.Request): Promise<AddOnRecord[]> {
  const runner = request ?? (await getDbPool()).request();
  let where = 'WHERE is_active = 1';
  if (ids) {
    if (!ids.length) return [];
    const parameters = ids.map((id, index) => { runner.input(`id${index}`, sql.Int, id); return `@id${index}`; });
    where += ` AND add_on_id IN (${parameters.join(',')})`;
  }
  const result = await runner.query(`SELECT add_on_id, add_on_name, description, price FROM dbo.ADD_ON ${where} ORDER BY add_on_name`);
  return result.recordset.map((row) => ({ id: Number(row.add_on_id), name: row.add_on_name, description: row.description ?? '', price: Number(row.price) }));
}
