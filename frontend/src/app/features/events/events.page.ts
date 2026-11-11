import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLIENT_EVENT_GALLERIES } from '../../core/data/client-event-galleries';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

type EventCategory = 'wedding' | 'birthday' | 'debut' | 'corporate' | 'anniversary' | 'custom';

interface EventExperience {
  readonly name: string;
  readonly category: EventCategory;
  readonly packageCategory: 'standard' | 'debut';
  readonly images: readonly string[];
  readonly copy: string;
}

@Component({
  selector: 'app-events-page',
  imports: [PublicHeaderComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './events.page.html',
  styleUrl: './events.page.scss',
})
export class EventsPageComponent {
  protected readonly events: readonly EventExperience[] = [
    {
      name: 'Weddings',
      category: 'wedding',
      packageCategory: 'standard',
      images: CLIENT_EVENT_GALLERIES.wedding,
      copy: 'From intimate vows to grand receptions, served with calm attention to every detail.',
    },
    {
      name: 'Birthdays',
      category: 'birthday',
      packageCategory: 'standard',
      images: CLIENT_EVENT_GALLERIES.birthday,
      copy: 'Familiar favorites and festive menus for children, families, and milestone birthdays.',
    },
    {
      name: 'Debuts',
      category: 'debut',
      packageCategory: 'debut',
      images: CLIENT_EVENT_GALLERIES.debut,
      copy: 'A refined dining experience worthy of an unforgettable eighteenth birthday.',
    },
    {
      name: 'Corporate events',
      category: 'corporate',
      packageCategory: 'standard',
      images: CLIENT_EVENT_GALLERIES.corporate,
      copy: 'Dependable food and polished service for meetings, launches, and company gatherings.',
    },
    {
      name: 'Anniversaries',
      category: 'anniversary',
      packageCategory: 'standard',
      images: [1, 2, 3, 4, 5].map(
        (index) => `assets/images/packages/anniversary/client-anniversary-${String(index).padStart(2, '0')}.jpg`,
      ),
      copy: 'Warm menus for couples and families marking meaningful years together.',
    },
    {
      name: 'Private celebrations',
      category: 'custom',
      packageCategory: 'standard',
      images: [1, 2, 3, 4].map(
        (index) => `assets/images/packages/custom/client-private-${String(index).padStart(2, '0')}.jpg`,
      ),
      copy: 'Flexible catering for baptisms, graduations, reunions, and celebrations made your own.',
    },
  ];

  private readonly imageIndexes = signal<Partial<Record<EventCategory, number>>>({});
  private readonly touchStartX = new Map<EventCategory, number>();

  protected currentImage(event: EventExperience): string {
    return event.images[this.currentIndex(event)] ?? event.images[0]!;
  }

  protected currentIndex(event: EventExperience): number {
    return this.imageIndexes()[event.category] ?? 0;
  }

  protected visibleDots(event: EventExperience): readonly number[] {
    const visibleCount = Math.min(7, event.images.length);
    const start = Math.min(
      Math.max(this.currentIndex(event) - Math.floor(visibleCount / 2), 0),
      event.images.length - visibleCount,
    );
    return Array.from({ length: visibleCount }, (_, offset) => start + offset);
  }

  protected showPreviousImage(event: EventExperience): void {
    this.setImageIndex(event, this.currentIndex(event) - 1);
  }

  protected showNextImage(event: EventExperience): void {
    this.setImageIndex(event, this.currentIndex(event) + 1);
  }

  protected onGalleryKeydown(event: EventExperience, keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key === 'ArrowLeft') this.showPreviousImage(event);
    else if (keyboardEvent.key === 'ArrowRight') this.showNextImage(event);
    else if (keyboardEvent.key === 'Home') this.setImageIndex(event, 0);
    else if (keyboardEvent.key === 'End') this.setImageIndex(event, event.images.length - 1);
    else return;
    keyboardEvent.preventDefault();
  }

  protected onTouchStart(category: EventCategory, event: TouchEvent): void {
    this.touchStartX.set(category, event.changedTouches[0]?.clientX ?? 0);
  }

  protected onTouchEnd(experience: EventExperience, event: TouchEvent): void {
    const startX = this.touchStartX.get(experience.category);
    this.touchStartX.delete(experience.category);
    if (startX === undefined) return;
    const distance = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (Math.abs(distance) < 48) return;
    if (distance < 0) this.showNextImage(experience);
    else this.showPreviousImage(experience);
  }

  private setImageIndex(event: EventExperience, requestedIndex: number): void {
    const count = event.images.length;
    if (count < 2) return;
    const nextIndex = (requestedIndex + count) % count;
    this.imageIndexes.update((indexes) => ({ ...indexes, [event.category]: nextIndex }));
  }
}
