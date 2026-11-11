import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CateringPackage } from '../../../core/models';
import { packagePricingExplanation } from '../../../core/utils/package-pricing-display';

const CLASSIC_INCLUSIONS = [
  'Dinner rolls with butter',
  'Seasonal fresh fruit platter',
  'Choice of three main dishes: pork, chicken, and fish',
  'Choice of one pasta, noodle, or vegetable dish',
  'Steamed rice',
  'Choice of one dessert',
  'Choice of one drink',
  'Purified water with tube ice',
  'Buffet service',
  'Complete buffet setup with chafing dishes, silverware, and a buffet centerpiece',
  'Complete catering and dining utensils',
  'Menu labels for each dish',
  'Round tables with floor-length tablecloths, runners that match the event motif, and table toppers',
  'Basic table centerpieces',
  'Monobloc chairs with chair covers and ribbons',
  'Dressed beverage station, cake table, or gift table',
  'Trained and uniformed waitstaff and food attendants',
].map((label) => ({ label }));

const EXPANDED_INCLUSIONS = [
  'Choice of one appetizer',
  'Fresh garden salad with dressing',
  'Choice of four main dishes: beef, pork, chicken, and fish',
  'Choice of one pasta, noodle, or vegetable dish',
  'Steamed rice',
  'Choice of one dessert',
  'Choice of one drink',
  'Purified water with tube ice',
  'Buffet service',
  'Complete buffet setup with chafing dishes, silverware, and a buffet centerpiece',
  'Complete catering and dining utensils',
  'Menu labels for each dish',
  'Round tables with floor-length tablecloths, runners that match the event motif, and table toppers',
  'Basic table centerpieces',
  'Monobloc chairs with chair covers and ribbons',
  'Dressed beverage station, cake table, or gift table',
].map((label) => ({ label }));

const FULL_BUFFET_INCLUSIONS = [
  'Choice of one soup',
  'Choice of four main dishes: beef, pork, chicken, and fish',
  'Choice of one pasta or noodle dish',
  'Choice of one vegetable dish',
  'Steamed rice',
  'Choice of one dessert',
  'Choice of one drink',
  'Purified water with tube ice',
  'Buffet service',
  'Complete buffet setup with chafing dishes, silverware, and a buffet centerpiece',
  'Complete catering and dining utensils',
  'Menu labels for each dish',
  'Round tables with floor-length tablecloths, runners that match the event motif, and table toppers',
  'Basic table centerpieces',
  'Monobloc chairs with chair covers and ribbons',
  'Dressed beverage station, cake table, or gift table',
  'Trained and uniformed waitstaff and food attendants',
].map((label) => ({ label }));

const AMETHYST_INCLUSIONS = [
  'Choice of three main dishes',
  'Complete catering setup and utensils',
  'Basic photo and video coverage with photo book',
  'One-tier cake',
  'Three Usherettes',
  'Choice of one pasta, noodle, or vegetable',
  'Basic three-panel debut backdrop and debutant chair',
  'Artificial-flower centerpieces and table numbers',
  'Basic unlimited photobooth for two hours',
  'Traditional hair and makeup for two looks',
  'Steamed rice',
  'Choice of one dessert and one drink',
  '18 roses, red carpet, toast, and host',
  'Basic sound and lights',
  'Service staff',
].map((label) => ({ label }));

const DIAMOND_INCLUSIONS = [
  'Photo and video coverage with photo book and portrait',
  'Audio guestbook corner',
  'Personalized welcome sign',
  'Choice of one soup',
  'Choice of four main dishes',
  'Choice of one pasta, noodle, or vegetable',
  'Dressed VIP tables and Tiffany chairs with catering utensils',
  'Basic three-panel debut backdrop and debutant chair',
  'Artificial-flower centerpieces and table numbers',
  'Basic unlimited photobooth for two hours',
  'Traditional hair and makeup for two looks',
  'Two usherettes',
  'Two-tier cake',
  'Grazing table',
  'Steamed rice',
  'Choice of one dessert and one drink',
  '18 roses, red carpet, toast, and host',
  'Sound and lights',
  'Service staff',
].map((label) => ({ label }));

const RUBY_INCLUSIONS = [
  'Choice of one pasta or noodle and one vegetable',
  'Themed stage backdrop and entrance arch',
  'Photo and video coverage with photo book, portrait, and event videos',
  'Unlimited magnetic photobooth for two hours',
  'Airbrush hair and makeup for two looks',
  'Coffee bar',
  'Choice of one soup',
  'Choice of four main dishes',
  'Dressed VIP tables and Tiffany chairs with catering utensils',
  'Table centerpieces and table numbers',
  'Two usherettes',
  'Two-tier cake',
  'Grazing table',
  'Steamed rice',
  'Choice of one dessert and one drink',
  '18 roses, red carpet, toast, and host',
  'Basic sound and lights',
  'Service staff',
].map((label) => ({ label }));

const BRONZE_INCLUSIONS = [
  'Choice of three main dishes: beef or pork, chicken, and fish',
  'Complete catering setup: dressed tables, monoblock chairs, and catering utensils',
  'Basic photo and video coverage: one photographer, one videographer, 20-page photo book, edited photos and video via Google Drive',
  'One-tier fondant cake',
  'Choice of one pasta or noodle, or vegetable',
  'Couple’s basic backdrop: three wooden panels, couple’s initials, artificial flower accents, and couple’s chair',
  'VIP and guest table centerpieces: artificial flower vase and table number',
  'Basic photobooth, unlimited use for two hours',
  'Professional host and two usherettes',
  'Basic sound and lights',
  'Steamed rice',
  'Choice of one dessert',
  'Choice of one drink',
  'Purified water with tube ice',
  'Ordinary flower arrangement: bridal bouquet, flowers for two mothers, five principal sponsors, five secondary sponsors, and three flower girls',
  'Wine for bridal toasting',
  'Trained and uniformed waiters and food attendants',
].map((label) => ({ label }));

