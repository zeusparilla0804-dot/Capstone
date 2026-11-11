import sql from 'mssql';
import { getDbPool } from '../config/database.js';
import { AppError } from '../utils/app-error.js';
import type { GalleryEntry } from '../services/package-images.service.js';

export async function packageImages(packageId?: number) {
  const request = (await getDbPool()).request();
  if (packageId !== undefined) request.input('packageId', sql.Int, packageId);
  const result = await request.query(`SELECT image_id id,package_id packageId,asset_path assetPath
    FROM dbo.PACKAGE_IMAGE ${packageId === undefined ? '' : 'WHERE package_id=@packageId'} ORDER BY package_id,sort_order`);
  return result.recordset.map(row => ({ id: Number(row.id), packageId: Number(row.packageId),
    url: row.assetPath ?? `/api/packages/${row.packageId}/images/${row.id}` }));
}
export async function replacePackageImages(packageId: number, entries: readonly GalleryEntry[], uploads: readonly { bytes: Buffer; mime: string }[]) {
  const transaction = new sql.Transaction(await getDbPool());
  await transaction.begin();
  try {
    const pkg = await new sql.Request(transaction).input('id', sql.Int, packageId)
      .query('SELECT package_id FROM dbo.PACKAGE WITH(UPDLOCK,HOLDLOCK) WHERE package_id=@id');
    if (!pkg.recordset.length) throw new AppError(404, 'Package not found.');
    const old = await new sql.Request(transaction).input('id', sql.Int, packageId)
      .query('SELECT image_id id,asset_path assetPath,image_mime mime,image_bytes bytes FROM dbo.PACKAGE_IMAGE WHERE package_id=@id');
    const images = entries.map(entry => {
      if ('id' in entry) {
        const found = old.recordset.find(row => Number(row.id) === entry.id);
        if (!found) throw new AppError(409, 'The package images changed. Reload and try again.');
        return { assetPath: found.assetPath ?? null, mime: found.mime ?? null, bytes: found.bytes ?? null };
      }
      if ('assetPath' in entry) return { assetPath: entry.assetPath, mime: null, bytes: null };
      const file = uploads[entry.fileIndex];
      if (!file) throw new AppError(400, 'A selected image is missing.');
      return { assetPath: null, ...file };
    });
    await new sql.Request(transaction).input('id', sql.Int, packageId).query('DELETE dbo.PACKAGE_IMAGE WHERE package_id=@id');
    for (const [order, image] of images.entries()) {
      await new sql.Request(transaction).input('id', sql.Int, packageId).input('order', sql.Int, order)
        .input('asset', sql.NVarChar(300), image.assetPath).input('mime', sql.NVarChar(30), image.mime)
        .input('bytes', sql.VarBinary(sql.MAX), image.bytes)
        .query('INSERT dbo.PACKAGE_IMAGE(package_id,sort_order,asset_path,image_mime,image_bytes) VALUES(@id,@order,@asset,@mime,@bytes)');
    }
    await transaction.commit();
  } catch (error) { try { await transaction.rollback(); } catch { /* preserve original error */ } throw error; }
  return packageImages(packageId);
}
export async function packageImageFile(packageId: number, imageId: number) {
  const result = await (await getDbPool()).request().input('packageId', sql.Int, packageId).input('imageId', sql.Int, imageId)
    .query('SELECT image_mime mime,image_bytes bytes FROM dbo.PACKAGE_IMAGE WHERE package_id=@packageId AND image_id=@imageId AND image_bytes IS NOT NULL');
  return result.recordset[0] as { mime: string; bytes: Buffer } | undefined;
}
