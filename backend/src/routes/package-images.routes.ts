import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { requireAdmin } from '../middleware/auth.middleware.js';
import { packageImages, packageImageFile, replacePackageImages } from '../repositories/package-images.repository.js';
import { validateGallery, validatePackageImage } from '../services/package-images.service.js';
import { identifier } from '../utils/validation.js';
import { AppError } from '../utils/app-error.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 12, fields: 1, fieldSize: 12_000, parts: 13 } }).array('images', 12);
const imagesUpload: RequestHandler = (req, res, next) => upload(req, res, error => {
  if (error) return next(new AppError(400, 'Upload up to 12 JPEG, PNG, or WebP images, at most 5 MB each.'));
  next();
});
export const adminPackageImageRoutes = Router().use(requireAdmin)
  .get('/:id/images', async (req, res, next) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.json({ success: true, data: await packageImages(identifier(req.params['id'])) }); }
    catch (error) { next(error); }
  })
  .put('/:id/images', imagesUpload, async (req, res, next) => {
    try {
      const id = identifier(req.params['id']);
      const files = (req.files ?? []) as Express.Multer.File[];
      const entries = validateGallery(req.body?.gallery, files.length);
      const uploads = await Promise.all(files.map(file => validatePackageImage(file.buffer, file.mimetype)));
      res.json({ success: true, data: await replacePackageImages(id, entries, uploads) });
    } catch (error) { next(error); }
  });
export const publicPackageImageRoutes = Router().get('/:id/images/:imageId', async (req, res, next) => {
  try {
    const image = await packageImageFile(identifier(req.params['id']), identifier(req.params['imageId']));
    if (!image) throw new AppError(404, 'Package image not found.');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.type(image.mime).send(image.bytes);
  } catch (error) { next(error); }
});
