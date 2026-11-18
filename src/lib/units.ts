// Unit conversions (issue #6): what an amount is in other kitchen units ("12 tbsp" is ¾ cup, 36 tsp, 6 fl oz, 180 ml),
// and a neater unit to suggest when scaling lands somewhere awkward ("12 tbsp" → "¾ cup").
// Volume converts to volume and weight to weight; there's no cups-to-grams, which would need each ingredient's density.

import { parseIngredient } from 'parse-ingredient';
import { readAmount } from './ingredients';

type Kind = 'volume' | 'weight';
type UnitDef = {
  kind: Kind;
  /** millilitres or grams in one */
  size: number;
  one: string;
  many: string;
  /** shown in the list of conversions only between these amounts, so it doesn't offer "0.02 cup" or "96 tsp" */
  min: number;
  max: number;
  /** US kitchen units read as fractions (¾ cup); metric as rounded numbers (180 ml) */
  fractions: boolean;
};

const UNITS: Record<string, UnitDef> = {
  teaspoon: { kind: 'volume', size: 4.92892, one: 'tsp', many: 'tsp', min: 1 / 8, max: 48, fractions: true },
  tablespoon: { kind: 'volume', size: 14.7868, one: 'tbsp', many: 'tbsp', min: 1 / 2, max: 32, fractions: true },
  cup: { kind: 'volume', size: 236.588, one: 'cup', many: 'cups', min: 1 / 8, max: 64, fractions: true },
  'fluid ounce': { kind: 'volume', size: 29.5735, one: 'fl oz', many: 'fl oz', min: 1 / 2, max: 256, fractions: true },
  pint: { kind: 'volume', size: 473.176, one: 'pint', many: 'pints', min: 1, max: 32, fractions: true },
  quart: { kind: 'volume', size: 946.353, one: 'quart', many: 'quarts', min: 1, max: 16, fractions: true },
  gallon: { kind: 'volume', size: 3785.41, one: 'gallon', many: 'gallons', min: 1, max: Infinity, fractions: true },
  milliliter: { kind: 'volume', size: 1, one: 'ml', many: 'ml', min: 1, max: 999, fractions: false },
  liter: { kind: 'volume', size: 1000, one: 'l', many: 'l', min: 1, max: Infinity, fractions: false },
  ounce: { kind: 'weight', size: 28.3495, one: 'oz', many: 'oz', min: 1 / 4, max: 64, fractions: true },
  pound: { kind: 'weight', size: 453.592, one: 'lb', many: 'lb', min: 1 / 4, max: Infinity, fractions: true },
  gram: { kind: 'weight', size: 1, one: 'g', many: 'g', min: 1, max: 999, fractions: false },
  kilogram: { kind: 'weight', size: 1000, one: 'kg', many: 'kg', min: 1, max: Infinity, fractions: false },
};

// the order conversions are listed in
const ORDER: Record<Kind, string[]> = {
  volume: ['teaspoon', 'tablespoon', 'cup', 'fluid ounce', 'pint', 'quart', 'gallon', 'milliliter', 'liter'],
  weight: ['ounce', 'pound', 'gram', 'kilogram'],
};

const ids = new Map<string, string | null>();

/** Which unit this is ("Tbsp", "T", "tablespoons" → tablespoon), or null when it isn't one we convert (can, clove, pinch). */
export function unitId(unit: string): string | null {
  const key = unit.trim();
  if (!key) return null;
  if (!ids.has(key)) {
    const [p] = parseIngredient(`1 ${key} x`);
    const whole = p?.unitOfMeasure?.toLowerCase().replace(/\.$/, '') === key.toLowerCase().replace(/\.$/, '');
    ids.set(key, whole && p.unitOfMeasureID && UNITS[p.unitOfMeasureID] ? p.unitOfMeasureID : null);
  }
  return ids.get(key)!;
}

