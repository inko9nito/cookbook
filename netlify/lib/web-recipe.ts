// Issue #15: a recipe from a link. Most recipe sites put a machine-readable copy of the recipe in the page
// (schema.org/Recipe as JSON-LD, for search engines); that's read here, without Claude. A page without one is turned
// into plain text for Claude to read (netlify/lib/read-recipe.ts). Everything here is plain text work on the HTML:
// no browser, no DOM.

import type { ReadRecipe } from '../../src/lib/read-recipe';

// ── text ──

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', times: '×', divide: '÷', minus: '−', frasl: '⁄',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac15: '⅕', frac16: '⅙', frac18: '⅛',
  frac38: '⅜', frac58: '⅝', frac78: '⅞', reg: '®', copy: '©', trade: '™', eacute: 'é', egrave: 'è', ecirc: 'ê',
  euml: 'ë', aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', aring: 'å', atilde: 'ã', iacute: 'í', icirc: 'î',
  iuml: 'ï', oacute: 'ó', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  ntilde: 'ñ', ccedil: 'ç', szlig: 'ß', Eacute: 'É', Aacute: 'Á', Ouml: 'Ö', Uuml: 'Ü', Auml: 'Ä', Ntilde: 'Ñ',
  Ccedil: 'Ç', aelig: 'æ', oelig: 'œ', shy: '',
};

const ENTITY = /&(#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{1,9});/gi;

/** "&frac12; cup" → "½ cup". Sites sometimes encode twice ("&amp;frac12;"), so a second pass is made when needed. */
export function decodeEntities(text: string): string {
  const once = (t: string) =>
    t.replace(ENTITY, (whole, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
      }
      return NAMED[name] ?? NAMED[name.toLowerCase()] ?? whole;
    });
  const first = once(text);
  return first !== text && new RegExp(ENTITY.source, 'i').test(first) ? once(first) : first;
}

/** Text from a bit of HTML or a JSON-LD string: tags dropped, entities decoded, spaces collapsed. */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return decodeEntities(String(value).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Lines of text from HTML: block elements end a line, scripts and styles are dropped. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form|button|select)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/?(p|div|section|article|main|aside|header|h[1-6]|ul|ol|li|tr|table|dl|dt|dd|blockquote|figure|figcaption|pre)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[\s ]+/g, ' ').trim())
    .filter((l) => l && l !== '•')
    .join('\n');
}

// ── the page's own facts (<title>, Open Graph) ──

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : '';
};

/** A <meta property|name="…" content="…"> value. */
export function metaContent(html: string, key: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ([attr(tag, 'property'), attr(tag, 'name')].some((k) => k.toLowerCase() === key)) return attr(tag, 'content').trim();
  }
  return '';
}

export const pageTitle = (html: string) => cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');

/** "www.seriouseats.com" → "seriouseats.com" */
export const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// ── schema.org/Recipe (JSON-LD) ──

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const isType = (v: Json, type: string) => list(v['@type']).some((t) => typeof t === 'string' && t.replace(/^.*[/:]/, '') === type);

/** Every JSON-LD block in the page, parsed (a block that isn't valid JSON is skipped). */
export function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const text = m[1].trim().replace(/^<!--|-->$/g, '').replace(/^\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>$/g, '').trim();
    try {
      blocks.push(JSON.parse(text));
    } catch {
      // some sites leave raw line breaks inside strings
      try {
        blocks.push(JSON.parse(text.replace(/[\r\n\t]+/g, ' ')));
      } catch {
        /* not JSON */
      }
    }
  }
  return blocks;
}

