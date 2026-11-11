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
import { PackageExperienceComponent } from '../../shared/components/package-experience/package-experience';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

interface CategoryFilter {
  readonly label: string;
  readonly value: PackageCategory;
}

@Component({
  selector: 'app-packages-page',
  imports: [PackageExperienceComponent, PublicHeaderComponent, RouterLink],
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
    { label: 'All Packages', value: 'all' },
    { label: 'Standard Catering', value: 'standard' },
    { label: 'Wedding Packages', value: 'wedding' },
    { label: 'Debut Packages', value: 'debut' },
  ];
  protected readonly selectedCategory = signal<PackageCategory>(this.readInitialCategory());
  private readonly requestedPackageId = this.route.snapshot.queryParamMap.get('package');
  protected readonly filteredPackages = computed(() =>
    this.packageService.getPackagesByCategory(this.selectedCategory()),
  );
  protected readonly packagesForDisplay = computed(() => {
    const packages = this.filteredPackages();
    if (this.selectedCategory() !== 'wedding') return packages;

    const order: Record<string, number> = {
      'Bronze Package': 0,
      'Silver Package': 1,
      'Gold Package': 2,
    };
    return [...packages].sort((left, right) => (order[left.name] ?? 99) - (order[right.name] ?? 99));
  });
  constructor() {
    this.packageService.load();

    effect(() => {
      const packageExists = this.requestedPackageId
        && this.packageService.packages().some((item) => item.id === this.requestedPackageId);
      if (packageExists) {
        this.revealPackage(this.requestedPackageId!);
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

  protected planPackage(packageId: string): void {
    void this.router.navigate(['/book-event'], { queryParams: { package: packageId, new: 1 } });
  }

  private readInitialCategory(): PackageCategory {
    const category = this.route.snapshot.queryParamMap.get('category');
    return this.categories.some((filter) => filter.value === category)
      ? (category as PackageCategory)
      : 'all';
  }

  private revealPackage(packageId: string): void {
    requestAnimationFrame(() => {
      const packageRow = this.document.getElementById(`package-${packageId}`);
      packageRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      packageRow?.focus({ preventScroll: true });
    });
  }
}
