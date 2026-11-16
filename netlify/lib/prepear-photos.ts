// Issue #14: where a Prepear photo can be fetched from. Prepear's answers give a photo as a path in its storage,
// "/prepear-prod/<owner>/<recipe>/<photo>.jpg"; its pages show it from ImageKit, at https://ik.imagekit.io/prepear/…
// (seen without the "prepear-prod" folder, so both forms are tried). Only that host, and only paths made of ids, so
// the photo endpoint can't be pointed anywhere else.

const PATH = /^\/(?:[\w-]+\/){1,4}[\w-]+\.(?:jpe?g|png|webp)$/i;
const HOST = 'https://ik.imagekit.io/prepear';

export function prepearPhotoUrls(path: unknown): string[] | null {
  if (typeof path !== 'string' || !PATH.test(path) || path.includes('..')) return null;
  const withoutBucket = path.replace(/^\/prepear-prod\//, '/');
  return [...new Set([`${HOST}${path}`, `${HOST}${withoutBucket}`])];
}
