// Issue #17: read a recipe from photos or screenshots with Claude, through Netlify's AI Gateway. On Netlify the gateway
// gives every function ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL, so the SDK's default client uses it and the usage is
// billed to the Netlify account (no second service, no key of our own). An ANTHROPIC_API_KEY set on the site by hand
// would be used instead.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { JobRequest, ReadRecipe, type LinkReading, type PageRequest } from '../../src/lib/read-recipe';
import { LinkError, fetchPage, fetchPhoto, isBotCheck, isPublicUrl, readPage, siteOf } from './web-recipe';

/** The model, unless the site sets READ_RECIPE_MODEL (e.g. if the gateway doesn't offer this one). */
export const DEFAULT_MODEL = 'claude-opus-5-5';

/** All the images together, as sent (base64): well under the 6 MB a function can be sent. */
export const MAX_IMAGE_CHARS = 5_000_000;

export const SYSTEM = `You copy recipes out of photos and screenshots into a personal recipe app. The images may be a cookbook page photographed with a phone, a screenshot of a website or a social media post, or a handwritten recipe card. When there are several images, they are parts of one recipe, in order: screenshots taken while scrolling often repeat a few lines, so copy repeated text only once.

Copy the recipe exactly as it is written. Keep the wording, amounts, fractions (½ or 1/2, as printed), units and abbreviations, notes in brackets, and the language. Do not convert, correct, translate, shorten or add anything that isn't in the images. If a word can't be read, give your best reading of it.

- title: the recipe's name.
- source: who or where it's from, as shown (an author, a book and page, a website, an account name like @someone). Empty if nothing says.
- servings: the number it serves or makes ("Serves 4" → 4; "Serves 4-6" → 4). Null if not stated. servingSize: a portion if stated ("1 slice", "1 cup"), else empty.
- prepMinutes and cookMinutes: only if stated, in minutes ("1 hr 15 min" → 75). If only a total time is given, put it in cookMinutes. Null if not stated.
- ingredients: one line per ingredient, as printed ("2 cups (250 g) flour, sifted"). Join a line that wraps onto the next printed line. Ingredients under a heading ("For the sauce", "Topping") go in a group with that heading, without a trailing colon; ingredients under no heading go in a group with an empty heading.
- directions: one entry per step, without its step number; join a step that continues onto the next image. Unnumbered paragraphs are one step each. Group them under headings the same way as the ingredients.
- notes: tips, swaps, storage and make-ahead notes written with the recipe, as written. Leave out the story or introduction before the recipe, nutrition facts, hashtags, and anything that is the app or website around it (buttons, likes, comments, ads).
- dishPhoto: if an image includes a photograph of the finished dish, the box around that photograph, in pixels of that image (each image's size is given before it), with image counted from 0. Choose the largest such photograph. Null if there is none: a photo of a printed page or a screenshot of text alone has none.
- found: false if the images don't show a recipe at all; then leave everything else empty.`;

/** Issue #15: the same, for a web page without a recipe in it for search engines (its text, made from the HTML). */
export const PAGE_SYSTEM = `You copy recipes out of web pages into a personal recipe app. You get the text of one page (a recipe blog, a news site, a social media post), made from its HTML: the address, the site, the page title and summary come first, then the page's text, one block per line. Pages often bury the recipe under a long story, adverts, links to other recipes and comments; copy only the recipe itself.

Copy the recipe exactly as it is written. Keep the wording, amounts, fractions, units and abbreviations, notes in brackets, and the language. Do not convert, correct, translate, shorten or add anything that isn't on the page. If the page shows a recipe more than once (a summary and a full recipe card), copy the most complete one.

- title: the recipe's name.
- source: who it's from, as the page says (an author, or an account name like @someone for a social media post); else the site.
- servings: the number it serves or makes ("Serves 4" → 4; "Serves 4-6" → 4). Null if not stated. servingSize: a portion if stated ("1 slice", "1 cup"), else empty.
- prepMinutes and cookMinutes: only if stated, in minutes ("1 hr 15 min" → 75). If only a total time is given, put it in cookMinutes. Null if not stated.
- ingredients: one line per ingredient, as written ("2 cups (250 g) flour, sifted"), without a bullet. Ingredients under a heading ("For the sauce", "Topping") go in a group with that heading, without a trailing colon; ingredients under no heading go in a group with an empty heading.
- directions: one entry per step, without its step number. Unnumbered paragraphs are one step each. Group them under headings the same way as the ingredients.
- notes: tips, swaps, storage and make-ahead notes written with the recipe, as written. Leave out the story or introduction, nutrition facts, hashtags, reader comments, and anything that is the site around it.
- dishPhoto: always null (there are no images).
- found: false if the page doesn't have a recipe on it (only a link to one, or a page that couldn't be shown); then leave everything else empty.`;

