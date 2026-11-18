// Issue #17: a recipe read from photos or screenshots (a cookbook page, an Instagram post, a handwritten card).
// The server (netlify/lib/read-recipe.ts) asks Claude, through Netlify's AI Gateway, to copy the recipe out of the
// images in this shape; the editor turns it into rows with the same parsing as the paste boxes, so every ingredient
// keeps its line exactly as it was written.

import { z } from 'zod';
import { parseLine, isStepLabel, stepText } from './ingredients';
import { newId, recipeNamed, type Ingredient, type Recipe, type Step } from './recipe';

/** At most this many images per recipe (a recipe over two screenshots, or a page and its facing page). */
export const MAX_READ_IMAGES = 4;

/** Where the photo of the finished dish is, if one of the images has one: pixels on that image as it was sent. */
export const DishPhoto = z.object({
  /** which image, counting from 0 */
  image: z.number(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});
export type DishPhoto = z.infer<typeof DishPhoto>;

export const ReadRecipe = z.object({
  /** false when the images don't show a recipe; everything else is then empty */
  found: z.boolean(),
  title: z.string(),
  /** who or where it's from, as shown: an author, a book, a website, an account */
  source: z.string(),
  servings: z.number().nullable(),
  servingSize: z.string(),
  prepMinutes: z.number().nullable(),
  cookMinutes: z.number().nullable(),
  /** ingredient lines as written, in groups; `group` is the group's heading, or empty for lines under none */
  ingredients: z.array(z.object({ group: z.string(), lines: z.array(z.string()) })),
  /** the directions as written, one step per entry, in groups like the ingredients */
  directions: z.array(z.object({ group: z.string(), steps: z.array(z.string()) })),
  /** tips, swaps, storage and the like, as written */
  notes: z.string(),
  dishPhoto: DishPhoto.nullable(),
});
export type ReadRecipe = z.infer<typeof ReadRecipe>;

/** The long edge of an image sent to be read: Claude reads text well at this size, and a few fit in one request. */
export const READ_IMAGE_EDGE = 1568;

/** The images sent to be read: JPEG data URLs, shrunk on the phone (src/components/ui/photo.ts), with their size. */
export const ReadRequest = z.object({
  images: z
    .array(
      z.object({
        data: z.string().startsWith('data:image/jpeg;base64,'),
        width: z.number().int().positive().max(8000),
        height: z.number().int().positive().max(8000),
      }),
    )
    .min(1)
    .max(MAX_READ_IMAGES),
});
export type ReadRequest = z.infer<typeof ReadRequest>;

// ── Issue #15: a recipe from a link. The server opens the page and reads the recipe the site publishes in it (schema.org
// JSON-LD), or, on a page without one, has Claude read the page's text (kept as a job like the photos). ──

/** What the phone sends: the link. */
export const LinkRequest = z.object({ url: z.string().min(1).max(2000) });

/** A page without a recipe in it for search engines, kept for the background function: its text for Claude. */
export const PageRequest = z.object({
  page: z.object({
    url: z.string().max(2000),
    text: z.string().max(100_000),
    /** the page's photo (a data URL), handed back with the reading */
    photo: z.string().startsWith('data:image/').optional(),
  }),
});
export type PageRequest = z.infer<typeof PageRequest>;

/** What a reading job reads: photos, or a page's text. */
export const JobRequest = z.union([ReadRequest, PageRequest]);
export type JobRequest = z.infer<typeof JobRequest>;

/** A recipe read from a link: the page's address (after any redirect), and the dish photo the page had, as a data URL. */
export const LinkReading = z.object({ url: z.string(), recipe: ReadRecipe, photo: z.string().startsWith('data:image/').optional() });
export type LinkReading = z.infer<typeof LinkReading>;

/** The first web address in what was pasted ("Look at this! https://…"), or a bare "example.com/recipe", or null. */
export function linkIn(text: string): string | null {
  const t = text.trim();
  const full = t.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const bare = full ? null : t.match(/^(?:www\.)?[a-z\d-]+(?:\.[a-z\d-]+)*\.[a-z]{2,}(?:[/?#]\S*)?$/i)?.[0];
  const found = full ?? (bare ? `https://${bare}` : null);
  return found ? found.replace(/[).,;!?'"’”]+$/, '') : null;
}

/** Two links to the same page: the same address without its scheme, "www.", tracking bits (utm_…) or a trailing slash. */
export function sameLink(a: string, b: string): boolean {
  const key = (u: string) => {
    try {
      const url = new URL(u);
      for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|igsh)/i.test(k)) url.searchParams.delete(k);
      url.hash = '';
      return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
    } catch {
      return u.trim().toLowerCase();
    }
  };
  return key(a) === key(b);
}

const minutes = (n: number | null) => (n && n > 0 ? Math.min(100000, Math.round(n)) : 0);

/**
 * The parts of a recipe a reading fills in, as editor rows: an ingredient line is parsed like a pasted one (its raw line
 * kept as written, and linked to a recipe of the same name, issue #11); a step loses its number ("1. Heat…").
 */
export function readToRecipe(read: ReadRecipe, others: Recipe[] = []) {
  const ingredients: Ingredient[] = read.ingredients.flatMap(({ group, lines }) => {
    const rows: Ingredient[] = lines
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parsed = parseLine(line);
        const r = recipeNamed(parsed.name, others);
        return { id: newId(), ...parsed, raw: line, ...(r ? { recipeId: r.id } : {}) };
      });
    const title = group.trim().replace(/:$/, '').trim();
    return title && rows.length ? [{ id: newId(), kind: 'header' as const, amount: '', unit: '', name: title, note: '' }, ...rows] : rows;
  });
  const steps: Step[] = read.directions.flatMap(({ group, steps: texts }) => {
    const rows: Step[] = texts
      .map((t) => t.trim())
      .filter((t) => t && !isStepLabel(t))
      .map((t) => ({ id: newId(), text: stepText(t) }))
      .filter((s) => s.text);
    const title = group.trim().replace(/:$/, '').trim();
    return title && rows.length ? [{ id: newId(), kind: 'header' as const, text: title }, ...rows] : rows;
  });
  return {
    title: read.title.trim(),
    source: read.source.trim(),
    servings: read.servings && read.servings > 0 ? Math.min(1000, read.servings) : null,
    servingSize: read.servingSize.trim(),
    prepMinutes: minutes(read.prepMinutes),
    cookMinutes: minutes(read.cookMinutes),
    ingredients,
    steps,
    notes: read.notes.trim(),
  };
}

/**
 * A recipe being edited with a reading added: empty fields are filled, rows and notes are added after what's there
 * (typing while the photo was being read isn't lost).
 */
export function withReading(draft: Recipe, read: ReadRecipe, others: Recipe[] = []): Recipe {
  const r = readToRecipe(read, others);
  return {
    ...draft,
    title: draft.title.trim() ? draft.title : r.title,
    source: draft.source.trim() ? draft.source : r.source,
    servings: r.servings ?? draft.servings,
    servingSize: draft.servingSize.trim() ? draft.servingSize : r.servingSize,
    prepMinutes: draft.prepMinutes || r.prepMinutes,
    cookMinutes: draft.cookMinutes || r.cookMinutes,
    ingredients: [...draft.ingredients, ...r.ingredients],
    steps: [...draft.steps, ...r.steps],
    notes: [draft.notes.trim(), r.notes].filter(Boolean).join('\n\n'),
  };
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The square crop box (issue #51; recipe photos are square) for the dish photo, on the photo as kept (`width` × `height`), from the box Claude gave on the image
 * it was sent (`sentWidth` wide): just big enough to hold the dish photo, centred on it, inside the image.
 */
export function dishCrop(dish: DishPhoto, sentWidth: number, width: number, height: number, ratio = 1): Box | null {
  const k = width / sentWidth;
  const left = Math.max(0, dish.left * k);
  const top = Math.max(0, dish.top * k);
  const right = Math.min(width, (dish.left + dish.width) * k);
  const bottom = Math.min(height, (dish.top + dish.height) * k);
  // too small to be a photo (or off the image): no photo rather than a blur
  if (right - left < width * 0.15 || bottom - top < height * 0.05) return null;
  let w = Math.max(right - left, (bottom - top) * ratio);
  let h = w / ratio;
  if (w > width) [w, h] = [width, width / ratio];
  if (h > height) [w, h] = [height * ratio, height];
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
  const x = clamp((left + right) / 2 - w / 2, width - w);
  const y = clamp((top + bottom) / 2 - h / 2, height - h);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
