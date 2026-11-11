import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CateringPackage } from '../../../core/models';
import { packagePricingSummary } from '../../../core/utils/package-pricing-display';

@Component({
  selector: 'app-package-card',
  templateUrl: './package-card.html',
  styleUrl: './package-card.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PackageCardComponent {
  readonly cateringPackage = input.required<CateringPackage>();
  readonly viewDetails = output<string>();
  protected readonly useDescriptionAsTitle = computed(
    () => /^PHP\s*(?:480|580|680)\s*Per\s*Head$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly priceLabel = computed(() => packagePricingSummary(this.cateringPackage()));

  protected openPackage(): void {
    this.viewDetails.emit(this.cateringPackage().id);
  }
}
