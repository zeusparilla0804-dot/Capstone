// Accept local/international Philippine mobile numbers, including the displayed grouping.
export const PHILIPPINE_MOBILE_PATTERN = /^\s*(?:09|\+639)[0-9]{2} ?[0-9]{3} ?[0-9]{4}\s*$/;

export function isObviousTestMobile(value: string): boolean {
  const normalized = value.trim().replaceAll(' ', '');
  const suffix = normalized.startsWith('+63') ? normalized.slice(4) : normalized.slice(2);
  return /^(\d)\1{8}$/.test(suffix) || /^(?:012345678|123456789|234567890|987654321|876543210)$/.test(suffix);
}
