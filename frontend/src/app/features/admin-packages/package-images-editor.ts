import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { AdminPackage } from '../../core/models';
import { AdminService } from '../../core/services/admin.service';
import { categoryFor, defaultPackageGallery } from '../../core/data/package-galleries';
import { catalogImageUrl } from '../../core/utils/catalog-image-url';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

interface EditorImage { key: number; preview: string; id?: number; assetPath?: string; file?: File; }
@Component({ selector: 'app-package-images-editor', templateUrl: './package-images-editor.html', styleUrl: './package-images-editor.scss' })
export class PackageImagesEditorComponent implements OnDestroy {
  readonly item = input.required<AdminPackage>();
  readonly closed = output<void>();
  readonly saved = output<void>();
  private readonly api = inject(AdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private serial = 0;
  protected readonly images = signal<readonly EditorImage[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  constructor() { effect(() => { const item = this.item(); untracked(() => this.load(item)); }); }
  private load(item: AdminPackage): void {
    this.loading.set(true); this.error.set('');
    this.api.packageImages(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: response => {
      if (this.item().id !== item.id) return;
      this.release();
      this.images.set(response.data.length ? response.data.map(image => ({ key: ++this.serial, id: image.id, preview: catalogImageUrl(image.url) }))
        : defaultPackageGallery(item.name, categoryFor(item.eventType)).map(url => ({ key: ++this.serial, assetPath: url, preview: url })));
      this.loading.set(false); this.heading()?.nativeElement.focus();
    }, error: () => { if (this.item().id !== item.id) return; this.loading.set(false); this.error.set('Unable to load package images. Close and try again.'); } });
  }
  protected select(event: Event, replaceIndex?: number): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []); input.value = '';
    if (!files.length || this.saving()) return;
    this.error.set('');
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      this.error.set('Choose JPEG, PNG, or WebP images, at most 5 MB each.'); return;
    }
    if (replaceIndex === undefined && this.images().length + files.length > 12) { this.error.set('A package can have up to 12 images.'); return; }
    const next = [...this.images()];
    const added = files.map(file => ({ key: ++this.serial, file, preview: URL.createObjectURL(file) }));
    if (replaceIndex === undefined) next.push(...added);
    else { this.revoke(next[replaceIndex]); next.splice(replaceIndex, 1, added[0]!); }
    this.images.set(next);
  }
  protected move(index: number, offset: number): void {
    const next = [...this.images()]; const destination = index + offset;
    if (destination < 0 || destination >= next.length || this.saving()) return;
    [next[index], next[destination]] = [next[destination]!, next[index]!]; this.images.set(next);
  }
  protected remove(index: number): void {
    if (this.saving()) return;
    this.revoke(this.images()[index]); this.images.update(images => images.filter((_, i) => i !== index));
  }
  protected save(): void {
    if (this.saving() || this.loading() || !this.images().length) return;
    const data = new FormData(); let fileIndex = 0;
    const gallery = this.images().map(image => {
      if (image.file) { data.append('images', image.file); return { fileIndex: fileIndex++ }; }
      return image.id ? { id: image.id } : { assetPath: image.assetPath };
    });
    data.append('gallery', JSON.stringify(gallery)); this.saving.set(true); this.error.set('');
    this.api.savePackageImages(this.item().id, data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); this.saved.emit(); },
      error: error => { this.saving.set(false); this.error.set(error instanceof HttpErrorResponse ? error.error?.message ?? 'Unable to save images. Try again.' : 'Unable to save images. Try again.'); },
    });
  }
  private revoke(image?: EditorImage): void { if (image?.file) URL.revokeObjectURL(image.preview); }
  private release(): void { this.images().forEach(image => this.revoke(image)); }
  ngOnDestroy(): void { this.release(); }
}
