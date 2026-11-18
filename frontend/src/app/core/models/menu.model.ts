export interface PackageMenuField {
  readonly key: string;
  readonly label: string;
  readonly options?: readonly string[];
}

export interface PackageMenuDefinition {
  readonly fields: readonly PackageMenuField[];
  readonly includedItems: readonly string[];
}

export interface MenuSelectionSnapshot {
  readonly items: readonly { readonly key: string; readonly label: string; readonly value: string }[];
  readonly includedItems: readonly string[];
}

export function menuSelectionsValid(definition: PackageMenuDefinition | undefined, values: Readonly<Record<string, string>> = {}): boolean {
  return !definition || definition.fields.every(field => {
    const value = values[field.key]?.trim() ?? '';
    return field.options ? field.options.includes(value) : value.length >= 2 && value.length <= 120;
  });
}
