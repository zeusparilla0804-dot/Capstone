import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Synchronous invalidation boundary for customer-owned state and pending responses. */
@Injectable({ providedIn: 'root' })
export class CustomerAccountScopeService {
  private principal: string | null = null;
  private revision = 0;
  private readonly changed = new Subject<void>();
  readonly changes = this.changed.asObservable();

  get generation(): number { return this.revision; }

  setPrincipal(id: string | null): void {
    if (id === this.principal) return;
    this.principal = id;
    this.revision += 1;
    this.changed.next();
  }
}
