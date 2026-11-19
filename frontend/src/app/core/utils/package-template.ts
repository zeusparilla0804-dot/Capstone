import { CateringPackage } from '../models';

const templateNames: Readonly<Record<string, string>> = {
  classic: 'PHP 480 Per Head', expanded: 'PHP 580 Per Head', 'full-buffet': 'PHP 680 Per Head',
  amethyst: 'Amethyst Package', diamond: 'Diamond Package', ruby: 'Ruby Package',
  bronze: 'Bronze Package', silver: 'Silver Package', gold: 'Gold Package',
};

// The display name can change independently of the package's menu and inclusions.
export function packageTemplateName(pkg: Pick<CateringPackage, 'name' | 'menuKey'>): string {
  return pkg.menuKey === undefined ? pkg.name : templateNames[pkg.menuKey] ?? '';
}
