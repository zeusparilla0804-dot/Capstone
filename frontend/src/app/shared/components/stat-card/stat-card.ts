import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { StatCard } from '../../../core/models';

@Component({
  selector: 'app-stat-card',
  templateUrl: './stat-card.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './stat-card.scss',
})
export class StatCardComponent {
  readonly stat = input.required<StatCard>();
}