// kitchen fractions: eighths and thirds
const KITCHEN = [0, 1 / 8, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 5 / 8, 2 / 3, 3 / 4, 7 / 8, 1];
const GLYPH: Record<string, string> = { '0.125': '⅛', '0.25': '¼', '0.333': '⅓', '0.375': '⅜', '0.5': '½', '0.625': '⅝', '0.667': '⅔', '0.75': '¾', '0.875': '⅞' };

/**
 * The nearest kitchen fraction: 0.74 → "¾", 1.5 → "1½". Bigger amounts get coarser steps (no "17⅝ oz"): halves from 10
 * up, quarters and thirds from 4. `exact` is false when the shown number is more than 3% off.
 */
function kitchenNumber(n: number): { text: string; value: number; exact: boolean; off: number } {
  const steps = n >= 10 ? [0, 1 / 2, 1] : n >= 4 ? [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1] : KITCHEN;
  const whole = Math.floor(n);
  let best = 0;
  for (const f of steps) if (Math.abs(n - whole - f) < Math.abs(n - whole - best)) best = f;
  const value = whole + best;
  if (value === 0) return { text: formatPlain(n), value: n, exact: false, off: 1 };
  const glyph = best === 0 || best === 1 ? '' : GLYPH[best.toFixed(3).replace(/0+$/, '')];
  const w = best === 1 ? whole + 1 : whole;
  return { text: `${w || !glyph ? w : ''}${glyph}`, value, exact: Math.abs(value - n) / n <= 0.03, off: Math.abs(value - n) / n };
}

