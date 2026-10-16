import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminCustomEventQueueItem, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

@Component({ selector: 'app-admin-custom-events', imports: [AdminShellComponent, StatusBadgeComponent, FormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './admin-custom-events.page.html', styleUrl: './admin-custom-events.page.scss', changeDetection: ChangeDetectionStrategy.Eager })
export class AdminCustomEventsPage {
  private readonly api = inject(AdminService);
  protected readonly data = signal<PageResult<AdminCustomEventQueueItem> | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected search = ''; protected status = ''; protected page = 1;
  protected readonly statuses = ['AWAITING_QUOTE', 'NEEDS_CLARIFICATION', 'QUOTE_SENT', 'ACCEPTED', 'DECLINED', 'REJECTED', 'EXPIRED'];
  constructor() { this.load(); }
  protected load(page = this.page): void {
    this.page = page; this.loading.set(true); this.error.set('');
    this.api.customEvents({ page, pageSize: 20, search: this.search, status: this.status }).subscribe({
      next: response => { this.data.set(response.data); this.loading.set(false); },
      error: () => { this.error.set('Unable to load custom event requests.'); this.loading.set(false); },
    });
  }
}
