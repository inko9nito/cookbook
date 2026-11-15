// Ingredient lines: parsing what's typed or pasted (R6), and scaling amounts (R5).
// The amount stays text exactly as typed ("1-2", "1 1/2", "½", "a pinch"); scaling reads numbers out of it and never
// touches an amount it can't read.

import { parseIngredient } from 'parse-ingredient';

/** The four fields the ingredient sheet edits (R4). */
export type IngredientParts = { amount: string; unit: string; name: string; note: string };

// ---------- numbers ----------

const VULGAR: Record<string, number> = {
  '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6,
};
const VULGAR_CHARS = Object.keys(VULGAR).join('');

// one number: "2", "1.5", "1/2", "1 1/2", "½", "1½", "1 ½"
const NUM = `(?:\\d+(?:\\.\\d+)?(?:\\s*[${VULGAR_CHARS}]|\\s+\\d+\\s*/\\s*\\d+)?|\\d+\\s*/\\s*\\d+|[${VULGAR_CHARS}])`;
// a range: "1-2", "1 – 2", "1 to 2", "1 or 2"
const RANGE_SEP = `\\s*(?:-|–|—|to|or)\\s*`;
const AMOUNT_RE = new RegExp(`^(${NUM})(?:${RANGE_SEP}(${NUM}))?(?=\\s|$|[a-zA-Z(])`, 'i');
const WHOLE_RE = new RegExp(`^(${NUM})(?:${RANGE_SEP}(${NUM}))?$`, 'i');

/** One number as written: "1 1/2" → 1.5, "½" → 0.5, "1½" → 1.5. Null when it isn't one. */
export function readNumber(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  let total = 0;
  // split "1½" and "1 ½" into the whole part and the fraction character
  const parts = t.replace(new RegExp(`([${VULGAR_CHARS}])`, 'g'), ' $1 ').trim().split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (VULGAR[p] !== undefined) total += VULGAR[p];
    else if (/^\d+(?:\.\d+)?$/.test(p)) total += Number(p);
    else if (/^\d+\/\d+$/.test(p)) {
      const [a, b] = p.split('/').map(Number);
      if (!b) return null;
      total += a / b;
    } else if (p === '/' && i > 0 && i < parts.length - 1) {
      // "1 / 2" written with spaces: undo the whole number already added and use the fraction
      const a = Number(parts[i - 1]);
      const b = Number(parts[i + 1]);
      if (!b || Number.isNaN(a)) return null;
      total += a / b - a;
      i++;
    } else return null;
  }
  return total;
}

/** An amount as numbers: "1-2" → {low 1, high 2}, "1 1/2" → {low 1.5}. Null for "a pinch", "to taste", "". */
export function readAmount(amount: string): { low: number; high: number | null } | null {
  const m = amount.trim().match(WHOLE_RE);
  if (!m) return null;
  const low = readNumber(m[1]);
  const high = m[2] !== undefined ? readNumber(m[2]) : null;
  if (low === null || (m[2] !== undefined && high === null)) return null;
  return { low, high };
}

// fractions people write in recipes, in eighths and thirds
const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

/**
 * A number the way a recipe writes it: 1.5 → "1½", 0.333 → "⅓", 2 → "2". Numbers that aren't close to a kitchen
 * fraction keep up to two decimals (1.15 → "1.15").
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  let whole = Math.floor(n);
  const rest = n - whole;
  if (rest < 0.02) return String(whole);
  if (rest > 0.98) return String(whole + 1);
  let best: [number, string] | null = null;
  for (const f of FRACTIONS) if (!best || Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  if (best && Math.abs(best[0] - rest) <= 0.02) return whole ? `${whole}${best[1]}` : best[1];
  whole = Math.round(n * 100) / 100;
  return String(whole);
}

/**
 * Scale an amount (R5). "1-2" ×2 → "2–4", "1 1/2" ×2 → "3", "½" ×3 → "1½".
 * At ×1, and for amounts that aren't numbers ("a pinch", "to taste"), the amount comes back exactly as typed.
 */
export function scaleAmount(amount: string, factor: number): string {
  if (!amount || factor === 1) return amount;
  const a = readAmount(amount);
  if (!a) return amount;
  const low = formatNumber(a.low * factor);
  return a.high === null ? low : `${low}–${formatNumber(a.high * factor)}`;
}

/** The number an amount starts with ("1-2" → 1, "1 1/2" → 1.5, "pinch" → null). Used to scale by one ingredient. */
export function amountValue(amount: string): number | null {
  const a = readAmount(amount);
  return a && a.low > 0 ? a.low : null;
}

/** Servings and multipliers: 6, 4.5, 1.33 (up to 2 decimals). */
export const friendly = (n: number) => String(Math.round(n * 100) / 100);

// ---------- units ----------

