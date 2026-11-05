import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { MessengerContactComponent } from '../../shared/components/messenger-contact/messenger-contact';

type InformationPage = 'about' | 'contact';

interface ContactNumber {
  readonly label: string;
  readonly display: string;
  readonly href: string;
}

@Component({
  selector: 'app-simple-info-page',
  imports: [PublicHeaderComponent, RouterLink, MessengerContactComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './simple-info.page.html',
  styleUrl: './simple-info.page.scss',
})
export class SimpleInfoPageComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly page = this.route.snapshot.data['page'] as InformationPage;
  protected readonly contactNumbers: readonly ContactNumber[] = [
    { label: 'Smart', display: '0939 298 7324', href: 'tel:+639392987324' },
    { label: 'Globe', display: '0926 089 4301', href: 'tel:+639260894301' },
    { label: 'Viber', display: '0947 966 2352', href: 'tel:+639479662352' },
  ];
}
