import type { CSSProperties } from 'react';
import type { Photo } from '../../lib/recipe';

/** Background-image style for a recipe photo; empty when the recipe has no photo (the placeholder tone shows instead). */
export const photoStyle = (photo?: string): CSSProperties => (photo ? { backgroundImage: `url(${photo})` } : {});

/** Every recipe photo is 4:3: the recipe page, the cards and the crop frame all use it. */
export const PHOTO_RATIO = 4 / 3;
const MAX_ORIGINAL = 2048; // long edge of the full photo kept for re-cropping
const MAX_CROP_WIDTH = 1600; // width of the 4:3 crop that's shown

type Box = NonNullable<Photo['crop']>;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Draw part of an image onto a new canvas at the given size and return it as a JPEG data URL. */
const draw = (img: CanvasImageSource, box: Box, width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
};

/** The largest 4:3 box in the middle of an image. */
export const centerBox = (w: number, h: number): Box => {
  const width = Math.min(w, h * PHOTO_RATIO);
  const height = width / PHOTO_RATIO;
  return { x: Math.round((w - width) / 2), y: Math.round((h - height) / 2), width: Math.round(width), height: Math.round(height) };
};

/** The 4:3 picture that shows for a crop box on an image. */
export const cropImage = (img: CanvasImageSource, box: Box) => {
  const width = Math.min(MAX_CROP_WIDTH, box.width);
  return draw(img, box, width, width / PHOTO_RATIO);
};

/**
 * A photo picked on the phone: shrunk to a 2048px long edge (kept as the original, for re-cropping) and centre-cropped
 * to 4:3 until it's cropped by hand.
 */
export async function photoFromFile(file: File, id: string): Promise<Photo> {
  const img = await loadImage(await readFile(file));
  const scale = Math.min(1, MAX_ORIGINAL / Math.max(img.naturalWidth, img.naturalHeight));
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const original = draw(img, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight }, w, h);
  const small = await loadImage(original);
  const crop = centerBox(small.naturalWidth, small.naturalHeight);
  return { id, src: cropImage(small, crop), original, crop };
}

/** Apply a crop made in the cropper to a photo. */
export async function recrop(photo: Photo, box: Box): Promise<Photo> {
  const original = photo.original ?? photo.src;
  const img = await loadImage(original);
  return { ...photo, original, crop: box, src: cropImage(img, box) };
}
