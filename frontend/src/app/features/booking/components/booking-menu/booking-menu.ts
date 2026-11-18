import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import type { PackageMenuDefinition, PackageMenuField } from '../../../../core/models';

@Component({
  selector: 'app-booking-menu',
  templateUrl: './booking-menu.html',
  styleUrl: './booking-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingMenuComponent {
  readonly definition = input.required<PackageMenuDefinition>();
  readonly values = input<Readonly<Record<string, string>>>({});
  readonly showErrors = input(false);
  readonly changed = output<Readonly<Record<string, string>>>();
  private readonly edited = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => { this.definition(); this.edited.set(new Set()); });
  }

  protected edit(field: PackageMenuField, event: Event): void {
    this.edited.update(keys => new Set([...keys, field.key]));
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.changed.emit({ ...this.values(), [field.key]: value });
  }

  protected markEdited(key: string): void {
    this.edited.update(keys => new Set([...keys, key]));
  }

  protected error(field: PackageMenuField): string {
    if (!this.showErrors() && !this.edited().has(field.key)) return '';
    const value = this.values()[field.key]?.trim() ?? '';
    if (field.options) return field.options.includes(value) ? '' : 'Choose a menu option.';
    return value.length >= 2 && value.length <= 120 ? '' : 'Enter a dish or drink name using 2 to 120 characters.';
  }
}
