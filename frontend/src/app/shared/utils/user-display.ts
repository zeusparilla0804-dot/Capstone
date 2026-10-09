export function initialsForName(name: string | null | undefined, fallback = 'C'): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return fallback.toUpperCase();
  const initials = parts.length === 1
    ? parts[0]!.charAt(0)
    : `${parts[0]!.charAt(0)}${parts.at(-1)!.charAt(0)}`;
  return initials.toLocaleUpperCase('en-PH');
}
