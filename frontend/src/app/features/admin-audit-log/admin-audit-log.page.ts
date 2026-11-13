import { formatEventTime } from '../../shared/pipes/event-time.pipe';
import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { AdminAuditLogItem, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';

@Component({selector:'app-admin-audit-log',imports:[AdminShellComponent,DatePipe,JsonPipe,FormsModule],templateUrl:'./admin-audit-log.page.html',styleUrl:'./admin-audit-log.page.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class AdminAuditLogPage{
  private readonly api=inject(AdminService);
  protected readonly data=signal<PageResult<AdminAuditLogItem>|null>(null);
  protected readonly loading=signal(true);
  protected readonly error=signal('');
  protected adminId='';protected action='';protected entityType='';protected entityId='';protected dateFrom='';protected dateTo='';protected page=1;
  protected displayValues(value?: Readonly<Record<string, unknown>>) {
    if (!value) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['eventTime', 'expectedTime'].includes(key) && typeof item === 'string' ? formatEventTime(item) : item]));
  }
  constructor(){this.load();}
  protected load(page=this.page):void{this.page=page;this.loading.set(true);this.error.set('');const filters:Record<string,string|number>={page,pageSize:20,action:this.action,entityType:this.entityType,dateFrom:this.dateFrom,dateTo:this.dateTo};if(this.adminId)filters['adminId']=Number(this.adminId);if(this.entityId)filters['entityId']=Number(this.entityId);this.api.auditLog(filters).pipe(finalize(()=>this.loading.set(false))).subscribe({next:r=>this.data.set(r.data),error:e=>this.error.set(e?.error?.message||'Unable to load the audit log.')});}
}
