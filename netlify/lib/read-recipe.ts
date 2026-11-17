// Issue #17: read a recipe from photos or screenshots with Claude, through Netlify's AI Gateway. On Netlify the gateway
// gives every function ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL, so the SDK's default client uses it and the usage is
// billed to the Netlify account (no second service, no key of our own). An ANTHROPIC_API_KEY set on the site by hand
// would be used instead.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ReadRecipe, type ReadRequest } from '../../src/lib/read-recipe';

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

/** A refusal to show the person, with the status to send. */
export class ReadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The request to Claude: each image after a line that says which one it is and its size. */
export function readParams(req: ReadRequest, model = DEFAULT_MODEL) {
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

/** What a failed call to Claude means for the person reading a photo. */
export function readFailure(e: unknown): ReadError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new ReadError(503, 'Reading photos isn’t set up on this site: Netlify’s AI Gateway didn’t accept the request.');
  }
  if (e instanceof Anthropic.NotFoundError) return new ReadError(503, 'Reading photos isn’t set up on this site: the AI model wasn’t found.');
  if (e instanceof Anthropic.RateLimitError) return new ReadError(429, 'Too many photos read just now. Try again in a minute.');
  if (e instanceof Anthropic.BadRequestError) return new ReadError(400, 'That photo couldn’t be read. Try a different one.');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ReadError(504, 'Reading the photo took too long. Try again.');
  if (e instanceof Anthropic.APIError) return new ReadError(502, 'Claude is busy right now. Try again in a moment.');
  return new ReadError(500, `Reading the photo failed: ${e instanceof Error ? e.message : String(e)}`);
}

/** Read the recipe in the images. Throws a ReadError with a message for the person. */
export async function readRecipe(req: ReadRequest, client?: Anthropic, model = process.env.READ_RECIPE_MODEL || DEFAULT_MODEL): Promise<ReadRecipe> {
  if (req.images.reduce((n, img) => n + img.data.length, 0) > MAX_IMAGE_CHARS) throw new ReadError(413, 'Those photos are too large together. Try fewer.');
  if (!client && !process.env.ANTHROPIC_API_KEY) throw new ReadError(503, 'Reading photos isn’t set up on this site: it needs Netlify’s AI Gateway.');
  // one try, under the function's time limit: the person can tap Try Again
  const claude = client ?? new Anthropic({ timeout: 50_000, maxRetries: 0 });
  let message;
  try {
    message = await claude.messages.parse(readParams(req, model));
  } catch (e) {
    throw readFailure(e);
  }
  if (message.stop_reason === 'refusal') throw new ReadError(422, 'Claude wouldn’t read that photo. Try a different one.');
  if (message.stop_reason === 'max_tokens' || !message.parsed_output) throw new ReadError(502, 'The recipe couldn’t be read completely. Try again, or with fewer photos.');
  return message.parsed_output;
}
