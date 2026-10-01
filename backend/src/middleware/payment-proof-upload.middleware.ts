import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  MAX_PAYMENT_PROOF_BYTES,
  validateProofFile,
  type ValidatedProofFile
} from '../services/proof-storage.service.js';
import {
  ensurePaymentProofUploadDirectories,
  paymentProofTemporaryDirectory
} from '../config/uploads.js';
import { AppError } from '../utils/app-error.js';

declare global {
  namespace Express {
    interface Request {
      validatedPaymentProof?: ValidatedProofFile;
    }
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, paymentProofTemporaryDirectory),
    filename: (_request, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`)
  }),
  limits: {
    fileSize: MAX_PAYMENT_PROOF_BYTES,
    files: 1
  }
}).single('proof');

export async function paymentProofUpload(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  await ensurePaymentProofUploadDirectories();
  upload(request, response, (error) => {
    if (error) {
      next(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'Payment proof must not exceed 5 MB.')
        : error);
      return;
    }

    if (!request.file) {
      next(new AppError(400, 'One payment proof file is required.'));
      return;
    }

    void validateProofFile({
      path: request.file.path,
      originalFilename: request.file.originalname,
      declaredMimeType: request.file.mimetype,
      byteSize: request.file.size
    }).then((validated) => {
      request.validatedPaymentProof = validated;
      next();
    }, next);
  });
}
