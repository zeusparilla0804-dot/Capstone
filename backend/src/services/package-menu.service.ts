import type { MenuSelectionSnapshot, PackageMenuDefinition, PackageMenuField } from '../types/menu.types.js';
import { AppError } from '../utils/app-error.js';
import { text } from '../utils/validation.js';

const proteinFields = (proteins: readonly string[]): PackageMenuField[] => proteins.map(protein => ({
  key: protein.toLowerCase(), label: `${protein} dish`,
}));
const mainFields = (count: number): PackageMenuField[] => Array.from({ length: count }, (_, index) => ({
  key: `main${index + 1}`, label: `Main dish ${index + 1}`,
}));

export function packageMenu(packageName: string): PackageMenuDefinition | undefined {
  const name = packageName.trim().toLowerCase().replace(/\s+/g, ' ');
  let mains: PackageMenuField[];
  let soup = false;
  let vegetable = false;
  let appetizer = false;
  let includedItems = ['Steamed rice', 'Purified water with tube ice'];
  switch (name) {
    case 'php 480 per head':
      mains = proteinFields(['Pork', 'Chicken', 'Fish']);
      includedItems = ['Dinner rolls with butter', 'Seasonal fresh fruit platter', ...includedItems];
      break;
    case 'php 580 per head':
      mains = proteinFields(['Beef', 'Pork', 'Chicken', 'Fish']);
      appetizer = true;
      includedItems = ['Fresh garden salad with dressing', ...includedItems];
      break;
    case 'php 680 per head': mains = proteinFields(['Beef', 'Pork', 'Chicken', 'Fish']); soup = true; vegetable = true; break;
    case 'amethyst': case 'amethyst package': mains = mainFields(3); includedItems = ['Steamed rice']; break;
    case 'diamond': case 'diamond package': mains = mainFields(4); soup = true; includedItems = ['Steamed rice']; break;
    case 'ruby': case 'ruby package': mains = mainFields(4); soup = true; vegetable = true; includedItems = ['Steamed rice']; break;
    case 'bronze': case 'bronze package':
      mains = [{ key: 'firstMainProtein', label: 'First main dish category', options: ['Beef', 'Pork'] },
        { key: 'firstMainDish', label: 'Beef or pork dish' }, ...proteinFields(['Chicken', 'Fish'])];
      break;
    case 'silver': case 'silver package': mains = proteinFields(['Beef', 'Pork', 'Chicken', 'Fish']); soup = true; break;
    case 'gold': case 'gold package': mains = proteinFields(['Beef', 'Pork', 'Chicken', 'Fish']); soup = true; vegetable = true; break;
    default: return undefined;
  }
  return {
    fields: [
      ...mains,
      ...(appetizer ? [{ key: 'appetizer', label: 'Appetizer' }] : []),
      ...(soup ? [{ key: 'soup', label: 'Soup' }] : []),
      { key: 'sideKind', label: 'Side dish category', options: vegetable ? ['Pasta', 'Noodles'] : ['Pasta', 'Noodles', 'Vegetables'] },
      { key: 'sideDish', label: 'Preferred side dish' },
      ...(vegetable ? [{ key: 'vegetable', label: 'Vegetable dish' }] : []),
      { key: 'dessert', label: 'Dessert' },
      { key: 'drink', label: 'Drink' },
    ],
    includedItems,
  };
}

export function parseMenuSelections(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'Menu selections are invalid.');
  const entries = Object.entries(value);
  if (entries.length > 20 || entries.some(([key]) => !/^[a-z][a-zA-Z0-9]{0,39}$/.test(key))) {
    throw new AppError(400, 'Menu selections are invalid.');
  }
  return Object.fromEntries(entries.map(([key, entry]) => [key, text(entry, 'Menu dish', { min: 2, max: 120 })]));
}

export function buildMenuSnapshot(packageName: string, selections: Record<string, string> | undefined): MenuSelectionSnapshot | undefined {
  if (selections === undefined) return undefined;
  const definition = packageMenu(packageName);
  if (!definition || Object.keys(selections).some(key => !definition.fields.some(field => field.key === key))) {
    throw new AppError(400, 'Menu selections do not match the selected package.');
  }
  const items = definition.fields.map(field => {
    const value = text(selections[field.key], `${field.label} menu choice`, { min: 2, max: 120 });
    if (field.options && !field.options.includes(value)) throw new AppError(400, `Select an available menu option for ${field.label.toLowerCase()}.`);
    return { key: field.key, label: field.label, value };
  });
  return { items, includedItems: definition.includedItems };
}

export function readMenuSnapshot(value: unknown): MenuSelectionSnapshot | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const snapshot: unknown = JSON.parse(value);
    if (!snapshot || typeof snapshot !== 'object') return undefined;
    const { items, includedItems } = snapshot as MenuSelectionSnapshot;
    if (!Array.isArray(items) || !items.length || !Array.isArray(includedItems)
      || items.some(item => !item || typeof item.key !== 'string' || typeof item.label !== 'string' || typeof item.value !== 'string')
      || includedItems.some(item => typeof item !== 'string')) return undefined;
    return { items, includedItems };
  } catch { return undefined; }
}
