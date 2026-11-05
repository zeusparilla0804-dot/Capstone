import { DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, OnDestroy, output, viewChild } from '@angular/core';

@Component({
  selector: 'app-logout-dialog',
  templateUrl: './logout-dialog.html',
  styleUrl: './logout-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoutDialogComponent implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private previousOverflow: string | undefined;
  readonly allDevices = input(false);
  readonly decided = output<boolean>();

  constructor() {
    afterNextRender(() => {
      this.previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      this.dialog()?.nativeElement.showModal();
      // The safe action receives focus; Enter must never log someone out accidentally.
      this.cancelButton()?.nativeElement.focus();
    });
  }

  protected cancel(event: Event): void {
    event.preventDefault();
    this.decided.emit(false);
  }

  protected backdropClick(event: MouseEvent): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) this.decided.emit(false);
  }

  ngOnDestroy(): void {
    if (this.dialog()?.nativeElement.open) this.dialog()?.nativeElement.close();
    if (this.previousOverflow !== undefined) this.document.body.style.overflow = this.previousOverflow;
  }
}
