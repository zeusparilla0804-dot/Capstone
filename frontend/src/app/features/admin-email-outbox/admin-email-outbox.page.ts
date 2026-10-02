import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import type { AdminEmailOutboxItem, AdminEmailPreview, PageResult } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { AdminShellComponent } from '../../shared/components/admin-shell/admin-shell';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';

@Component({ selector:'app-admin-email-outbox', imports:[AdminShellComponent,StatusBadgeComponent,DatePipe,FormsModule], templateUrl:'./admin-email-outbox.page.html', styleUrl:'./admin-email-outbox.page.scss', changeDetection:ChangeDetectionStrategy.OnPush })
export class AdminEmailOutboxPage {
  private readonly api=inject(AdminService);
  private readonly route=inject(ActivatedRoute);
  protected readonly data=signal<PageResult<AdminEmailOutboxItem>|null>(null);
  protected readonly previewData=signal<AdminEmailPreview|null>(null);
  protected readonly previewId=signal('');
  protected readonly loading=signal(true);
  protected readonly error=signal('');
  protected readonly feedback=signal('');
  protected readonly retryingId=signal('');
  protected readonly previewLoading=signal(false);
  protected search='';
  protected status=this.route.snapshot.queryParamMap.get('status')??'';
  protected templateKey='';
  protected relatedEntityType='';
  protected relatedEntityId='';
  protected page=1;

  constructor(){this.load();}

  protected load(page=this.page):void{
    this.page=page;this.loading.set(true);this.error.set('');
    this.api.emailOutbox({page,pageSize:20,search:this.search,status:this.status,templateKey:this.templateKey,relatedEntityType:this.relatedEntityType,relatedEntityId:this.relatedEntityId}).pipe(finalize(()=>this.loading.set(false))).subscribe({next:r=>this.data.set(r.data),error:()=>this.error.set('Unable to load email operations.')});
  }

  protected retry(id:string):void{
    if(this.retryingId())return;
    this.retryingId.set(id);this.error.set('');this.feedback.set('');
    this.api.retryEmail(id).pipe(finalize(()=>this.retryingId.set(''))).subscribe({next:()=>{this.feedback.set('Notification queued for retry.');this.load();},error:e=>this.error.set(e?.error?.message||'Only failed notifications can be retried.')});
  }

  protected preview(id:string):void{
    this.previewId.set(id);this.previewData.set(null);this.previewLoading.set(true);this.error.set('');
    this.api.emailPreview(id).pipe(finalize(()=>this.previewLoading.set(false))).subscribe({next:r=>this.previewData.set(r.data),error:e=>{this.previewId.set('');this.error.set(e?.error?.message||'Email preview is unavailable in this environment.');}});
  }

  protected closePreview():void{this.previewId.set('');this.previewData.set(null);}
}
