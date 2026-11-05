import { Pipe, PipeTransform } from '@angular/core';

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value?.trim()) return 'Not recorded';
  switch (value.trim().toUpperCase()) {
    // Existing GCash values used by booking, payment proofs, and verified payments.
    case 'GCASH':
    case 'E_WALLET':
    case 'E-WALLET':
    case 'E WALLET':
      return 'GCash';
    case 'BANK_TRANSFER':
    case 'BANK-TRANSFER':
    case 'BANK TRANSFER':
      return 'Bank transfer';
    case 'CASH':
      return 'Cash';
    default:
      return value;
  }
}

@Pipe({ name: 'paymentMethodLabel' })
export class PaymentMethodLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return paymentMethodLabel(value);
  }
}
