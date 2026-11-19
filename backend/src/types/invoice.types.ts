import type { MenuSelectionSnapshot } from './menu.types.js';
import type { PaymentBankSnapshot } from './payment-bank.types.js';
export type CancellationAssessment =
  | { kind: 'EARLY'; date: string; forfeitedAmount: number; refundableAmount: number }
  | { kind: 'ADMIN_REVIEW'; date: string };

export interface InvoiceDetails{invoiceId:number;invoiceNumber:string;issueDate:string;dueDate?:string;status:string;issuer?:{name:string};customer:{id:number;name:string;email:string;phone:string};booking:{status?:string;id:number;reference:string;eventType:string;eventDate:string;eventTime:string;venue:string;guestCount:number;menuSelection?:MenuSelectionSnapshot};items:{description:string;quantity:number;unitPrice:number;amount:number}[];subtotal:number;discount:number;totalAmount:number;amountPaid:number;remainingBalance:number;cancellation?:CancellationAssessment;payments:({id:number;date:string;reference?:string;method:string;amount:number;status:string} & Partial<PaymentBankSnapshot>)[];}
