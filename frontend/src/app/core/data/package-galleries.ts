import { PackageCategory } from '../models';
import { CLIENT_EVENT_GALLERIES } from './client-event-galleries';

const PACKAGE_IMAGE_ROOT = 'assets/images/packages';
const AMETHYST_GALLERY = [1, 2, 3, 4].map(
  (index) => `${PACKAGE_IMAGE_ROOT}/debut/amethyst-${String(index).padStart(2, '0')}.webp`,
);
const DIAMOND_GALLERY = [1, 2, 3, 4, 5].map(
  (index) => `${PACKAGE_IMAGE_ROOT}/debut/diamond-${String(index).padStart(2, '0')}.jpg`,
);
const RUBY_GALLERY = [1, 2, 3, 4, 5, 6].map(
  (index) => `${PACKAGE_IMAGE_ROOT}/debut/ruby-${String(index).padStart(2, '0')}.jpg`,
);
const GOLD_GALLERY = [1, 2, 3, 4, 5].map(
  (index) => `${PACKAGE_IMAGE_ROOT}/wedding/gold-${String(index).padStart(2, '0')}.jpg`,
);
const SILVER_GALLERY = [1, 2, 3, 4].map(
  (index) => `${PACKAGE_IMAGE_ROOT}/wedding/silver-${String(index).padStart(2, '0')}.jpg`,
);
const BRONZE_GALLERY = [1, 2, 3, 4, 5, 6].map(
  (index) => `${PACKAGE_IMAGE_ROOT}/wedding/bronze-${String(index).padStart(2, '0')}.jpg`,
);
type EventCategory = Exclude<PackageCategory, 'all'>;
const PACKAGE_GALLERIES: Record<EventCategory, readonly string[]> = {
  standard: ['custom-wide', 'custom-buffet', 'custom-table'],
  ...CLIENT_EVENT_GALLERIES,
  anniversary: ['anniversary-wide', 'anniversary-buffet', 'anniversary-table'],
  custom: ['custom-wide', 'custom-buffet', 'custom-table'],
};

function galleryFor(category: EventCategory): readonly string[] {
  if (PACKAGE_GALLERIES[category][0]?.startsWith(PACKAGE_IMAGE_ROOT)) {
    return PACKAGE_GALLERIES[category];
  }
  const directory = category === 'standard' ? 'custom' : category;
  return PACKAGE_GALLERIES[category].map(
    (fileName) => `${PACKAGE_IMAGE_ROOT}/${directory}/${fileName}.png`,
  );
}

export function categoryFor(value: string): EventCategory {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'standard catering') return 'standard';
  if (normalized === 'other') return 'custom';
  return (Object.hasOwn(PACKAGE_GALLERIES, normalized) ? normalized : 'custom') as EventCategory;
}

export function defaultPackageGallery(name: string, category: EventCategory): readonly string[] {
  if (category === 'standard' && /^PHP\s*480(?:\s+per\s+head)?$/i.test(name.trim())) {
    return [1, 2, 3, 4].map(index => `${PACKAGE_IMAGE_ROOT}/standard/classic-ballroom-${String(index).padStart(2, '0')}.jpg`);
  }
  if (category === 'standard' && /^PHP\s*580(?:\s+per\s+head)?$/i.test(name.trim())) {
    return [1, 2, 3, 4].map(index => `${PACKAGE_IMAGE_ROOT}/standard/expanded-buffet-${String(index).padStart(2, '0')}.jpg`);
  }
  if (category === 'standard' && /^PHP\s*680(?:\s+per\s+head)?$/i.test(name.trim())) {
    return [1, 2, 3, 4].map(index => `${PACKAGE_IMAGE_ROOT}/standard/full-buffet-${String(index).padStart(2, '0')}.jpg`);
  }
  return /^ruby(?: package)?$/i.test(name.trim())
                  ? RUBY_GALLERY
                  : /^diamond(?: package)?$/i.test(name.trim())
                  ? DIAMOND_GALLERY
                  : /^bronze(?: package)?$/i.test(name.trim())
                  ? BRONZE_GALLERY
                  : /^silver(?: package)?$/i.test(name.trim())
                    ? SILVER_GALLERY
                    : /^gold(?: package)?$/i.test(name.trim())
                      ? GOLD_GALLERY
                      : /^amethyst(?: package)?$/i.test(name.trim())
                        ? AMETHYST_GALLERY
                        : galleryFor(category);
}
