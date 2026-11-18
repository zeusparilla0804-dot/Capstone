export interface PackageMenuField {
  key: string;
  label: string;
  options?: readonly string[];
}

export interface PackageMenuDefinition {
  fields: readonly PackageMenuField[];
  includedItems: readonly string[];
}

export interface MenuSelectionSnapshot {
  items: readonly { key: string; label: string; value: string }[];
  includedItems: readonly string[];
}