/** The first schema.org Recipe in the page's JSON-LD (inside a list, an @graph, or a page's mainEntity), or null. */
export function findRecipe(html: string): Json | null {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): Json | null => {
    if (depth > 6 || seen.has(v)) return null;
    if (Array.isArray(v)) {
      seen.add(v);
      for (const x of v) {
        const found = walk(x, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (!isObject(v)) return null;
    seen.add(v);
    if (isType(v, 'Recipe')) return v;
    for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
      const found = walk(v[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(jsonLdBlocks(html), 0);
}

/** An ISO 8601 duration ("PT1H15M", "P0DT0H45M") in minutes; a plain number is taken as minutes. */
export function isoMinutes(value: unknown): number {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : 0;
  if (typeof value !== 'string') return 0;
  const t = value.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return Math.round(d * 1440 + h * 60 + min + s / 60);
}

/** The first number in a yield ("4", "Serves 4-6", "12 cookies", ["4", "4 servings"]) or null. */
export function yieldServings(value: unknown): number | null {
  for (const v of list(value)) {
    const m = cleanText(v).match(/\d+(?:[.,]\d+)?/);
    if (m) {
      const n = Number(m[0].replace(',', '.'));
      if (n > 0 && n <= 1000) return n;
    }
  }
  return null;
}

/** recipeInstructions: one text, a list of texts, HowToSteps, or HowToSections of steps, as groups of steps. */
export function instructionGroups(value: unknown): ReadRecipe['directions'] {
  const groups: ReadRecipe['directions'] = [];
  const top: string[] = [];
  const stepsOf = (v: unknown, into: string[], depth = 0) => {
    if (depth > 4) return;
    for (const x of list(v)) {
      if (typeof x === 'string') {
        // one text with every step: split at paragraphs, list items and line breaks
        const parts = x.split(/<\/?(?:p|li|ol|ul|div)\b[^>]*>|<br\s*\/?>|\r?\n/i).map(cleanText).filter(Boolean);
        into.push(...parts);
      } else if (isObject(x)) {
        if (isType(x, 'HowToSection') || (x.itemListElement && !x.text)) {
          const steps: string[] = [];
          stepsOf(x.itemListElement, steps, depth + 1);
          if (steps.length) groups.push({ group: cleanText(x.name), steps });
        } else {
          const text = cleanText(x.text) || cleanText(x.name) || cleanText(x.description);
          if (text) into.push(text);
          // a step with sub-steps (rare)
          if (x.itemListElement) stepsOf(x.itemListElement, into, depth + 1);
        }
      }
    }
  };
  stepsOf(value, top);
  return top.length ? [{ group: '', steps: top }, ...groups] : groups;
}

type ImageChoice = { url: string; width: number; height: number };

/**
 * The recipe's photo: of the sizes a site lists (often square, 4:3, 16:9 and the original), the one closest to 4:3
 * that's at least 600 wide, else the first. The app's photos are square (issue #51); a 4:3 photo leaves room around the
 * square to move the crop. Sizes come from ImageObjects or from names like "-1200x900.jpg".
 */
export function recipeImage(value: unknown, base: string): string {
  const choices: ImageChoice[] = [];
  for (const x of list(value)) {
    const raw = typeof x === 'string' ? x : isObject(x) ? (typeof x.url === 'string' ? x.url : typeof x.contentUrl === 'string' ? x.contentUrl : '') : '';
    if (!raw) continue;
    let url: string;
    try {
      url = new URL(decodeEntities(raw.trim()), base).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(url)) continue;
    const named = url.match(/[-_](\d{2,5})x(\d{2,5})(?=\.\w+(?:\?|$))/);
    const width = Number(isObject(x) ? x.width : 0) || Number(named?.[1] ?? 0);
    const height = Number(isObject(x) ? x.height : 0) || Number(named?.[2] ?? 0);
    choices.push({ url, width, height });
  }
  const sized = choices.filter((c) => c.width >= 600 && c.height > 0);
  if (sized.length) {
    const off = (c: ImageChoice) => Math.abs(c.width / c.height - 4 / 3);
    return sized.sort((a, b) => off(a) - off(b) || b.width - a.width)[0].url;
  }
  return choices[0]?.url ?? '';
}

/**
 * A schema.org Recipe as a reading, the same shape Claude fills from photos, so the editor treats both alike. The
 * ingredient lines are kept as the site wrote them. `site` is who it's from (the site's name, else its address).
 */
export function recipeToReading(r: Json, site: string): ReadRecipe {
  const lines = list(r.recipeIngredient ?? r.ingredients).map(cleanText).filter(Boolean);
  const prep = isoMinutes(r.prepTime);
  let cook = isoMinutes(r.cookTime);
  const total = isoMinutes(r.totalTime);
  // the app's total is prep + cook: a total without a cook time is the rest of it (or all of it, with no prep time)
  if (!cook && total > prep) cook = total - prep;
  const size = isObject(r.nutrition) ? cleanText(r.nutrition.servingSize) : '';
  const notes = list(r.recipeNotes ?? r.notes).map(cleanText).filter(Boolean);
  return {
    found: true,
    title: cleanText(r.name) || cleanText(r.headline),
    source: site,
    servings: yieldServings(r.recipeYield ?? r.yield),
    // "1 serving" says nothing; "1 slice" or "1 cup" does
    servingSize: /[a-z]/i.test(size) && !/^(1\s+)?servings?$/i.test(size) ? size.slice(0, 100) : '',
    prepMinutes: prep || null,
    cookMinutes: cook || null,
    ingredients: lines.length ? [{ group: '', lines }] : [],
    directions: instructionGroups(r.recipeInstructions),
    notes: notes.join('\n\n'),
    dishPhoto: null,
  };
}

/** A bot check instead of the page (Cloudflare's "Just a moment…", Akamai's "Access Denied" and the like). */
export const isBotCheck = (html: string) =>
  /<title>\s*(just a moment|attention required|access denied|are you a robot|verify you are human|pardon our interruption)/i.test(html) ||
  /cf-chl-|_Incapsula_Resource|px-captcha|captcha-delivery\.com/i.test(html);

/** What a page holds: a recipe read from its JSON-LD, or else its text for Claude; with its photo's address. */
export type PageReading =
  | { kind: 'recipe'; recipe: ReadRecipe; photoUrl: string }
  | { kind: 'text'; text: string; photoUrl: string };

/** The page text sent to Claude is cut here (a long story and comments around a recipe are mostly noise). */
export const MAX_PAGE_TEXT = 80_000;

/** Read a fetched page: its JSON-LD recipe when it has one with ingredients, else its text (title and summary first). */
export function readPage(html: string, url: string): PageReading {
  const siteName = metaContent(html, 'og:site_name');
  const site = siteName && siteName.length <= 60 ? siteName : siteOf(url);
  const ogImage = metaContent(html, 'og:image') || metaContent(html, 'og:image:url') || metaContent(html, 'twitter:image');
  const absolute = (u: string) => {
    try {
      return u ? new URL(u, url).href : '';
    } catch {
      return '';
    }
  };
  const found = findRecipe(html);
  if (found) {
    const recipe = recipeToReading(found, site);
    if (recipe.ingredients.length && recipe.title) {
      return { kind: 'recipe', recipe, photoUrl: recipeImage(found.image, url) || absolute(ogImage) };
    }
  }
  const head = [
    `Address: ${url}`,
    `Site: ${site}`,
    `Title: ${pageTitle(html) || metaContent(html, 'og:title')}`,
    // a social media post's caption is often only here (the page itself is drawn by its script)
    `Summary: ${metaContent(html, 'og:description') || metaContent(html, 'description')}`,
  ].join('\n');
  const body = html.match(/<body\b[\s\S]*$/i)?.[0] ?? html;
  return { kind: 'text', text: `${head}\n\n${htmlToText(body)}`.slice(0, MAX_PAGE_TEXT), photoUrl: absolute(ogImage) };
}

// ── fetching ──

/**
 * Whether an address may be fetched by the server: a public web address only, never this machine or a private
 * network (the server would otherwise fetch what the phone can't).
 */
export function isPublicUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /\.(local|internal|localhost|lan|home|corp|intranet)$/.test(host) || host === 'localhost') return false;
  // IP addresses: only public IPv4 ones; no IPv6 literals at all
  if (host.includes(':')) return false;
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  } else if (/^[\d.]+$/.test(host) || /^0x/i.test(host)) return false;
  return true;
}

/** A refusal to show the person, with the status to send (the same as read-recipe.ts's ReadError). */
export class LinkError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** How the server asks for a page: as Safari on an iPhone would, since that's who's really asking. */
export const PAGE_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

/** Fetch an address, following up to five redirects, each of which must stay on the public web. */
async function fetchPublic(url: string, init: RequestInit, fetchImpl: typeof fetch, timeoutMs: number): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  let at = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isPublicUrl(at)) throw new LinkError(400, 'That link doesn’t go to a public web page.');
    const res = await fetchImpl(at, { ...init, redirect: 'manual', signal });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) return res;
    at = new URL(next, at).href;
  }
  throw new LinkError(502, 'That link redirects too many times.');
}

