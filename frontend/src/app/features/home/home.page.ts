import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CateringPackage, PackageCategory } from '../../core/models';
import { PackageService } from '../../core/services/package.service';
import { PackageCardComponent } from '../../shared/components/package-card/package-card';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';

interface CateringService {
  readonly title: string;
  readonly subtitle: string;
  readonly category: Exclude<PackageCategory, 'all' | 'custom'>;
  readonly imageUrl: string;
}

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, PackageCardComponent, PublicHeaderComponent],
  templateUrl: './home.page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home.page.scss',
})
export class HomePageComponent {
  private readonly packageService = inject(PackageService);
  private readonly router = inject(Router);

  protected readonly popularPackages = this.packageService.popularPackages;
  protected readonly benefits = [
    {
      number: '01',
      title: 'Menus made personal',
      copy: 'Flexible selections shaped around your guests, occasion, and budget.',
    },
    {
      number: '02',
      title: 'Service with care',
      copy: 'A professional team that keeps every detail calm, warm, and on time.',
    },
    {
      number: '03',
      title: 'Celebrations made easy',
      copy: 'Clear packages and an online reservation journey you can follow.',
    },
  ] as const;
  protected readonly bookingSteps = [
    {
      number: '01',
      title: 'Select a package',
      copy: 'Explore menus built for your kind of gathering.',
    },
    {
      number: '02',
      title: 'Share event details',
      copy: 'Tell us the date, venue, and guest count.',
    },
    {
      number: '03',
      title: 'Submit your request',
      copy: 'Review your choices and send your reservation.',
    },
    {
      number: '04',
      title: 'Receive confirmation',
      copy: 'Our team checks availability and guides what comes next.',
    },
  ] as const;
  protected readonly cateringServices: readonly CateringService[] = [
    {
      title: 'Weddings',
      subtitle: 'Elegant menus for your perfect day',
      category: 'wedding',
      imageUrl: 'assets/images/packages/wedding/client-wedding-18.jpg',
    },
    {
      title: 'Birthdays',
      subtitle: 'Joyful feasts worth celebrating',
      category: 'birthday',
      imageUrl: 'assets/images/packages/birthday/client-kids-birthday-01.jpg',
    },
    {
      title: 'Corporate Events',
      subtitle: 'Polished service for every occasion',
      category: 'corporate',
      imageUrl: 'assets/images/packages/corporate/client-business-forum-01.jpg',
    },
    {
      title: 'Debut',
      subtitle: 'A grand table for a milestone night',
      category: 'debut',
      imageUrl: 'assets/images/packages/debut/client-debut-11.jpg',
    },
    {
      title: 'Anniversaries',
      subtitle: 'Intimate dining for lasting memories',
      category: 'anniversary',
      imageUrl: 'assets/images/packages/wedding/client-wedding-10.jpg',
    },
  ];
  constructor() {
    this.packageService.load();
  }

  protected browseCategory(category: CateringService['category']): void {
    void this.router.navigate(['/packages'], { queryParams: { category } });
  }

  protected viewPackage(cateringPackage: CateringPackage): void {
    void this.router.navigate(['/packages'], { queryParams: { package: cateringPackage.id } });
  }
}
