const PACKAGE_IMAGE_ROOT = 'assets/images/packages';

function clientGallery(directory: string, prefix: string, count: number): readonly string[] {
  return Array.from(
    { length: count },
    (_, index) => `${PACKAGE_IMAGE_ROOT}/${directory}/client-${prefix}-${String(index + 1).padStart(2, '0')}.jpg`,
  );
}

export const CLIENT_EVENT_GALLERIES = {
  wedding: clientGallery('wedding', 'wedding', 19),
  birthday: clientGallery('birthday', 'kids-birthday', 13),
  debut: clientGallery('debut', 'debut', 29),
  corporate: [
    ...clientGallery('corporate', 'business-forum', 6),
    ...clientGallery('corporate', 'team-building', 4),
  ],
} as const;
