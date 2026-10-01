import { randomUUID } from 'node:crypto';
import { constants, type ReadStream } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath, unlink, type FileHandle } from 'node:fs/promises';
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
  privateRoot: string;
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

function normalizedForComparison(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function relativePrivatePath(privateRoot: string, filePath: string): { root: string; target: string; relative: string } {
  const root = path.resolve(privateRoot);
  const target = path.resolve(filePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new AppError(400, 'Payment proof path is outside the configured private root.');
  }
  return { root, target, relative };
}

async function inspectPrivatePath(
  privateRoot: string,
  filePath: string,
  expectedLeaf: 'file' | 'directory'
) {
  const { root, target, relative } = relativePrivatePath(privateRoot, filePath);
  const rootEntry = await lstat(root);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    throw new AppError(400, 'Configured private root must be a real directory.');
  }

  let current = root;
  const components = relative.split(path.sep);
  for (const [index, component] of components.entries()) {
    current = path.join(current, component);
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) {
      throw new AppError(400, 'Payment proof path contains a symbolic link or junction.');
    }
    const isLeaf = index === components.length - 1;
    if (!isLeaf && !entry.isDirectory()) {
      throw new AppError(400, 'Payment proof path contains a non-directory component.');
    }
    if (isLeaf && expectedLeaf === 'file' && !entry.isFile()) {
      throw new AppError(400, 'Payment proof must be a regular file.');
    }
    if (isLeaf && expectedLeaf === 'directory' && !entry.isDirectory()) {
      throw new AppError(400, 'Payment proof directory is not a real directory.');
    }
  }

  const rootRealPath = await realpath(root);
  const expectedRealPath = path.resolve(rootRealPath, relative);
  const actualRealPath = await realpath(target);
  if (normalizedForComparison(actualRealPath) !== normalizedForComparison(expectedRealPath)) {
    throw new AppError(400, 'Payment proof path resolves through a link or reparse point.');
  }
  return lstat(target);
}

export async function removeProofFileBestEffort(
  filePath: string,
  context: string,
  privateRoot = path.dirname(filePath)
): Promise<void> {
  try {
    await inspectPrivatePath(privateRoot, filePath, 'file');
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

function sameFileIdentity(left: Awaited<ReturnType<FileHandle['stat']>>, right: Awaited<ReturnType<typeof lstat>>): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function openRegularFile(filePath: string, privateRoot: string) {
  const before = await inspectPrivatePath(privateRoot, filePath, 'file');
  const handle = await open(filePath, constants.O_RDONLY | noFollowFlag);
  try {
    const details = await handle.stat();
    if (!details.isFile()) throw new AppError(400, 'Payment proof must be a regular file.');
    const after = await inspectPrivatePath(privateRoot, filePath, 'file');
    if (!sameFileIdentity(details, before) || !sameFileIdentity(details, after)) {
      throw new AppError(400, 'Payment proof path changed while it was being opened.');
    }
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

export async function validateProofFile(
  file: TemporaryProofFile,
  privateRoot = path.dirname(file.path)
): Promise<ValidatedProofFile> {
  const resolvedPrivateRoot = path.resolve(privateRoot);
  try {
    const { handle, details } = await openRegularFile(file.path, resolvedPrivateRoot);
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
    const detailsAfterRead = await handle.stat();
    const pathAfterRead = await inspectPrivatePath(resolvedPrivateRoot, file.path, 'file');
    if (
      !sameFileIdentity(detailsAfterRead, pathAfterRead) ||
      details.size !== detailsAfterRead.size ||
      details.mtimeMs !== detailsAfterRead.mtimeMs ||
      bytes.byteLength !== detailsAfterRead.size
    ) {
      await closeBestEffort(handle, 'changed validation source');
      throw new AppError(400, 'Payment proof changed while it was being validated.');
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
      byteSize: bytes.byteLength,
      extension,
      mimeType,
      bytes,
      privateRoot: resolvedPrivateRoot
    };
  } catch (error) {
    await removeProofFileBestEffort(file.path, 'validation rejection', resolvedPrivateRoot);
    throw error;
  }
}

export class FileSystemProofStorage implements ProofStorage {
  readonly #uploadRoot: string;
  readonly #proofDirectory: string;

  constructor(uploadRoot: string) {
    this.#uploadRoot = path.resolve(uploadRoot);
    this.#proofDirectory = path.resolve(this.#uploadRoot, 'payment-proofs');
  }

  async save(tempFile: ValidatedProofFile): Promise<StoredProof> {
    const filename = `${randomUUID()}.${tempFile.extension}`;
    const storageKey = `payment-proofs/${filename}`;
    const destination = path.join(this.#proofDirectory, filename);

    let destinationCreated = false;
    try {
      await mkdir(this.#proofDirectory, { recursive: true, mode: 0o700 });
      await chmod(this.#proofDirectory, 0o700);
      await inspectPrivatePath(this.#uploadRoot, this.#proofDirectory, 'directory');
      const destinationHandle = await open(
        destination,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600
      );
      destinationCreated = true;
      try {
        const destinationEntry = await inspectPrivatePath(this.#uploadRoot, destination, 'file');
        const destinationDetails = await destinationHandle.stat();
        if (!sameFileIdentity(destinationDetails, destinationEntry)) {
          throw new AppError(400, 'Payment proof destination changed while it was being created.');
        }
        await destinationHandle.writeFile(tempFile.bytes);
        await destinationHandle.sync();
        await destinationHandle.chmod(0o600);
      } catch (error) {
        await closeBestEffort(destinationHandle, 'failed destination write');
        throw error;
      }
      await destinationHandle.close();
      await removeProofFileBestEffort(tempFile.path, 'post-save temporary cleanup', tempFile.privateRoot);
      return {
        storageKey,
        originalFilename: tempFile.originalFilename,
        mimeType: tempFile.mimeType,
        byteSize: tempFile.bytes.byteLength
      };
    } catch (error) {
      if (destinationCreated) {
        await removeProofFileBestEffort(destination, 'failed destination cleanup', this.#uploadRoot);
      }
      await removeProofFileBestEffort(tempFile.path, 'failed save temporary cleanup', tempFile.privateRoot);
      throw error;
    }
  }

  async open(storageKey: string): Promise<ReadStream> {
    const filePath = this.#resolveKey(storageKey);
    const { handle } = await openRegularFile(filePath, this.#uploadRoot);
    return handle.createReadStream({ autoClose: true });
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.#resolveKey(storageKey);
    await inspectPrivatePath(this.#uploadRoot, filePath, 'file');
    await unlink(filePath);
  }

  #resolveKey(storageKey: string): string {
    const match = /^payment-proofs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i.exec(storageKey);
    if (!match?.[1] || !match[2]) throw new AppError(400, 'Invalid storage key.');

    const filePath = path.resolve(this.#proofDirectory, `${match[1]}.${match[2].toLowerCase()}`);
    if (path.dirname(filePath) !== this.#proofDirectory) throw new AppError(400, 'Invalid storage key.');
    return filePath;
  }
}
