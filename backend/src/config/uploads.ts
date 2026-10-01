import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { environment } from './environment.js';
import { FileSystemProofStorage } from '../services/proof-storage.service.js';

export const paymentProofUploadRoot = path.resolve(environment.paymentProofUploadRoot);
export const paymentProofTemporaryDirectory = path.join(paymentProofUploadRoot, '.tmp');

export async function ensurePaymentProofUploadDirectories(): Promise<void> {
  await mkdir(paymentProofTemporaryDirectory, { recursive: true, mode: 0o700 });
  await chmod(paymentProofUploadRoot, 0o700);
  await chmod(paymentProofTemporaryDirectory, 0o700);
}

export const proofStorage = new FileSystemProofStorage(paymentProofUploadRoot);
