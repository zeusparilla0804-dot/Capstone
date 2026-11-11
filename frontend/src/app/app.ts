import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MessengerContactComponent } from './shared/components/messenger-contact/messenger-contact';
import { ActionFeedbackComponent } from './shared/components/action-feedback/action-feedback';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MessengerContactComponent, ActionFeedbackComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss'
})
export class App {}
