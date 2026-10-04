import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

@Component({
  selector: 'app-events-page',
  imports: [PublicHeaderComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './events.page.html',
  styleUrl: './events.page.scss',
})
export class EventsPageComponent {
  protected readonly events = [
    {
      name: 'Weddings',
      category: 'wedding',
      image: 'assets/images/packages/premium-package.webp',
      copy: 'From intimate vows to grand receptions, served with calm attention to every detail.',
    },
    {
      name: 'Birthdays',
      category: 'birthday',
      image: 'assets/images/packages/basic-package.webp',
      copy: 'Familiar favorites and festive menus for children, families, and milestone birthdays.',
    },
    {
      name: 'Debuts',
      category: 'debut',
      image: 'assets/images/packages/deluxe-package.webp',
      copy: 'A refined dining experience worthy of an unforgettable eighteenth birthday.',
    },
    {
      name: 'Corporate events',
      category: 'corporate',
      image: 'assets/images/packages/basic-package.webp',
      copy: 'Dependable food and polished service for meetings, launches, and company gatherings.',
    },
    {
      name: 'Anniversaries',
      category: 'anniversary',
      image: 'assets/images/packages/deluxe-package.webp',
      copy: 'Warm menus for couples and families marking meaningful years together.',
    },
    {
      name: 'Private celebrations',
      category: 'custom',
      image: 'assets/images/hero/la-chef-hero.webp',
      copy: 'Flexible catering for baptisms, graduations, reunions, and celebrations made your own.',
    },
  ] as const;
}
