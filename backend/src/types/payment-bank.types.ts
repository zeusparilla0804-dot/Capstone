export interface PaymentBankSnapshot {
  destinationId: number;
  destinationLabel: string;
  destinationAccountName: string;
  destinationAccountHint: string;
  destinationVersion: string;
}

export interface PaymentBankOption {
  id: number;
  method: 'BANK_TRANSFER';
  label: string;
  accountName: string;
  accountHint: string;
  version: string;
}
