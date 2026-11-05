import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiResponse, CateringPackage, PackageCategory } from '../models';
import { environment } from '../../../environments/environment';
import { CLIENT_EVENT_GALLERIES } from '../data/client-event-galleries';

const PACKAGE_IMAGE_ROOT = 'assets/images/packages';
type EventCategory = Exclude<PackageCategory, 'all'>;
type PackageApiItem = Omit<CateringPackage, 'imageUrl' | 'galleryImageUrls' | 'category'> & {
  readonly category: string;
};

const PACKAGE_GALLERIES: Record<EventCategory, readonly string[]> = {
  standard: ['custom-wide', 'custom-buffet', 'custom-table'],
  ...CLIENT_EVENT_GALLERIES,
  anniversary: ['anniversary-wide', 'anniversary-buffet', 'anniversary-table'],
  custom: ['custom-wide', 'custom-buffet', 'custom-table'],
};

function galleryFor(category: EventCategory): readonly string[] {
  if (PACKAGE_GALLERIES[category][0]?.startsWith(PACKAGE_IMAGE_ROOT)) {
    return PACKAGE_GALLERIES[category];
  }
  const directory = category === 'standard' ? 'custom' : category;
  return PACKAGE_GALLERIES[category].map(
    (fileName) => `${PACKAGE_IMAGE_ROOT}/${directory}/${fileName}.png`,
  );
}

function categoryFor(value: string): EventCategory {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'standard catering') return 'standard';
  if (normalized === 'other') return 'custom';
  return (Object.hasOwn(PACKAGE_GALLERIES, normalized) ? normalized : 'custom') as EventCategory;
}

@Injectable({ providedIn: 'root' })
export class PackageService {
  private readonly http = inject(HttpClient);
  private readonly packagesState = signal<readonly CateringPackage[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly packages = this.packagesState.asReadonly();
  readonly popularPackages = computed(() => this.packagesState().slice(0, 3));

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
                const galleryImageUrls = galleryFor(category);
                return {
                  ...item,
                  id: String(item.id),
                  category,
                  imageUrl: galleryImageUrls[0],
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