/** Metric amounts: 180 ml, 15 g, 1.5 kg. */
function formatPlain(n: number): string {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

export type Converted = {
  /** the unit's id (cup, tablespoon…), for remembering a choice */
  id: string;
  amount: string;
  unit: string;
  approx: boolean;
  /** how far off the shown number is (0.05 = 5%) */
  off: number;
};

function express(ml: number, id: string): Converted {
  const u = UNITS[id];
  const n = ml / u.size;
  if (u.fractions) {
    const k = kitchenNumber(n);
    return { id, amount: k.text, unit: k.value > 1 ? u.many : u.one, approx: !k.exact, off: k.off };
  }
  return { id, amount: formatPlain(n), unit: u.one, approx: false, off: 0 };
}

/** An amount ("1-2", "¾") in base units (ml or g): the high end of a range, so "1–2 cups" is judged at 2 cups. */
function baseOf(amount: string, id: string): { low: number; high: number | null } | null {
  const a = readAmount(amount);
  if (!a || a.low <= 0) return null;
  return { low: a.low * UNITS[id].size, high: a.high === null ? null : a.high * UNITS[id].size };
}

const join = (lo: Converted, hi: Converted | null): Converted =>
  hi ? { id: lo.id, amount: `${lo.amount}–${hi.amount}`, unit: hi.unit, approx: lo.approx || hi.approx, off: Math.max(lo.off, hi.off) } : lo;

/**
 * The same amount in the other units of its kind, sensible ones only: "12 tbsp" → ¾ cup, 36 tsp, 6 fl oz, 175 ml.
 * Empty for amounts that aren't numbers and units that don't convert (cans, cloves, pinches).
 */
export function conversions(amount: string, unit: string): Converted[] {
  const id = unitId(unit);
  if (!id) return [];
  const base = baseOf(amount, id);
  if (!base) return [];
  const top = base.high ?? base.low;
  return ORDER[UNITS[id].kind]
    .filter((other) => other !== id)
    .filter((other) => {
      const n = top / UNITS[other].size;
      const lowN = base.low / UNITS[other].size;
      return atLeast(lowN, UNITS[other].min) && n <= UNITS[other].max * 1.01;
    })
    .map((other) => join(express(base.low, other), base.high === null ? null : express(base.high, other)))
    // "about" is fine up to 10% off; further than that (3 tbsp as "⅛ cup") it would mislead
    .filter((c) => c.off <= 0.1);
}

// a neater unit is one the amount reads cleanly in, from the biggest down
const NEATER: Record<string, { ids: string[]; clean: Record<string, (n: number) => boolean> }> = {
  us_volume: {
    ids: ['cup', 'tablespoon', 'teaspoon'],
    clean: {
      cup: (n) => atLeast(n, 1 / 4) && (isMultiple(n, 1 / 4) || isMultiple(n, 1 / 3)),
      tablespoon: (n) => atLeast(n, 1) && isMultiple(n, 1 / 2),
      teaspoon: () => true,
    },
  },
  us_weight: {
    ids: ['pound', 'ounce'],
    clean: { pound: (n) => atLeast(n, 1) && isMultiple(n, 1 / 4), ounce: () => true },
  },
  metric_volume: { ids: ['liter', 'milliliter'], clean: { liter: (n) => atLeast(n, 1) && isMultiple(n, 0.05), milliliter: () => true } },
  metric_weight: { ids: ['kilogram', 'gram'], clean: { kilogram: (n) => atLeast(n, 1) && isMultiple(n, 0.05), gram: () => true } },
};
const FAMILY: Record<string, string> = {
  cup: 'us_volume', tablespoon: 'us_volume', teaspoon: 'us_volume',
  pound: 'us_weight', ounce: 'us_weight',
  liter: 'metric_volume', milliliter: 'metric_volume',
  kilogram: 'metric_weight', gram: 'metric_weight',
};

// unit sizes aren't exact (3 tsp comes out as 0.99999 tbsp), so compare with a little slack
const atLeast = (n: number, min: number) => n >= min * 0.99;

function isMultiple(n: number, step: number) {
  const k = n / step;
  return Math.abs(k - Math.round(k)) < 0.02 * Math.max(1, k / 10);
}

/**
 * When an amount reads better in another unit of the same system, that amount: "12 tbsp" → ¾ cup, "9 tsp" → 3 tbsp,
 * "⅛ cup" → 2 tbsp, "24 oz" → 1½ lb, "1500 g" → 1.5 kg. Null when it's already the neatest ("6 tbsp", "½ cup").
 */
export function neaterAmount(amount: string, unit: string): Converted | null {
  const id = unitId(unit);
  const family = id ? NEATER[FAMILY[id]] : undefined;
  if (!id || !family) return null;
  const base = baseOf(amount, id);
  if (!base) return null;
  const ok = (other: string, v: number) => family.clean[other](v / UNITS[other].size);
  const best = family.ids.find((other) => ok(other, base.low) && (base.high === null || ok(other, base.high)));
  if (!best || best === id) return null;
  return join(express(base.low, best), base.high === null ? null : express(base.high, best));
}

/**
 * Issue #64 (adding up a grocery list): an amount as a number in another unit of the same kind, so it can be added to
 * it: "2 tbsp" in cups → 0.125, "1–2 lb" in oz → 16–32. Null when the units don't convert into each other (or aren't
 * units we know) or the amount isn't a number.
 */
export function amountIn(amount: string, unit: string, target: string): { low: number; high: number | null } | null {
  const id = unitId(unit);
  const to = unitId(target);
  if (!id || !to || UNITS[id].kind !== UNITS[to].kind) return null;
  const base = baseOf(amount, id);
  if (!base) return null;
  const size = UNITS[to].size;
  return { low: base.low / size, high: base.high === null ? null : base.high / size };
}

export const formatConverted = (c: Converted) =>`${c.approx ? 'about ' : ''}${c.amount} ${c.unit}`;

/**
 * The amount in a unit picked from its conversions (the recipe page remembers the pick while it's open): "4 tbsp" in
 * cup → "¼ cup". Null when it can't be shown that way (the amount stopped being a number, or the pick is from the other
 * kind of unit), so the row falls back to the recipe's own unit.
 */
export function convertTo(amount: string, unit: string, targetId: string): Converted | null {
  const id = unitId(unit);
  if (!id || !UNITS[targetId] || UNITS[targetId].kind !== UNITS[id].kind) return null;
  if (id === targetId) return null;
  const base = baseOf(amount, id);
  if (!base) return null;
  return join(express(base.low, targetId), base.high === null ? null : express(base.high, targetId));
}
