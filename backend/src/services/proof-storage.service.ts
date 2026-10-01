import { randomUUID } from 'node:crypto';
import { constants, type ReadStream } from 'node:fs';
import { chmod, mkdir, open, unlink, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../utils/app-error.js';
import { logger } from '../utils/logger.js';

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
  bytes: Buffer;
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

export async function removeProofFileBestEffort(filePath: string, context: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    try {
      logger.warn('payment_proof.cleanup_failed', `${context}: ${String(error)}`);
    } catch {
      // Cleanup and logging must never replace the primary request/storage error.
    }
  }
}

const noFollowFlag = (constants as unknown as Record<string, number>)['O_NOFOLLOW'] ?? 0;

async function closeBestEffort(handle: FileHandle, context: string): Promise<void> {
  try {
    await handle.close();
  } catch (error) {
    try {
      logger.warn('payment_proof.close_failed', `${context}: ${String(error)}`);
    } catch {
      // Logging must not replace an earlier file operation error.
    }
  }
}

async function readBounded(handle: FileHandle): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(MAX_PAYMENT_PROOF_BYTES + 1);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.byteLength - offset, null);
    if (bytesRead === 0) break;
    offset += bytesRead;
  }
  if (offset > MAX_PAYMENT_PROOF_BYTES) {
    throw new AppError(413, 'Payment proof must not exceed 5 MB.');
  }
  return Buffer.from(buffer.subarray(0, offset));
}

async function openRegularFile(filePath: string) {
  const handle = await open(filePath, constants.O_RDONLY | noFollowFlag);
  try {
    const details = await handle.stat();
    if (!details.isFile()) throw new AppError(400, 'Payment proof must be a regular file.');
    return { handle, details };
  } catch (error) {
    await closeBestEffort(handle, 'regular-file validation');
    throw error;
  }
}

function filenameExtension(filename: string): ProofExtension | undefined {
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (extension === 'jpeg') return 'jpg';
  if (extension === 'jpg' || extension === 'png' || extension === 'webp') return extension;
  return undefined;
}

export async function validateProofFile(file: TemporaryProofFile): Promise<ValidatedProofFile> {
  try {
    const { handle, details } = await openRegularFile(file.path);
    if (details.size > MAX_PAYMENT_PROOF_BYTES) {
      await closeBestEffort(handle, 'oversized validation');
      throw new AppError(413, 'Payment proof must not exceed 5 MB.');
    }

    let bytes: Buffer;
    try {
      bytes = await readBounded(handle);
    } catch (error) {
      await closeBestEffort(handle, 'failed validation read');
      throw error;
    }
    await handle.close();

    const detected = await fileTypeFromBuffer(bytes);
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
      mimeType,
      bytes
    };
  } catch (error) {
    await removeProofFileBestEffort(file.path, 'validation rejection');
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

    let destinationCreated = false;
    try {
      await mkdir(this.#proofDirectory, { recursive: true, mode: 0o700 });
      await chmod(this.#proofDirectory, 0o700);
      const destinationHandle = await open(
        destination,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600
      );
      destinationCreated = true;
      try {
        await destinationHandle.writeFile(tempFile.bytes);
        await destinationHandle.sync();
        await destinationHandle.chmod(0o600);
      } catch (error) {
        await closeBestEffort(destinationHandle, 'failed destination write');
        throw error;
      }
      await destinationHandle.close();
      await removeProofFileBestEffort(tempFile.path, 'post-save temporary cleanup');
      return {
        storageKey,
        originalFilename: tempFile.originalFilename,
        mimeType: tempFile.mimeType,
        byteSize: tempFile.byteSize
      };
    } catch (error) {
      if (destinationCreated) {
        await removeProofFileBestEffort(destination, 'failed destination cleanup');
      }
      await removeProofFileBestEffort(tempFile.path, 'failed save temporary cleanup');
      throw error;
    }
  }

  async open(storageKey: string): Promise<ReadStream> {
    const filePath = this.#resolveKey(storageKey);
    const { handle } = await openRegularFile(filePath);
    return handle.createReadStream({ autoClose: true });
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
