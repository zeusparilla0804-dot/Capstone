import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import type { PackageMenuDefinition, PackageMenuField } from '../../../../core/models';
import { chefMenuChoice } from '../../../../core/models/menu.model';
import { appetizerReferencePhoto, menuDishPhotos } from '../../../../core/data/menu-dish-photos';

@Component({
  selector: 'app-booking-menu',
  imports: [NgTemplateOutlet],
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
  protected readonly openGallery = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.definition();
      this.edited.set(new Set());
      this.openGallery.set(null);
    });
  }

  protected edit(field: PackageMenuField, event: Event): void {
    this.select(field, (event.target as HTMLSelectElement).value);
  }

  protected toggleGallery(key: string): void {
    this.openGallery.update(open => open === key ? null : key);
  }

  protected pickPhoto(field: PackageMenuField, dish: string, opener: HTMLButtonElement): void {
    this.select(field, dish);
    this.openGallery.set(null);
    opener.focus();
  }

  protected photos(field: PackageMenuField) {
    if (field.options) {
      const dependentChoices = this.definition().fields.flatMap(({ dishChoices }) =>
        dishChoices && 'categoryField' in dishChoices && dishChoices.categoryField === field.key ? [dishChoices] : [],
      );
      return field.options.flatMap(category => {
        const [sample] = this.photosFor(dependentChoices.flatMap(choices => choices.byCategory[category] ?? []));
        if (!sample) return [];
        const note = [`Example: ${sample.dish}.`, sample.photo.note].filter(Boolean).join(' ');
        return [{ dish: category, photo: { ...sample.photo, note } }];
      });
    }
    if (field.key === 'appetizer' && !field.dishChoices) {
      return [{ dish: chefMenuChoice, photo: appetizerReferencePhoto }];
    }
    return this.photosFor(this.choices(field));
  }

  protected includedPhotos() {
    return this.photosFor(this.definition().includedItems);
  }

  private photosFor(dishes: readonly string[]) {
    return dishes.flatMap(dish => {
      const photo = menuDishPhotos.get(dish);
      return photo ? [{ dish, photo }] : [];
    });
  }

  private select(field: PackageMenuField, value: string): void {
    this.edited.update(keys => new Set([...keys, field.key]));
    const values = { ...this.values(), [field.key]: value };
    const dishChoices = field.dishChoices;
    if (dishChoices && 'categoryField' in dishChoices
        && !Object.hasOwn(dishChoices.byCategory, values[dishChoices.categoryField])) {
      const matches = Object.keys(dishChoices.byCategory).filter(category => dishChoices.byCategory[category].includes(value));
      if (matches.length === 1) values[dishChoices.categoryField] = matches[0];
    }
    if (field.options && value !== this.values()[field.key]) {
      for (const dish of this.definition().fields) {
        const choices = dish.dishChoices;
        if (choices && 'categoryField' in choices && choices.categoryField === field.key) {
          values[dish.key] = chefMenuChoice;
          if (this.openGallery() === dish.key) this.openGallery.set(null);
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
      ? choices.byCategory[this.values()[choices.categoryField]]
        ?? [...new Set(Object.values(choices.byCategory).flat())]
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