/** A refusal to show the person, with the status to send. */
export class ReadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The request to Claude: each image after a line that says which one it is and its size; or a page's text. */
export function readParams(req: JobRequest, model = DEFAULT_MODEL) {
  if ('page' in req) {
    return {
      model,
      max_tokens: 16000,
      output_config: { effort: 'low' as const, format: zodOutputFormat(ReadRecipe) },
      system: PAGE_SYSTEM,
      messages: [{ role: 'user' as const, content: `${req.page.text}\n\n---\nCopy the recipe from this page.` }],
    };
  }
  const content: Anthropic.ContentBlockParam[] = req.images.flatMap((img, i) => [
    { type: 'text' as const, text: `Image ${i}: ${img.width}×${img.height} pixels` },
    {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: img.data.slice(img.data.indexOf(',') + 1) },
    },
  ]);
  content.push({ type: 'text', text: req.images.length > 1 ? 'Copy the recipe from these images.' : 'Copy the recipe from this image.' });
  return {
    model,
    max_tokens: 16000,
    // copying text out of an image needs little reasoning; low keeps the wait short
    output_config: { effort: 'low' as const, format: zodOutputFormat(ReadRecipe) },
    system: SYSTEM,
    messages: [{ role: 'user' as const, content }],
  };
}

/** What a failed call to Claude means for the person reading a photo (or a page, issue #15). */
export function readFailure(e: unknown, page = false): ReadError {
  const reading = page ? 'Reading pages' : 'Reading photos';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new ReadError(503, `${reading} isn’t set up on this site: Netlify’s AI Gateway didn’t accept the request.`);
  }
  if (e instanceof Anthropic.NotFoundError) return new ReadError(503, `${reading} isn’t set up on this site: the AI model wasn’t found.`);
  if (e instanceof Anthropic.RateLimitError) return new ReadError(429, `Too many ${page ? 'pages' : 'photos'} read just now. Try again in a minute.`);
  if (e instanceof Anthropic.BadRequestError) return new ReadError(400, page ? 'That page couldn’t be read. Take screenshots of the recipe and use From photos or screenshots instead.' : 'That photo couldn’t be read. Try a different one.');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ReadError(504, 'Claude took too long to answer. Try again.');
  if (e instanceof Anthropic.APIError) return new ReadError(502, 'Claude is busy right now. Try again in a moment.');
  return new ReadError(500, `Reading the ${page ? 'page' : 'photo'} failed: ${e instanceof Error ? e.message : String(e)}`);
}

/** Whether the photos (or page) can be read at all: not too large together, and the AI Gateway (or a key) is there. */
export function checkReadable(req: JobRequest, hasClient = false) {
  const page = 'page' in req;
  if (!page && req.images.reduce((n, img) => n + img.data.length, 0) > MAX_IMAGE_CHARS) throw new ReadError(413, 'Those photos are too large together. Try fewer.');
  if (!hasClient && !process.env.ANTHROPIC_API_KEY) throw new ReadError(503, `Reading ${page ? 'pages' : 'photos'} isn’t set up on this site: it needs Netlify’s AI Gateway.`);
}

/**
 * Read the recipe in the images. Throws a ReadError with a message for the person. It runs in a background function
 * (reading can take longer than the 30 seconds an ordinary function gets), so it can wait for Claude and retry once
 * it's busy.
 */
export async function readRecipe(req: JobRequest, client?: Anthropic, model = process.env.READ_RECIPE_MODEL || DEFAULT_MODEL): Promise<ReadRecipe> {
  checkReadable(req, !!client);
  const page = 'page' in req;
  const claude = client ?? new Anthropic({ timeout: 180_000, maxRetries: 2 });
  let message;
  try {
    message = await claude.messages.parse(readParams(req, model));
  } catch (e) {
    throw readFailure(e, page);
  }
  if (message.stop_reason === 'refusal') throw new ReadError(422, page ? 'Claude wouldn’t read that page.' : 'Claude wouldn’t read that photo. Try a different one.');
  if (message.stop_reason === 'max_tokens' || !message.parsed_output) throw new ReadError(502, page ? 'The recipe couldn’t be read completely. Try again.' : 'The recipe couldn’t be read completely. Try again, or with fewer photos.');
  return message.parsed_output;
}

// ── Reading as a job (issue #17). The phone sends the photos (POST /api/read-recipe); they're kept in Blobs (store
// "reads") and the background function reads them; the phone asks for the result every couple of seconds
// (GET /api/read-recipe/:id). A result is deleted once the phone has it. ──

