import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CateringPackage } from '../../../core/models';

@Component({
  selector: 'app-package-card',
  templateUrl: './package-card.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './package-card.scss',
})
export class PackageCardComponent {
  readonly cateringPackage = input.required<CateringPackage>();
  readonly variant = input<'catalog' | 'featured'>('catalog');
  readonly selectPackage = output<string>();
  readonly viewDetails = output<string>();

  protected readonly galleryImages = computed(() => {
    const cateringPackage = this.cateringPackage();
    return cateringPackage.galleryImageUrls?.length
      ? cateringPackage.galleryImageUrls
      : [cateringPackage.imageUrl];
  });
  protected readonly currentImageIndex = signal(0);
  protected readonly currentImage = computed(
    () => this.galleryImages()[this.currentImageIndex()] ?? this.cateringPackage().imageUrl,
  );
  protected readonly currentImageAlt = computed(
    () =>
      `${this.cateringPackage().name} design ${this.currentImageIndex() + 1} of ${this.galleryImages().length}`,
  );

  private touchStartX: number | null = null;

  protected readonly priceLabel = computed(() => {
    const price = this.cateringPackage().pricePerGuest;
    return price === null ? 'Tailored quote' : `PHP ${price.toLocaleString()} / guest`;
  });

  protected onSelectPackage(): void {
    this.selectPackage.emit(this.cateringPackage().id);
  }

  protected onViewDetails(): void {
    this.viewDetails.emit(this.cateringPackage().id);
  }

  protected showPreviousImage(): void {
    const imageCount = this.galleryImages().length;
    this.currentImageIndex.update((index) => (index - 1 + imageCount) % imageCount);
  }

  protected showNextImage(): void {
    const imageCount = this.galleryImages().length;
    this.currentImageIndex.update((index) => (index + 1) % imageCount);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null) return;

    const distance = (event.changedTouches[0]?.clientX ?? this.touchStartX) - this.touchStartX;
    this.touchStartX = null;

    if (Math.abs(distance) < 40) return;
    distance < 0 ? this.showNextImage() : this.showPreviousImage();
  }
}