const SILVER_INCLUSIONS = [
  'Complete catering setup: Tiffany chairs for 100 guests and catering utensils',
  'Basic photo and video coverage: one photographer, one videographer, 20-page photo book, 11×14 wedding portrait, edited photos and video',
  'Traditional hair and makeup for bride and groom: preparation and ceremony looks, makeup for two mothers, and reception look',
  'Choice of one soup',
  'Choice of four main dishes: beef, pork, chicken, and fish',
  'Choice of one pasta or noodle, or vegetable',
  'Couple’s basic backdrop: three wooden panels, couple’s initials, artificial flower accents, and couple’s chair',
  'VIP and guest table centerpieces: artificial flower vase and table number',
  'Basic photobooth, unlimited use for two hours',
  'Professional host and two usherettes',
  'Two-tier fondant cake',
  'Basic sound and lights',
  'Grazing table for 50 guests',
  'Steamed rice',
  'Choice of one dessert',
  'Choice of one drink',
  'Purified water with tube ice',
  'Ordinary flower arrangement: bridal bouquet, flowers for two mothers, five principal sponsors, five secondary sponsors, and three flower girls',
  'Wine for bridal toasting',
  'Trained and uniformed waiters and food attendants',
].map((label) => ({ label }));

const GOLD_INCLUSIONS = [
  'Choice of one pasta or noodle',
  'Choice of one vegetable',
  'Complete catering setup: Tiffany chairs for 120 guests and catering utensils',
  'Styling: themed stage backdrop and entrance arch',
  'Photo and video coverage: two photographers, two videographers, 40-page photo book, 11×14 wedding portrait, same-day edit video, edited photos and video',
  'Magnetic photobooth, unlimited use for two hours',
  'Airbrush hair and makeup for bride and groom: preparation and ceremony looks, makeup for two mothers, and reception look',
  'Professional host and three usherettes',
  'Coffee bar for 50 cups',
  'Choice of one soup',
  'Choice of four main dishes: beef, pork, chicken, and fish',
  'VIP and guest table centerpieces: table centerpiece and table number',
  'Two-tier fondant cake',
  'Grazing table for 50 guests',
  'Steamed rice',
  'Choice of one dessert',
  'Choice of one drink',
  'Purified water with tube ice',
  'Ordinary flower arrangement: bridal bouquet, flowers for two mothers, five principal sponsors, five secondary sponsors, and three flower girls',
  'Wine for bridal toasting',
  'Trained and uniformed waiters and food attendants',
].map((label) => ({ label }));

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
  protected readonly useDescriptionAsTitle = computed(
    () => /^PHP\s*(?:480|580|680)\s*Per\s*Head$/i.test(this.cateringPackage().name.trim()),
  );

  protected readonly currentImageIndex = signal(0);
  protected readonly inclusionsExpanded = signal(false);
  protected readonly isClassic = computed(
    () => /^PHP\s*480\s*Per\s*Head$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isExpanded = computed(
    () => /^PHP\s*580\s*Per\s*Head$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isFullBuffet = computed(
    () => /^PHP\s*680\s*Per\s*Head$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isAmethyst = computed(
    () => /^amethyst(?: package)?$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isRuby = computed(
    () => /^ruby(?: package)?$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isBronze = computed(
    () => /^bronze(?: package)?$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isSilver = computed(
    () => /^silver(?: package)?$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly isGold = computed(
    () => /^gold(?: package)?$/i.test(this.cateringPackage().name.trim()),
  );
  protected readonly inclusionItems = computed(
    () => this.isClassic() ? CLASSIC_INCLUSIONS : this.isExpanded() ? EXPANDED_INCLUSIONS : this.isFullBuffet() ? FULL_BUFFET_INCLUSIONS : this.isGold() ? GOLD_INCLUSIONS
      : this.isSilver() ? SILVER_INCLUSIONS
      : this.isBronze() ? BRONZE_INCLUSIONS
      : this.isRuby() ? RUBY_INCLUSIONS
      : this.isAmethyst() ? AMETHYST_INCLUSIONS
      : /^diamond(?: package)?$/i.test(this.cateringPackage().name.trim())
        ? DIAMOND_INCLUSIONS : this.cateringPackage().features,
  );
  protected readonly boldInclusionCount = computed(
    () => this.isClassic() || this.isExpanded() || this.isFullBuffet() ? 4 : this.isGold() ? 9 : this.isSilver() ? 3 : this.isBronze() ? 4 : this.isRuby() ? 6 : this.isAmethyst() ? 5
      : /^diamond(?: package)?$/i.test(this.cateringPackage().name.trim()) ? 3 : 0,
  );
  protected readonly inclusionPreviewCount = computed(() => this.isClassic() || this.isExpanded() || this.isFullBuffet() ? 4 : this.isGold() ? 9 : this.isBronze() ? 4 : this.isRuby() ? 6 : this.isAmethyst() ? 5 : 3);
  protected readonly isReverse = computed(() => this.position() % 2 === 1);
  protected readonly galleryImages = computed(() => {
    const pkg = this.cateringPackage();
    return pkg.galleryImageUrls ?? (pkg.imageUrl ? [pkg.imageUrl] : []);
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
