import { DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-registration-success-dialog',
  templateUrl: './registration-success-dialog.html',
  styleUrl: './registration-success-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationSuccessDialog implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly action = viewChild.required<ElementRef<HTMLButtonElement>>('action');
  private readonly previousFocus = this.document.activeElement as HTMLElement | null;
  readonly continued = output<void>();

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.action().nativeElement.focus();
    });
  }

  protected keepFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    this.action().nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.dialog().nativeElement.close();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