const PLURALS: Record<string, string> = {
  cup: 'cups', clove: 'cloves', can: 'cans', slice: 'slices', pound: 'pounds', ounce: 'ounces', teaspoon: 'teaspoons',
  tablespoon: 'tablespoons', bottle: 'bottles', pinch: 'pinches', dash: 'dashes', sprig: 'sprigs', stalk: 'stalks',
  stick: 'sticks', head: 'heads', bunch: 'bunches', handful: 'handfuls', package: 'packages', jar: 'jars', quart: 'quarts',
  pint: 'pints', gallon: 'gallons', piece: 'pieces', leaf: 'leaves', bag: 'bags', box: 'boxes', liter: 'liters',
  litre: 'litres', gram: 'grams', kilogram: 'kilograms', drop: 'drops', block: 'blocks', fillet: 'fillets', ear: 'ears',
  packet: 'packets', container: 'containers', loaf: 'loaves', strip: 'strips', sheet: 'sheets', scoop: 'scoops',
};
const SINGULARS = Object.fromEntries(Object.entries(PLURALS).map(([s, p]) => [p, s]));

const matchCase = (word: string, like: string) => (like[0] && like[0] === like[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word);

/** "cup" ↔ "cups" to agree with an amount: "3 cups", "½ cup", "1–2 cups". Abbreviations (tsp, oz, g) stay as typed. */
export function unitFor(unit: string, amount: string): string {
  if (!unit) return unit;
  const a = readAmount(amount);
  if (!a) return unit;
  const n = a.high ?? a.low;
  const lower = unit.toLowerCase();
  if (n > 1 && PLURALS[lower]) return matchCase(PLURALS[lower], unit);
  if (n <= 1 && SINGULARS[lower]) return matchCase(SINGULARS[lower], unit);
  return unit;
}

// ---------- lines ----------

/** One ingredient line the way it reads: "1–2 tsp kosher salt, divided". */
export const formatIngredient = (i: IngredientParts) =>
  [i.amount, i.unit, i.name].filter(Boolean).join(' ') + (i.note ? `, ${i.note}` : '');

// "large", "small" describe the ingredient ("3 large eggs"), they aren't units
const NOT_UNITS = ['large', 'medium', 'small', 'big', 'extra-large', 'whole'];

/**
 * Split a typed or pasted line into amount, unit, name and note.
 * "1-2 tsp kosher salt, divided" → 1-2 | tsp | kosher salt | divided. The amount is kept as written.
 */
export function parseLine(line: string): IngredientParts {
  const text = line.trim().replace(/^[-•*·▢□☐]\s*/, '');
  const m = text.match(AMOUNT_RE);
  const amount = m ? m[0].trim() : '';
  const rest = m ? text.slice(m[0].length).trim() : text;

  let unit = '';
  let description = rest;
  if (rest) {
    // parse-ingredient finds the unit (it knows "tbsp", "Tablespoons", "fl oz", "pinch"…); give it a number so the
    // unit is read as a unit even when the line has no amount ("pinch of salt")
    const [p] = parseIngredient(`1 ${rest}`, { ignoreUOMs: NOT_UNITS, descriptionStripPrefixes: [], groupHeaderPatterns: [] });
    if (p?.unitOfMeasure && rest.toLowerCase().startsWith(p.unitOfMeasure.toLowerCase())) {
      unit = rest.slice(0, p.unitOfMeasure.length).replace(/\.$/, '');
      description = rest.slice(p.unitOfMeasure.length).replace(/^\.?\s*/, '');
    }
  }
  const comma = description.indexOf(',');
  const name = (comma < 0 ? description : description.slice(0, comma)).trim();
  const note = comma < 0 ? '' : description.slice(comma + 1).trim();
  return { amount, unit, name, note };
}

/** R6: split pasted text into lines, skipping blank ones. */
export const pastedLines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/**
 * R6: a pasted line is a group header rather than an ingredient or step when it
 * - ends with a colon: "For the sauce:", "Topping:"
 * - starts with "For" and has no amount: "For the dressing"
 * - is a markdown or all-caps heading: "## Sauce", "FOR THE GLAZE"
 */
export function isHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t || /^\d/.test(t) || t.length > 60) return false;
  if (/:$/.test(t) || /^#{1,6}\s/.test(t)) return true;
  if (/^for\s+(the\s+)?\w/i.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && !/[.!?]$/.test(t);
}

/** The header's title without its colon or markdown: "For the sauce:" → "For the sauce". */
export const headerText = (line: string) => line.trim().replace(/^#{1,6}\s*/, '').replace(/:$/, '').trim();

/** "Step 1" on its own line, as recipe sites print above each step. Skipped when pasting directions. */
export const isStepLabel = (line: string) => /^step\s*\d+[.:)]?$/i.test(line.trim());

/** A pasted step without its number: "1. Heat the oven" / "Step 2: Stir" → "Heat the oven" / "Stir". */
export const stepText = (line: string) => line.trim().replace(/^(?:step\s*)?\d+\s*[.:)]\s*/i, '').trim();
