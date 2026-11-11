import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGallery, validatePackageImage } from './package-images.service.js';

test('gallery keeps ordered built-in, existing and uploaded photos', () => {
  assert.deepEqual(validateGallery(JSON.stringify([{ id: 7 }, { assetPath: 'assets/images/packages/wedding/gold-01.jpg' }, { fileIndex: 0 }]), 1),
    [{ id: 7 }, { assetPath: 'assets/images/packages/wedding/gold-01.jpg' }, { fileIndex: 0 }]);
});
test('gallery rejects traversal, external URLs, duplicates and absent uploads', () => {
  for (const entries of [[{ assetPath: 'assets/images/packages/../secret.jpg' }], [{ assetPath: 'https://example.com/a.jpg' }], [{ id: 1 }, { id: 1 }], [{ fileIndex: 1 }], []]) {
    assert.throws(() => validateGallery(JSON.stringify(entries), 1));
  }
});
test('package uploads validate the file bytes rather than trusting the filename', async () => {
  await assert.rejects(validatePackageImage(Buffer.from('<svg></svg>'), 'image/jpeg'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  assert.equal((await validatePackageImage(png, 'image/png')).mime, 'image/png');
  await assert.rejects(validatePackageImage(png, 'image/jpeg'));
});
