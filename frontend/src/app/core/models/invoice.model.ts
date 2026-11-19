import type { MenuSelectionSnapshot } from './menu.model';
import type { PaymentBankDetails } from './payment-proof.model';
export interface InvoiceItem{readonly description:string;readonly quantity:number;readonly unitPrice:number;readonly amount:number;}
export interface InvoicePayment extends PaymentBankDetails{readonly id:number;readonly date:string;readonly reference?:string;readonly method:string;readonly amount:number;readonly status:string;}
type CancellationAssessment =
  | { readonly kind: 'EARLY'; readonly date: string; readonly forfeitedAmount: number; readonly refundableAmount: number }
  | { readonly kind: 'ADMIN_REVIEW'; readonly date: string };

export interface RecordedInvoiceRefund {
  readonly status: 'REFUNDED' | 'NO_REFUND_DUE';
  readonly amount: number;
  readonly date?: string;
  readonly reference?: string;
  readonly reviewNote?: string;
}

export type InvoiceRefund =
  | { readonly status: 'PENDING_REFUND'; readonly amount: number }
  | { readonly status: 'ADMIN_REVIEW' }
  | RecordedInvoiceRefund;

export interface RecordInvoiceRefund {
  readonly amount: number;
  readonly refundDate?: string;
  readonly reference?: string;
  readonly reviewNote?: string;
}

export interface Invoice {
  readonly invoiceId: number;
  readonly invoiceNumber: string;
  readonly issueDate: string;
  readonly dueDate?: string;
  readonly status: string;
  readonly issuer?: { readonly name: string };
  readonly customer: { readonly id: number; readonly name: string; readonly email: string; readonly phone: string };
  readonly booking: {
    readonly status?: string;
    readonly id: number;
    readonly reference: string;
    readonly eventType: string;
    readonly eventDate: string;
    readonly eventTime: string;
    readonly venue: string;
    readonly guestCount: number;
    readonly menuSelection?: MenuSelectionSnapshot;
  };
  readonly items: readonly InvoiceItem[];
  readonly subtotal: number;
  readonly discount: number;
  readonly totalAmount: number;
  readonly amountPaid: number;
  readonly remainingBalance: number;
  readonly cancellation?: CancellationAssessment;
  readonly refund?: InvoiceRefund;
  readonly payments: readonly InvoicePayment[];
}