/** Where the jobs are kept: the parts of a Netlify Blobs store used (a Map stands in for it in the tests). */
export type Jobs = {
  get: (key: string, options: { type: 'json' }) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
};

export type JobStatus =
  | { status: 'reading' }
  /** a page's reading (issue #15) also hands back the page's address and photo */
  | { status: 'done'; recipe: ReadRecipe; url?: string; photo?: string }
  | { status: 'failed'; code: number; error: string };

/** A reading that hasn't finished after this long has stopped (the background function died). */
export const JOB_LIMIT_MS = 6 * 60_000;

type Kept = JobStatus & { at: number };

/** Keep the photos (or page) and mark the job as being read; returns its id. */
export async function startJob(jobs: Jobs, req: JobRequest, now = Date.now()): Promise<string> {
  checkReadable(req);
  const id = crypto.randomUUID();
  await jobs.setJSON(`${id}/request`, req);
  await jobs.setJSON(`${id}/status`, { status: 'reading', at: now } satisfies Kept);
  return id;
}

/** Read a job's photos (the background function) and keep the result; the photos are deleted first. */
export async function runJob(jobs: Jobs, id: string, read: (req: JobRequest) => Promise<ReadRecipe> = readRecipe, now = () => Date.now()) {
  const kept = await jobs.get(`${id}/request`, { type: 'json' });
  if (!kept) return;
  await jobs.delete(`${id}/request`);
  let result: JobStatus;
  const page = (kept as Partial<PageRequest>).page;
  try {
    const req = JobRequest.parse(kept);
    const recipe = await read(req);
    result = 'page' in req ? { status: 'done', recipe, url: req.page.url, ...(req.page.photo ? { photo: req.page.photo } : {}) } : { status: 'done', recipe };
  } catch (e) {
    const failure = e instanceof ReadError ? e : readFailure(e, !!page);
    result = { status: 'failed', code: failure.status, error: failure.message };
  }
  await jobs.setJSON(`${id}/status`, { ...result, at: now() } satisfies Kept);
}

/** How a job is doing, or null when there's no such job. A finished one is handed over once and then deleted. */
export async function jobStatus(jobs: Jobs, id: string, now = Date.now()): Promise<JobStatus | null> {
  const kept = (await jobs.get(`${id}/status`, { type: 'json' })) as Kept | null;
  if (!kept) return null;
  if (kept.status === 'reading') {
    if (now - kept.at < JOB_LIMIT_MS) return { status: 'reading' };
    await jobs.delete(`${id}/request`);
    await jobs.delete(`${id}/status`);
    return { status: 'failed', code: 504, error: 'Reading the recipe stopped part way. Try again.' };
  }
  await jobs.delete(`${id}/status`);
  const { at: _at, ...status } = kept;
  return status;
}

// ── Issue #15: a recipe from a link. ──

/** Below this much text, a page has nothing for Claude to read (a page drawn by its script, a sign-in wall). */
const MIN_PAGE_TEXT = 300;

/**
 * Open the page at a link. A page with a recipe in it for search engines (schema.org JSON-LD, most recipe sites) is
 * read at once, without Claude: `{ done }`. Any other page comes back as its text for Claude to read as a job:
 * `{ page }`. Either way with the page's photo when it has one. Throws a ReadError with a message for the person.
 */
export async function readLink(link: string, fetchImpl: typeof fetch = fetch): Promise<{ done: LinkReading } | { page: PageRequest }> {
  if (!isPublicUrl(link)) throw new ReadError(400, 'That isn’t a link to a web page.');
  try {
    const { html, url } = await fetchPage(link, fetchImpl);
    const found = readPage(html, url);
    if (found.kind === 'text' && isBotCheck(html)) {
      throw new ReadError(502, `${siteOf(url) || 'That site'} wouldn’t let the app read the page. Take screenshots of the recipe and use From photos or screenshots instead.`);
    }
    const photo = (await fetchPhoto(found.photoUrl, url, fetchImpl)) ?? undefined;
    if (found.kind === 'recipe') return { done: { url, recipe: found.recipe, ...(photo ? { photo } : {}) } };
    if (found.text.split('\n').slice(3).join('\n').length < MIN_PAGE_TEXT) {
      throw new ReadError(422, 'The app couldn’t see a recipe on that page. Take screenshots of the recipe and use From photos or screenshots instead.');
    }
    return { page: { page: { url, text: found.text, ...(photo ? { photo } : {}) } } };
  } catch (e) {
    if (e instanceof LinkError) throw new ReadError(e.status, e.message);
    throw e;
  }
}
