import { DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import type { CashDepositDeadline } from '../../../../core/utils/cash-payment-policy';

@Component({ selector: 'app-payment-choice-dialog', templateUrl: './payment-choice-dialog.html',
  imports: [CurrencyPipe, DatePipe],
  styleUrl: './payment-choice-dialog.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class PaymentChoiceDialogComponent implements OnDestroy {
  readonly methodLabel = input.required<string>();
  readonly reference = input.required<string>();
  readonly cashTerms = input(false);
  readonly cashDeposit = input(0);
  readonly cashDeadline = input<CashDepositDeadline | null>(null);
  protected readonly cashTermsAccepted = signal(false);
  readonly decided = output<boolean>();
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private previousOverflow: string | undefined;

  constructor() {
    afterNextRender(() => {
      this.previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      this.dialog()?.nativeElement.showModal();
      if (this.cashTerms()) {
        this.heading()?.nativeElement.focus();
        this.dialog()!.nativeElement.scrollTop = 0;
      } else {
        this.cancelButton()?.nativeElement.focus();
      }
    });
  }
  protected cancel(event: Event): void { event.preventDefault(); this.decided.emit(false); }
  protected confirm(): void {
    if (this.cashTerms() && !this.cashTermsAccepted()) return;
    this.decided.emit(true);
  }
  ngOnDestroy(): void {
    if (this.dialog()?.nativeElement.open) this.dialog()?.nativeElement.close();
    if (this.previousOverflow !== undefined) this.document.body.style.overflow = this.previousOverflow;
  }
}
