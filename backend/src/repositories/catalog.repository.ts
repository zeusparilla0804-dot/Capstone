import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import type { AddOnRecord, PackageRecord } from '../types/domain.types.js';
import { addOnEventTypes } from '../services/add-on-event-policy.js';
import { packageImages } from './package-images.repository.js';

type PackageRow = Record<string, unknown>;

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function mapPackageRows(rows: PackageRow[]): PackageRecord[] {
  const packages = new Map<number, PackageRecord>();
  for (const row of rows) {
    const id = Number(row['package_id']);
    const item: PackageRecord = packages.get(id) ?? {
      id,
      name: String(row['package_name']),
      category: String(row['event_type']).toLowerCase(),
      description: String(row['description'] ?? ''),
      pricingType: String(row['pricing_type']) as PackageRecord['pricingType'],
      pricePerGuest: nullableNumber(row['price_per_head']),
      basePrice: nullableNumber(row['base_price']),
      includedGuests: nullableNumber(row['included_guests']),
      excessGuestPrice: nullableNumber(row['excess_guest_price']),
      minGuests: nullableNumber(row['min_guest']),
      maxGuests: nullableNumber(row['max_guest']),
      features: [],
    };
    if (row['item_name']) item.features.push({ label: String(row['item_name']) });
    packages.set(id, item);
  }
  return [...packages.values()];
}

export async function findPackages(): Promise<PackageRecord[]> {
  const pool = await getDbPool();
  const result = await pool.request().query(`
    SELECT p.package_id, p.package_name, p.description, p.pricing_type, p.price_per_head,
      p.base_price, p.included_guests, p.excess_guest_price, p.min_guest, p.max_guest,
      e.event_type, m.item_name
    FROM dbo.PACKAGE p JOIN dbo.EVENT e ON e.event_id = p.event_id
    LEFT JOIN dbo.MENU_ITEM m ON m.package_id = p.package_id
    WHERE p.is_active = 1 ORDER BY p.package_id, m.menu_item_id`);
  const images = await packageImages();
  return mapPackageRows(result.recordset).map(item => ({ ...item,
    galleryImageUrls: images.filter(image => image.packageId === item.id).map(image => image.url) }));
}

export async function findPackageById(id: number, request?: sql.Request): Promise<PackageRecord | undefined> {
  const runner = request ?? (await getDbPool()).request();
  const result = await runner.input('id', sql.Int, id).query(`
    SELECT p.package_id, p.package_name, p.description, p.pricing_type, p.price_per_head,
      p.base_price, p.included_guests, p.excess_guest_price, p.min_guest, p.max_guest, e.event_type
    FROM dbo.PACKAGE p JOIN dbo.EVENT e ON e.event_id = p.event_id
    WHERE p.package_id = @id AND p.is_active = 1`);
  const row = result.recordset[0];
  return row ? mapPackageRows([row])[0] : undefined;
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
  return result.recordset.map((row) => ({ id: Number(row.add_on_id), name: row.add_on_name, description: row.description ?? '', price: Number(row.price), eventTypes: addOnEventTypes(String(row.add_on_name)) }));
}
