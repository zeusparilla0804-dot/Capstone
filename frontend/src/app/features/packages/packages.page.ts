import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PackageCategory } from '../../core/models';
import { PackageService } from '../../core/services/package.service';
import { PackageCardComponent } from '../../shared/components/package-card/package-card';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

interface CategoryFilter {
  readonly label: string;
  readonly value: PackageCategory;
}

@Component({
  selector: 'app-packages-page',
  imports: [PackageCardComponent, PublicHeaderComponent, RouterLink],
  templateUrl: './packages.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './packages.page.scss',
})
export class PackagesPageComponent {
  protected readonly packageService = inject(PackageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);

  protected readonly categories: readonly CategoryFilter[] = [
    { label: 'All Events', value: 'all' },
    { label: 'Weddings', value: 'wedding' },
    { label: 'Birthdays', value: 'birthday' },
    { label: 'Corporate', value: 'corporate' },
    { label: 'Debuts', value: 'debut' },
    { label: 'Anniversaries', value: 'anniversary' },
    { label: 'Custom Events', value: 'custom' },
  ];
  protected readonly selectedCategory = signal<PackageCategory>(this.readInitialCategory());
  protected readonly selectedPackageId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('package'),
  );
  protected readonly filteredPackages = computed(() =>
    this.packageService.getPackagesByCategory(this.selectedCategory()),
  );
  protected readonly selectedPackage = computed(() =>
    this.selectedPackageId()
      ? this.packageService.getPackageById(this.selectedPackageId()!)
      : undefined,
  );
  constructor() {
    this.packageService.load();

    effect(() => {
      if (this.selectedPackage()) {
        this.revealPackageDetails();
      }
    });
  }

  protected setCategory(category: PackageCategory): void {
    this.selectedCategory.set(category);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: category === 'all' ? null : category, package: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected selectPackage(packageId: string): void {
    void this.router.navigate(['/book-event'], { queryParams: { package: packageId } });
  }
  protected async viewPackage(packageId: string): Promise<void> {
    this.selectedPackageId.set(packageId);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { package: packageId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.revealPackageDetails();
  }
  protected closeDetails(): void {
    this.selectedPackageId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { package: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private readInitialCategory(): PackageCategory {
    const category = this.route.snapshot.queryParamMap.get('category');
    return this.categories.some((filter) => filter.value === category)
      ? (category as PackageCategory)
      : 'all';
  }

  private revealPackageDetails(): void {
    requestAnimationFrame(() => {
      const details = this.document.getElementById('package-detail');
      details?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      details?.focus({ preventScroll: true });
    });
  }
}
