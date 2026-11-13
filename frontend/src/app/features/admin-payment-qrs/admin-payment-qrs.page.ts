import { ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PaymentDestination, PaymentDestinationService } from '../../core/services/payment-destination.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { ActionFeedbackService } from '../../core/services/action-feedback.service';

@Component({
  selector: 'app-admin-payment-qrs',
  imports: [AdminShellComponent, FormsModule],
  templateUrl: './admin-payment-qrs.page.html',
  styleUrl: './admin-payment-qrs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentQrsPage implements OnDestroy {
  private readonly api = inject(PaymentDestinationService);
  private readonly feedbackDialog = inject(ActionFeedbackService);
  protected readonly destinations = signal<PaymentDestination[]>([]);
  protected readonly images = signal<Record<number, string>>({});
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected method: 'BANK_TRANSFER' | 'E-WALLET' = 'BANK_TRANSFER';
  protected label = '';
  protected accountName = '';
  protected accountHint = '';
  protected file: File | null = null;

  constructor() { void this.load(); }
  ngOnDestroy(): void { Object.values(this.images()).forEach(url => URL.revokeObjectURL(url)); }

  protected async load(): Promise<void> {
    try {
      const items = await firstValueFrom(this.api.list());
      this.destinations.set(items.filter(item => item.method === 'BANK_TRANSFER'));
      for (const item of this.destinations()) {
        if (this.images()[item.id]) continue;
        try {
          const blob = await firstValueFrom(this.api.image(item.id));
          const url = URL.createObjectURL(blob);
          this.images.update(current => ({ ...current, [item.id]: url }));
        } catch { /* Metadata stays available if an image cannot be previewed. */ }
      }
    } catch { this.error.set('Unable to load payment QR accounts.'); }
  }
  protected edit(item: PaymentDestination): void {
    if (item.method !== 'BANK_TRANSFER') return;
    this.editingId.set(item.id); this.method = item.method; this.label = item.label;
    this.accountName = item.accountName; this.accountHint = item.accountHint; this.file = null;
  }
  protected reset(): void {
    this.editingId.set(null); this.method = 'BANK_TRANSFER'; this.label = '';
    this.accountName = ''; this.accountHint = ''; this.file = null;
  }
  protected chooseFile(event: Event): void { this.file = (event.target as HTMLInputElement).files?.[0] ?? null; }
  protected async save(): Promise<void> {
    this.error.set(''); this.notice.set('');
    if (!this.label.trim() || !this.accountName.trim() || !this.accountHint.trim() || (!this.editingId() && !this.file)) {
      this.error.set('Enter the account details and choose a QR image.'); return;
    }
    if (this.file && (this.file.size > 1_048_576 || !['image/jpeg', 'image/png', 'image/webp'].includes(this.file.type))) {
      this.error.set('Choose a JPEG, PNG, or WebP image up to 1 MB.'); return;
    }
    this.busy.set(true);
    try {
      const id = this.editingId();
      await firstValueFrom(this.api.save({ method: this.method, label: this.label.trim(), accountName: this.accountName.trim(), accountHint: this.accountHint.trim(), ...(this.file ? { file: this.file } : {}) }, id ?? undefined));
      if (id && this.images()[id]) { URL.revokeObjectURL(this.images()[id]); this.images.update(current => { const copy = { ...current }; delete copy[id]; return copy; }); }
      this.reset(); await this.load(); this.notice.set('QR account saved.');
    } catch (error) { this.error.set(this.message(error, 'Unable to save this QR account.')); }
    finally { this.busy.set(false); }
  }
  protected requestToggle(item: PaymentDestination): void {
    if (this.busy()) return;
    this.feedbackDialog.confirm({ title: item.isAvailable ? 'Make this QR unavailable?' : 'Make this QR available?',
      message: `${item.label}\n${item.isAvailable ? 'Customers will no longer be able to use this QR account while it is unavailable.' : 'This QR account will be available for customers to select.'}`,
      confirmLabel: 'Confirm availability', destructive: !!item.isAvailable,
    }, () => { void this.toggle(item); });
  }
  protected async toggle(item: PaymentDestination): Promise<void> {
    this.error.set(''); this.notice.set(''); this.busy.set(true);
    try { await firstValueFrom(this.api.availability(item.id, !item.isAvailable)); await this.load(); this.notice.set('Availability updated. Customers can select available bank accounts immediately.'); }
    catch (error) { this.error.set(this.message(error, 'Unable to update availability.')); }
    finally { this.busy.set(false); }
  }
  private message(error: unknown, fallback: string): string {
    const value = error as { error?: { message?: string } };
    return typeof value?.error?.message === 'string' ? value.error.message : fallback;
  }
}
