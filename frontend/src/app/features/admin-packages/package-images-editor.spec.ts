import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminService } from '../../core/services/admin.service';
import { PackageImagesEditorComponent } from './package-images-editor';

describe('Package images editor', () => {
  const api = { packageImages: vi.fn(), savePackageImages: vi.fn() };
  beforeEach(() => {
    api.packageImages.mockReturnValue(of({ data: [{ id: 11, packageId: 2, url: '/api/packages/2/images/11' }, { id: 12, packageId: 2, url: '/api/packages/2/images/12' }] }));
    api.savePackageImages.mockReturnValue(of({ success: true }));
    TestBed.configureTestingModule({ imports: [PackageImagesEditorComponent], providers: [{ provide: AdminService, useValue: api }] });
  });
  function fixture() {
    const fixture = TestBed.createComponent(PackageImagesEditorComponent);
    fixture.componentRef.setInput('item', { id: 2, name: 'Amethyst', eventType: 'Debut' });
    fixture.detectChanges(); return fixture;
  }
  it('persists the chosen cover/order and removed images without changing the package pricing', () => {
    const f = fixture(); const component = f.componentInstance as any;
    component.move(1, -1); component.remove(1); component.save();
    expect(api.savePackageImages).toHaveBeenCalled();
    const [id, data] = api.savePackageImages.mock.lastCall!;
    expect(id).toBe(2); expect(JSON.parse(data.get('gallery'))).toEqual([{ id: 12 }]); expect(data.getAll('images')).toEqual([]);
  });
  it('allows retrying a failed save and rejects non-image uploads', () => {
    api.savePackageImages.mockReturnValue(throwError(() => Error('Offline')));
    const f = fixture(); const component = f.componentInstance as any;
    component.save(); f.detectChanges();
    expect(component.error()).toContain('Unable to save');
    expect(f.nativeElement.querySelector('.image-editor__footer button').disabled).toBe(false);
    component.select({ target: { files: [new File(['text'], 'bad.svg', { type: 'image/svg+xml' })], value: '' } });
    expect(component.images()).toHaveLength(2); expect(component.error()).toContain('JPEG, PNG, or WebP');
  });
});
