import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiResponse, CateringPackage, PackageCategory } from '../models';
import { environment } from '../../../environments/environment';
import { categoryFor, defaultPackageGallery } from '../data/package-galleries';
import { catalogImageUrl } from '../utils/catalog-image-url';

type PackageApiItem = Omit<CateringPackage, 'imageUrl' | 'category'> & { readonly category: string };

@Injectable({ providedIn: 'root' })
export class PackageService {
  private readonly http = inject(HttpClient);
  private readonly packagesState = signal<readonly CateringPackage[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly packages = this.packagesState.asReadonly();
  readonly popularPackages = computed(() => {
    const packages = this.packagesState();
    return (['standard', 'wedding', 'debut'] as const)
      .map(category => packages.find(pkg => pkg.category === category))
      .filter((pkg): pkg is CateringPackage => pkg !== undefined);
  });

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<ApiResponse<readonly PackageApiItem[]>>(
        `${environment.apiBaseUrl}/packages`,
        { withCredentials: true },
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) =>
          this.packagesState.set(
            response.data.map(
              (item) => {
                const category = categoryFor(item.category);
                const hasCustomImages = !!item.galleryImageUrls?.length;
                const galleryImageUrls = hasCustomImages ? item.galleryImageUrls!.map(catalogImageUrl) : defaultPackageGallery(item.name, category);
                return {
                  ...item,
                  id: String(item.id),
                  category,
                  hasCustomImages,
                  imageUrl: galleryImageUrls[0] ?? '',
                  galleryImageUrls,
                } as CateringPackage;
              },
            ),
          ),
        error: () => this.error.set('Unable to load packages.'),
      });
  }

  getPackagesByCategory(category: PackageCategory): readonly CateringPackage[] {
    const packages = this.packagesState();
    return category === 'all'
      ? packages
      : packages.filter((cateringPackage) => cateringPackage.category === category);
  }

  getPackageById(packageId: string): CateringPackage | undefined {
    return this.packagesState().find((cateringPackage) => cateringPackage.id === packageId);
  }
}