/** Read the body, up to `max` bytes; null when it's longer. */
async function bodyUpTo(res: Response, max: number): Promise<Uint8Array | null> {
  if (Number(res.headers.get('content-length') ?? 0) > max) return null;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return all;
}

/** Fetch the page at a link as text, or throw a LinkError that says why not (in words for the person). */
export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<{ html: string; url: string }> {
  const site = siteOf(url) || 'That site';
  let res: Response;
  try {
    res = await fetchPublic(url, { headers: PAGE_HEADERS }, fetchImpl, timeoutMs);
  } catch (e) {
    if (e instanceof LinkError) throw e;
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new LinkError(504, `${site} took too long to answer. Try again.`);
    throw new LinkError(502, `Couldn’t reach ${site}. Check the link.`);
  }
  if (res.status === 404 || res.status === 410) throw new LinkError(404, `${site} says that page doesn’t exist. Check the link.`);
  if ([401, 403, 429, 451, 503].includes(res.status)) {
    throw new LinkError(502, `${site} wouldn’t let the app read the page. Take screenshots of the recipe and use From photos or screenshots instead.`);
  }
  if (!res.ok) throw new LinkError(502, `${site} answered with an error (${res.status}). Try again later.`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type && !/html|xml|text\/plain/.test(type)) throw new LinkError(415, 'That link isn’t a web page. Use a link to the recipe’s page.');
  const body = await bodyUpTo(res, MAX_PAGE_BYTES);
  if (!body) throw new LinkError(413, 'That page is too large to read.');
  const charset = (res.headers.get('content-type') ?? '').match(/charset=([\w-]+)/i)?.[1];
  let html: string;
  try {
    html = new TextDecoder(charset || 'utf-8').decode(body);
  } catch {
    html = new TextDecoder('utf-8').decode(body);
  }
  return { html, url: res.url || url };
}

/** A recipe photo from the site, as a data URL for the phone to crop; null if it can't be had (the recipe still comes). */
export async function fetchPhoto(url: string, referer: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8_000): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetchPublic(url, { headers: { ...PAGE_HEADERS, accept: 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5', referer } }, fetchImpl, timeoutMs);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !PHOTO_TYPES.includes(type)) return null;
    const body = await bodyUpTo(res, MAX_PHOTO_BYTES);
    if (!body?.byteLength) return null;
    return `data:${type};base64,${Buffer.from(body).toString('base64')}`;
  } catch {
    return null;
  }
}
