import type { NextFunction, Request, Response } from 'express';
import { chmod } from 'node:fs/promises';
import multer from 'multer';
import {
  MAX_PAYMENT_PROOF_BYTES,
  validateProofFile,
  removeProofFileBestEffort,
  type ValidatedProofFile
} from '../services/proof-storage.service.js';
import {
  ensurePaymentProofUploadDirectories,
  paymentProofUploadRoot,
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

interface OnceEmitter {
  once(event: string, listener: () => void): unknown;
}

export function registerTemporaryProofCleanup(
  request: OnceEmitter,
  response: OnceEmitter,
  filePath: string,
  privateRoot = paymentProofUploadRoot
): void {
  let cleanupStarted = false;
  const cleanup = (): void => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    void removeProofFileBestEffort(filePath, 'request lifecycle cleanup', privateRoot);
  };
  request.once('aborted', cleanup);
  response.once('finish', cleanup);
  response.once('error', cleanup);
  response.once('close', cleanup);
}

function mapMulterError(error: multer.MulterError): AppError {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError(413, 'Payment proof must not exceed 5 MB.');
  }
  return new AppError(400, 'Upload exactly one payment proof using the proof field.');
}

export async function paymentProofUpload(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  await ensurePaymentProofUploadDirectories();
  upload(request, response, (error) => {
    if (error) {
      if (request.file?.path) {
        void removeProofFileBestEffort(request.file.path, 'multipart rejection cleanup', paymentProofUploadRoot);
      }
      next(error instanceof multer.MulterError ? mapMulterError(error) : error);
      return;
    }

    if (!request.file) {
      next(new AppError(400, 'One payment proof file is required.'));
      return;
    }

    const uploadedFile = request.file;
    void chmod(uploadedFile.path, 0o600).then(() => validateProofFile({
      path: uploadedFile.path,
      originalFilename: uploadedFile.originalname,
      declaredMimeType: uploadedFile.mimetype,
      byteSize: uploadedFile.size
    }, paymentProofUploadRoot)).then((validated) => {
      request.validatedPaymentProof = validated;
      registerTemporaryProofCleanup(request, response, validated.path);
      next();
    }, async (error) => {
      await removeProofFileBestEffort(uploadedFile.path, 'middleware validation cleanup', paymentProofUploadRoot);
      next(error);
    });
  });
}
