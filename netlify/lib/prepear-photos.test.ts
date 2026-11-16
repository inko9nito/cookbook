import { describe, expect, test } from 'vitest';
import { prepearPhotoUrls } from './prepear-photos';

describe('Prepear photo addresses (#14)', () => {
  test('a stored path becomes ImageKit addresses, with and without the bucket folder', () => {
    expect(prepearPhotoUrls('/prepear-prod/4221fb70-8326/5fd9e320-8ddb/606903c0-8ddb.jpg')).toEqual([
      'https://ik.imagekit.io/prepear/prepear-prod/4221fb70-8326/5fd9e320-8ddb/606903c0-8ddb.jpg',
      'https://ik.imagekit.io/prepear/4221fb70-8326/5fd9e320-8ddb/606903c0-8ddb.jpg',
    ]);
  });
  test('anything else is refused, so the endpoint fetches nothing but Prepear photos', () => {
    for (const bad of ['https://evil.example/x.jpg', '//evil.example/x.jpg', '/a/../b.jpg', '/a/b.svg', 'a/b.jpg', '/a/b c.jpg', 42, null])
      expect(prepearPhotoUrls(bad)).toBeNull();
  });
});
