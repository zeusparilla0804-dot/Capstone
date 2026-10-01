import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { AppError } from '../utils/app-error.js';

export const MAX_PAYMENT_PROOF_BYTES = 5_242_880;

type ProofExtension = 'jpg' | 'png' | 'webp';
type ProofMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const mimeToExtension: Record<ProofMimeType, ProofExtension> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export interface TemporaryProofFile {
  path: string;
  originalFilename: string;
  declaredMimeType: string;
  byteSize: number;
}

export interface ValidatedProofFile extends TemporaryProofFile {
  extension: ProofExtension;
  mimeType: ProofMimeType;
}

export interface StoredProof {
  storageKey: string;
  originalFilename: string;
  mimeType: ProofMimeType;
  byteSize: number;
}

export interface ProofStorage {
  save(tempFile: ValidatedProofFile): Promise<StoredProof>;
  open(storageKey: string): Promise<ReadStream>;
  delete(storageKey: string): Promise<void>;
}

async function removeTemporaryFile(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

function filenameExtension(filename: string): ProofExtension | undefined {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (extension === 'jpeg') return 'jpg';
  if (extension === 'jpg' || extension === 'png' || extension === 'webp') return extension;
  return undefined;
}

export async function validateProofFile(file: TemporaryProofFile): Promise<ValidatedProofFile> {
  try {
    const details = await stat(file.path);
    if (details.size > MAX_PAYMENT_PROOF_BYTES) {
      throw new AppError(413, 'Payment proof must not exceed 5 MB.');
    }

    const detected = await fileTypeFromFile(file.path);
    if (!detected || !(detected.mime in mimeToExtension)) {
      throw new AppError(400, 'Payment proof must be a JPEG, PNG, or WebP image.');
    }

    const mimeType = detected.mime as ProofMimeType;
    const extension = mimeToExtension[mimeType];
    if (filenameExtension(file.originalFilename) !== extension || file.declaredMimeType !== mimeType) {
      throw new AppError(400, 'Payment proof extension or content type does not match its file signature.');
    }

    return {
      ...file,
      byteSize: details.size,
      extension,
      mimeType
    };
  } catch (error) {
    await removeTemporaryFile(file.path);
    throw error;
  }
}

export class FileSystemProofStorage implements ProofStorage {
  readonly #proofDirectory: string;

  constructor(uploadRoot: string) {
    this.#proofDirectory = path.resolve(uploadRoot, 'payment-proofs');
  }

  async save(tempFile: ValidatedProofFile): Promise<StoredProof> {
    const filename = `${randomUUID()}.${tempFile.extension}`;
    const storageKey = `payment-proofs/${filename}`;
    const destination = path.join(this.#proofDirectory, filename);

    try {
      await mkdir(this.#proofDirectory, { recursive: true });
      await rename(tempFile.path, destination);
      return {
        storageKey,
        originalFilename: tempFile.originalFilename,
        mimeType: tempFile.mimeType,
        byteSize: tempFile.byteSize
      };
    } catch (error) {
      await removeTemporaryFile(tempFile.path);
      throw error;
    }
  }

  async open(storageKey: string): Promise<ReadStream> {
    const filePath = this.#resolveKey(storageKey);
    await stat(filePath);
    return createReadStream(filePath);
  }

  async delete(storageKey: string): Promise<void> {
    await unlink(this.#resolveKey(storageKey));
  }

  #resolveKey(storageKey: string): string {
    const match = /^payment-proofs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.exec(storageKey);
    if (!match?.[1] || !match[2]) throw new AppError(400, 'Invalid storage key.');

    const filePath = path.resolve(this.#proofDirectory, `${match[1]}.${match[2].toLowerCase()}`);
    if (path.dirname(filePath) !== this.#proofDirectory) throw new AppError(400, 'Invalid storage key.');
    return filePath;
  }
}
