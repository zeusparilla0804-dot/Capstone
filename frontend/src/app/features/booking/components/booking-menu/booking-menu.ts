import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import type { PackageMenuDefinition, PackageMenuField } from '../../../../core/models';
import { chefMenuChoice } from '../../../../core/models/menu.model';

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
    const value = (event.target as HTMLSelectElement).value;
    const values = { ...this.values(), [field.key]: value };
    if (field.options && value !== this.values()[field.key]) {
      for (const dish of this.definition().fields) {
        const choices = dish.dishChoices;
        if (choices && 'categoryField' in choices && choices.categoryField === field.key) {
          values[dish.key] = chefMenuChoice;
        }
      }
    }
    this.changed.emit(values);
  }

  protected markEdited(key: string): void {
    this.edited.update(keys => new Set([...keys, key]));
  }

  protected choices(field: PackageMenuField): readonly string[] {
    if (field.options) return field.options;
    const choices = field.dishChoices;
    const dishes = choices && 'categoryField' in choices
      ? choices.byCategory[this.values()[choices.categoryField]] ?? []
      : choices ?? [];
    const saved = this.values()[field.key];
    return saved && saved !== chefMenuChoice && !dishes.includes(saved)
      ? [chefMenuChoice, ...dishes, saved]
      : [chefMenuChoice, ...dishes];
  }

  protected error(field: PackageMenuField): string {
    if (!this.showErrors() && !this.edited().has(field.key)) return '';
    const value = this.values()[field.key]?.trim() ?? '';
    return this.choices(field).includes(value) ? '' : 'Choose a menu option.';
  }
}
