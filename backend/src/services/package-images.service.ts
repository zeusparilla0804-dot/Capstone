import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../utils/app-error.js';

export type GalleryEntry = { id: number } | { assetPath: string } | { fileIndex: number };
export function validateGallery(value: unknown, fileCount: number): GalleryEntry[] {
  let entries: unknown;
  try { entries = typeof value === 'string' ? JSON.parse(value) : null; } catch { /* invalid JSON */ }
  if (!Array.isArray(entries) || !entries.length || entries.length > 12) throw new AppError(400, 'Choose between 1 and 12 package images.');
  const seen = new Set<string>();
  return entries.map(entry => {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 1) throw new AppError(400, 'Invalid gallery entry.');
    let result: GalleryEntry;
    if (Number.isSafeInteger(entry.id) && entry.id > 0) result = { id: entry.id };
    else if (Number.isSafeInteger(entry.fileIndex) && entry.fileIndex >= 0 && entry.fileIndex < fileCount) result = { fileIndex: entry.fileIndex };
    else if (typeof entry.assetPath === 'string' && /^assets\/images\/(?:packages|gallery)\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(entry.assetPath)) result = { assetPath: entry.assetPath };
    else throw new AppError(400, 'Invalid gallery image.');
    const key = JSON.stringify(result);
    if (seen.has(key)) throw new AppError(400, 'Each image may appear only once.');
    seen.add(key); return result;
  });
}
export async function validatePackageImage(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new AppError(413, 'Each image must be 5 MB or smaller.');
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime) || detected.mime !== mime) {
    throw new AppError(400, 'Choose JPEG, PNG, or WebP images.');
  }
  return { bytes, mime: detected.mime };
}
