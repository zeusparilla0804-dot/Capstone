import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventsPageComponent } from './events.page';

describe('EventsPageComponent client galleries', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventsPageComponent],
      providers: [provideRouter([])],
    });
  });

  it('uses every matching client photo in the event category galleries', () => {
    const fixture = TestBed.createComponent(EventsPageComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const statuses = Array.from(
      element.querySelectorAll<HTMLElement>('[aria-live="polite"]'),
      (status) => status.textContent?.trim(),
    );
    expect(statuses).toEqual([
      'Design image 1 of 19',
      'Design image 1 of 13',
      'Design image 1 of 29',
      'Design image 1 of 10',
    ]);
  });

  it('advances the selected event gallery and keeps long pagination compact', () => {
    const fixture = TestBed.createComponent(EventsPageComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const gallery = element.querySelector<HTMLElement>('[data-event-gallery="wedding"]')!;
    const image = gallery.querySelector<HTMLImageElement>('img')!;
    expect(image.getAttribute('src')).toContain('client-wedding-01.jpg');
    expect(gallery.querySelectorAll('.event-gallery__dots span')).toHaveLength(7);

    gallery.querySelector<HTMLButtonElement>('[aria-label="Next Weddings image"]')!.click();
    fixture.detectChanges();
    expect(image.getAttribute('src')).toContain('client-wedding-02.jpg');
  });

  it('supports touch swiping without showing click-zone buttons to assistive technology as content', () => {
    const fixture = TestBed.createComponent(EventsPageComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const gallery = element.querySelector<HTMLElement>('[data-event-gallery="birthday"]')!;
    const image = gallery.querySelector<HTMLImageElement>('img')!;
    gallery.dispatchEvent(touchEvent('touchstart', 280));
    gallery.dispatchEvent(touchEvent('touchend', 80));
    fixture.detectChanges();

    expect(image.getAttribute('src')).toContain('client-kids-birthday-02.jpg');
    expect(gallery.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('Design image 2 of 13');
  });

  it('routes each event to an available official package group', () => {
    const fixture = TestBed.createComponent(EventsPageComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const weddingLink = element.querySelector<HTMLElement>('[data-event-gallery="wedding"]')
      ?.closest('article')?.querySelector<HTMLAnchorElement>('a');
    const debutLink = element.querySelector<HTMLElement>('[data-event-gallery="debut"]')
      ?.closest('article')?.querySelector<HTMLAnchorElement>('a');

    expect(weddingLink?.getAttribute('href')).toBe('/packages?category=standard');
    expect(debutLink?.getAttribute('href')).toBe('/packages?category=debut');
  });
});

function touchEvent(type: string, clientX: number): TouchEvent {
  const event = new Event(type, { bubbles: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: [{ clientX }] });
  return event;
}
