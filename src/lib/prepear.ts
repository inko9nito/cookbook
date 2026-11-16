// Issue #14: turning a Prepear export file (src/prepear/export.ts saves Prepear's own answers) into this app's recipes.
// Pure functions, tested in prepear.test.ts; the Import from Prepear page runs them, then saves the recipes.
// What Prepear's answers look like: docs/PLAN.md §6.

import { formatIngredient, parseLine } from './ingredients';
import { newId, type Ingredient, type Recipe, type Step } from './recipe';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export type PrepearExport = {
  format: 'prepear-export';
  version: number;
  exportedAt: string;
  profile: { id: string; slug: string; recipeTotal?: number };
  recipes: Record<string, Json>;
  cookbooks?: Record<string, Json>;
  plans?: Record<string, Json>;
  failed?: { id: string; error: string }[];
};

/** Read the file the export bookmarklet saved; a friendly error for anything else. */
export function readPrepearExport(text: string): PrepearExport {
  let data: Json;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Prepear export. Choose the prepear-export file the bookmarklet saved.');
  }
  if (data?.format !== 'prepear-export' || typeof data.recipes !== 'object' || !data.recipes)
    throw new Error('That file isn’t a Prepear export. Choose the prepear-export file the bookmarklet saved.');
  if (data.version > 1) throw new Error('That export is newer than this app understands. Update the app and try again.');
  return data as PrepearExport;
}

// ── text ──

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };

/** Prepear's text sometimes carries HTML from the site it came from (&nbsp;, <br>, <b>): plain text, lines kept. */
export function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── dates ──

/** Prepear's ids are time-based UUIDs (version 1): when the recipe (or my copy of it) was made. */
export function uuidTime(id: unknown): string | null {
  const m = typeof id === 'string' ? /^([0-9a-f]{8})-([0-9a-f]{4})-1([0-9a-f]{3})-/i.exec(id) : null;
  if (!m) return null;
  const ticks = (BigInt(`0x${m[3]}`) << 48n) | (BigInt(`0x${m[2]}`) << 32n) | BigInt(`0x${m[1]}`);
  const ms = Number(ticks / 10000n) - 12219292800000;
  return ms > 0 && ms < 4102444800000 ? new Date(ms).toISOString() : null;
}

// ── tags ──

// allergens Prepear works out itself ("milk" means contains milk): left out, they'd read as ingredients to look for
const ALLERGENS = new Set(['milk', 'egg', 'eggs', 'wheat', 'soy', 'tree_nut', 'tree nut', 'peanut', 'sesame', 'fish', 'shellfish', 'gluten']);
const SPELLED: Record<string, string> = { lowsodium: 'low sodium', lowcalorie: 'low calorie', lowfat: 'low fat', lowcarb: 'low carb', glutenfree: 'gluten-free', dairyfree: 'dairy-free' };

export function prepearTags(tags: unknown[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    let tag = t.trim().replace(/^#+/, '').toLowerCase().replace(/_/g, ' ');
    if (!tag || ALLERGENS.has(tag)) continue;
    tag = SPELLED[tag] ?? tag.replace(/^phase(\d)$/, 'phase $1');
    out.add(tag.slice(0, 60));
  }
  return [...out];
}

// ── ingredients and steps ──

/** One of Prepear's ingredient rows (amount, measurement, ingredient_name, note) as this app's ingredient. */
export function prepearIngredient(row: Json): Ingredient | null {
  const amount = plainText(row?.amount);
  const unit = plainText(row?.measurement);
  const name = plainText(row?.ingredient_name);
  const note = plainText(row?.note);
  if (!amount && !unit && !name) return null;

  // Prepear split some lines badly: "1-3/4 teaspoons salt" became amount "1", name "-3/4 teaspoons salt";
  // "1/4 tsp" sometimes landed whole in the amount. Those are put back together and read again.
  const split = /^[-–]\s*\d/.test(name) && /^\d+$/.test(amount);
  const unitInAmount = /\d\s*[a-z]+\.?$/i.test(amount) && !/\bto\b/i.test(amount) && !unit;
  if (split || unitInAmount) {
    const typed = (split ? `${amount}${name}` : [amount, name].filter(Boolean).join(' ')) + (note ? `, ${note}` : '');
    // "1-3/4" here means one and three quarters, not a range
    const parts = parseLine(typed.replace(/^(\d+)-(\d+\/\d+)(?=\s)/, '$1 $2'));
    return { id: newId(), ...parts, note: parts.note || note, raw: typed };
  }
  const parts = { amount, unit, name, note };
  return { id: newId(), ...parts, raw: formatIngredient(parts) };
}

const header = (title: string): Ingredient => ({ id: newId(), kind: 'header', amount: '', unit: '', name: title, note: '' });

export function prepearIngredients(groups: unknown): Ingredient[] {
  const out: Ingredient[] = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const rows = (Array.isArray(g?.ingredients) ? g.ingredients : []).map(prepearIngredient).filter(Boolean) as Ingredient[];
    const title = plainText(g?.title);
    if (title && rows.length) out.push(header(title));
    out.push(...rows);
  }
  return out;
}

export function prepearSteps(groups: unknown): Step[] {
  const out: Step[] = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    const steps = (Array.isArray(g?.directions) ? g.directions : []).map(plainText).filter(Boolean) as string[];
    const title = plainText(g?.title);
    if (title && steps.length) out.push({ id: newId(), kind: 'header', text: title });
    out.push(...steps.map((text) => ({ id: newId(), text })));
  }
  return out;
}

