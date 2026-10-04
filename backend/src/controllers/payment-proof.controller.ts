import type { NextFunction, Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { paymentProofService } from '../services/payment-proof.service.js';
import { AppError } from '../utils/app-error.js';

function id(request: Request): number {
  const value = request.params['id'];
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new AppError(400, 'Invalid identifier.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new AppError(400, 'Invalid identifier.');
  return parsed;
}

function publicProof<T extends { storageKey: string }>(proof: T): Omit<T, 'storageKey'> {
  const { storageKey: _storageKey, ...safe } = proof;
  return safe;
}

export function safeProofFilename(original: string): string {
  const leaf = original.split(/[\\/]/).at(-1) ?? '';
  const safe = leaf.replace(/[\x00-\x1f\x7f-\x9f"\\]/g, '_').replace(/[^\x20-\x7e]/g, '_').trim();
  return safe.slice(0, 180) || 'payment-proof';
}

export async function submitProof(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.validatedPaymentProof) throw new AppError(400, 'One payment proof file is required.');
    const proof = await paymentProofService.submitCustomerProof(request.customer!.id, id(request), request.body, request.validatedPaymentProof);
    response.status(201).json({ success: true, data: publicProof(proof) });
  } catch (error) { next(error); }
}

export async function listCustomerProofs(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const proofs = await paymentProofService.listCustomerProofs(request.customer!.id, id(request));
    response.json({ success: true, data: proofs.map(publicProof) });
  } catch (error) { next(error); }
}

export async function downloadProof(request: Request, response: Response, next: NextFunction): Promise<void> {
  let stream: Readable | undefined;
  let terminal = false;
  const closed = () => response.destroyed || response.closed || response.writableEnded;
  const stop = () => {
    terminal = true;
    stream?.unpipe(response);
    stream?.destroy();
  };
  const fail = (error: unknown) => {
    if (terminal || closed()) { stop(); return; }
    stop();
    if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
    else next(error);
  };
  response.once('close', stop);
  response.once('finish', stop);
  try {
    const actor = request.admin ? { type: 'ADMIN' as const, id: request.admin.id } : { type: 'CUSTOMER' as const, id: request.customer!.id };
    const opened = await paymentProofService.openAuthorizedProof(actor, id(request));
    const { proof } = opened;
    stream = opened.stream;
    // Keep the guarded handler attached to absorb repeated or late stream errors.
    stream.on('error', fail);
    if (terminal || closed()) { stop(); return; }
    response.setHeader('Content-Type', proof.mimeType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    const disposition = request.query?.['view'] === 'inline' ? 'inline' : 'attachment';
    response.setHeader('Content-Disposition', `${disposition}; filename="${safeProofFilename(proof.originalFilename)}"`);
    stream.pipe(response);
  } catch (error) { fail(error); }
}
