import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MessengerContactComponent } from './shared/components/messenger-contact/messenger-contact';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MessengerContactComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.scss'
})
export class App {}
