/** A presentation state derived only from recorded money and the latest proof decision. */
export function paymentDisplayStatus(input: {
  readonly total: number;
  readonly amountPaid: number;
  readonly status: string;
  readonly latestProofStatus?: string | null;
}): string | null {
  const status = input.status.toLowerCase();
  if (['cancelled', 'rejected', 'expired'].includes(status)) return null;

  const total = Math.round(input.total * 100);
  const paid = Math.round(input.amountPaid * 100);
  const proof = input.latestProofStatus?.toUpperCase();
  if (Number.isFinite(total) && Number.isFinite(paid) && total > 0 && paid >= total) return 'fully_paid';
  if (proof === 'SUBMITTED' || status === 'payment_submitted') return 'pending_payment_verification';
  if (Number.isFinite(total) && Number.isFinite(paid) && total > 0 && paid >= Math.round(total * 0.5)) return 'down_payment_verified';
  if (proof === 'REJECTED' && paid < Math.round(total * 0.5)) return 'payment_rejected';
  if (paid > 0) return 'partially_paid';
  return null;
}

export function adminPaymentDisplayStatus(input: Parameters<typeof paymentDisplayStatus>[0]): string | null {
  const state = paymentDisplayStatus(input);
  return state === 'pending_payment_verification' ? 'pending_verification' : state;
}