// ── recipes ──

const minutes = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : 0;
};

const sourceName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * "mustard dill chicken thighs" → "Mustard dill chicken thighs": a title starting with a lower-case word gets a capital.
 * A first word with capitals inside ("iPhone") is left alone.
 */
export const sentenceCase = (t: string) => (/^\p{Ll}[\p{Ll}\d'’-]*(?=[\s,:]|$)/u.test(t) ? t.charAt(0).toLocaleUpperCase() + t.slice(1) : t);

const textList = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).map(plainText).filter(Boolean);

/** One recipe to import, and the photo to copy for it (its path in Prepear's storage). */
export type PrepearItem = { recipe: Recipe; photo?: string };

/**
 * One of Prepear's recipe answers ({ adapted, original }) as a recipe. "adapted" is my own edited copy of a recipe;
 * when there is one it's the recipe, and the original fills in what it lacks (my rating, notes, photo).
 * Null when there's nothing to import (deleted in Prepear, or empty).
 */
export function prepearRecipe(answer: Json, askedId: string, exp: Pick<PrepearExport, 'profile' | 'exportedAt'>): PrepearItem | null {
  const sides = [answer?.adapted, answer?.original].filter((s) => s?.recipe && !s.recipe.deleted);
  const main = sides[0];
  if (!main) return null;
  const r = main.recipe;
  const title = sentenceCase(plainText(r.title));
  if (!title) return null;

  const metas = [answer?.adapted?.meta, answer?.original?.meta].filter(Boolean);
  const photos = [answer?.adapted?.meta, answer?.adapted?.recipe, answer?.original?.meta, answer?.original?.recipe].map((s) => s?.image_urls);
  const photo = photos.map((u) => u?.['1080'] ?? u?.['640']).find((p) => typeof p === 'string' && p.startsWith('/'));
  const sourceUrl = [r.attr_url, r.resolved_attr_url].find((u) => typeof u === 'string' && /^https?:\/\//.test(u));

  // when it came into my Prepear: my copy's id is dated; a recipe I imported has the date; else the recipe's own id
  const original = answer?.original?.recipe;
  const createdAt =
    (answer?.adapted?.recipe && uuidTime(answer.adapted.recipe.id)) ||
    (original?.imported_user_id === exp.profile.id && typeof original.imported_at === 'string' && original.imported_at) ||
    uuidTime(r.id) ||
    exp.exportedAt;

  const notes = [...new Set([...textList(r.notes), ...metas.flatMap((m) => [...textList(m.notes), ...textList(m.comments)])])];
  const rating = Math.round(Number(metas.map((m) => m.rating).find((x) => Number(x) > 0) ?? 0));
  const ids = [askedId, answer?.adapted?.recipe?.id, answer?.original?.recipe?.id, ...metas.map((m) => m.preferred_adapted_id)];
  const prep = minutes(r.time_prep);
  const cook = minutes(r.time_cook);
  const servings = Number(r.servings);

  const recipe: Recipe = {
    id: newId(),
    title,
    source: sourceUrl ? sourceName(sourceUrl) : '',
    ...(sourceUrl ? { sourceUrl: sourceUrl.slice(0, 2000) } : {}),
    servings: servings > 0 && servings <= 1000 ? servings : 4,
    servingSize: plainText(r.serving_size).slice(0, 100),
    prepMinutes: prep,
    cookMinutes: cook,
    minutes: prep + cook,
    createdAt: new Date(createdAt).toISOString(),
    photos: [],
    tags: prepearTags([...(r.tags ?? []), ...metas.flatMap((m) => m.tags ?? [])]).slice(0, 60),
    ingredients: prepearIngredients(r.ingredients).slice(0, 400),
    steps: prepearSteps(r.directions).slice(0, 200),
    notes: notes.join('\n\n').slice(0, 20000),
    rating: Math.min(5, Math.max(0, rating)),
    timesMade: metas.some((m) => m.prepeared === true) ? 1 : 0,
    prepearIds: [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))].slice(0, 10),
  };
  return photo ? { recipe, photo } : { recipe };
}

export type PrepearPlan = {
  /** recipes to import */
  items: PrepearItem[];
  /** recipes in the file that were imported before (they share a Prepear id with a recipe here) */
  alreadyHere: number;
  /** recipes in the file that can't be imported, and why */
  skipped: { id: string; reason: string }[];
};

/** Everything in the export that isn't here yet, as recipes. */
export function planPrepearImport(exp: PrepearExport, existing: Recipe[]): PrepearPlan {
  const known = new Set(existing.flatMap((r) => r.prepearIds ?? []));
  const items: PrepearItem[] = [];
  const skipped: PrepearPlan['skipped'] = (exp.failed ?? []).map((f) => ({ id: f.id, reason: `Prepear didn’t send it (${f.error})` }));
  let alreadyHere = 0;
  for (const [askedId, answer] of Object.entries(exp.recipes)) {
    const item = prepearRecipe(answer, askedId, exp);
    if (!item) {
      skipped.push({ id: askedId, reason: 'deleted in Prepear, or empty' });
      continue;
    }
    const ids = item.recipe.prepearIds ?? [];
    if (ids.some((id) => known.has(id))) {
      alreadyHere++;
      continue;
    }
    ids.forEach((id) => known.add(id));
    items.push(item);
  }
  return { items, alreadyHere, skipped };
}
