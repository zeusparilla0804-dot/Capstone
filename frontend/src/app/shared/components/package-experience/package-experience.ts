import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CateringPackage } from '../../../core/models';
import { packagePricingExplanation } from '../../../core/utils/package-pricing-display';

@Component({
  selector: 'app-package-experience',
  templateUrl: './package-experience.html',
  styleUrl: './package-experience.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PackageExperienceComponent {
  private readonly document = inject(DOCUMENT);
  readonly cateringPackage = input.required<CateringPackage>();
  readonly position = input(0);
  readonly planPackage = output<string>();
  readonly viewInclusions = output<string>();

  protected readonly currentImageIndex = signal(0);
  protected readonly inclusionsExpanded = signal(false);
  protected readonly isReverse = computed(() => this.position() % 2 === 1);
  protected readonly galleryImages = computed(() => {
    const pkg = this.cateringPackage();
    return pkg.galleryImageUrls?.length ? pkg.galleryImageUrls : [pkg.imageUrl];
  });
  protected readonly currentImage = computed(
    () => this.galleryImages()[this.currentImageIndex()] ?? this.cateringPackage().imageUrl,
  );
  protected readonly visibleDots = computed(() => {
    const count = this.galleryImages().length;
    const visibleCount = Math.min(7, count);
    const start = Math.min(
      Math.max(this.currentImageIndex() - Math.floor(visibleCount / 2), 0),
      count - visibleCount,
    );
    return Array.from({ length: visibleCount }, (_, offset) => start + offset);
  });
  protected readonly currentImageAlt = computed(
    () => `${this.cateringPackage().name} event design ${this.currentImageIndex() + 1} of ${this.galleryImages().length}`,
  );
  protected readonly pricingExplanation = computed(() => packagePricingExplanation(this.cateringPackage()));
  protected readonly reducedMotion = this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  private touchStartX: number | null = null;

  protected showPreviousImage(): void {
    const count = this.galleryImages().length;
    this.currentImageIndex.update((index) => (index - 1 + count) % count);
  }

  protected showNextImage(): void {
    const count = this.galleryImages().length;
    this.currentImageIndex.update((index) => (index + 1) % count);
  }

  protected showImage(index: number): void {
    this.currentImageIndex.set(index);
  }

  protected onGalleryKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') this.showPreviousImage();
    if (event.key === 'ArrowRight') this.showNextImage();
    if (event.key === 'Home') this.showImage(0);
    if (event.key === 'End') this.showImage(this.galleryImages().length - 1);
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null) return;
    const distance = (event.changedTouches[0]?.clientX ?? this.touchStartX) - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(distance) < 48) return;
    distance < 0 ? this.showNextImage() : this.showPreviousImage();
  }

  protected toggleInclusions(): void {
    this.inclusionsExpanded.update((expanded) => !expanded);
    this.viewInclusions.emit(this.cateringPackage().id);
  }

  protected requestPlanning(): void {
    this.planPackage.emit(this.cateringPackage().id);
  }

}
