import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicHeaderComponent } from '../../shared/components/public-header/public-header';
import { MessengerContactComponent } from '../../shared/components/messenger-contact/messenger-contact';
import { businessContact } from '../../core/content/business-contact';

type InformationPage = 'about' | 'contact';

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
  protected readonly address = businessContact.address;
  protected readonly contactNumbers = businessContact.numbers;
}
