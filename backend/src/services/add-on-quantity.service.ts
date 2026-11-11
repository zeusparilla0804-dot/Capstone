import type { AddOnRecord } from '../types/domain.types.js';
import { AppError } from '../utils/app-error.js';

export function priceSelectedAddOns(catalog: AddOnRecord[], quantities: Record<string, number> = {}): AddOnRecord[] {
  if (Object.keys(quantities).some(id => !catalog.some(item => String(item.id) === id))) {
    throw new AppError(400, 'Add-on quantities must refer to selected add-ons.');
  }
  return catalog.map(item => {
    const quantity = quantities[String(item.id)] ?? 1;
    const name = item.name.trim().toLowerCase().replace(/[–—]/g, '-');
    const supportsQuantity = name === 'tiffany chair' || name === 'lechon (35-40 kg live weight)' || name === 'lechon (25-30 kg live weight)'
      || /^(?:coffee bar|grazing table) for (?:50|100) guests$/.test(name);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647
      || (!supportsQuantity && quantity !== 1) || item.price * quantity > 9999999999.99) {
      throw new AppError(400, 'Add-on quantity is invalid.');
    }
    return { ...item, quantity, unitPrice: item.price, price: Math.round(item.price * quantity * 100) / 100 };
  });
}
