import { findAddOns, findPackageById, findPackages } from '../repositories/catalog.repository.js';
import { AppError } from '../utils/app-error.js';
export const catalogService = {
  packages: findPackages,
  addOns: () => findAddOns(),
  async packageById(id: number) { const item = await findPackageById(id); if (!item) throw new AppError(404, 'Package not found.'); return item; },
  async addOnById(id: number) { const item = (await findAddOns([id]))[0]; if (!item) throw new AppError(404, 'Add-on not found.'); return item; },
};
