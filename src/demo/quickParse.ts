// DEMO-ONLY ingredient helpers for the Phase 0 feel check.
// Phase 1 replaces these with `parse-ingredient` + a fully tested scaling engine (R5).

const UNITS = [
  'cup', 'cups', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'g', 'kg', 'ml', 'l',
  'clove', 'cloves', 'can', 'cans', 'pinch', 'large', 'medium', 'small', 'bottle', 'slice', 'slices',
];

/** R6: a pasted line is a group header when it ends with ":" ("For the sauce:") or starts with "For the" and has no amount. */
export function isHeaderLine(line: string) {
  const t = line.trim();
  return /:$/.test(t) || (/^for (the )?\w/i.test(t) && !/^\d/.test(t));
}
export const headerText = (line: string) => line.trim().replace(/:$/, '').trim();

/** R6: split pasted text into lines, skipping blank ones. */
export const pastedLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

export function quickParse(line: string) {
  const m = line.trim().match(/^((?:\d+\s+)?\d+(?:[./]\d+)?(?:\s*(?:-|–|to)\s*(?:\d+\s+)?\d+(?:[./]\d+)?)?)?\s*(.*)$/i);
  const amount = (m?.[1] ?? '').replace(/\s*(–|to)\s*/i, '-').trim();
  let rest = (m?.[2] ?? '').trim();
  let unit = '';
  const first = rest.split(/\s+/)[0]?.toLowerCase().replace(/\.$/, '');
  if (first && UNITS.includes(first)) {
    unit = first;
    rest = rest.slice(rest.split(/\s+/)[0].length).trim();
  }
  const [name, ...noteParts] = rest.split(',');
  return { amount, unit, name: (name ?? '').trim(), note: noteParts.join(',').trim() };
}

const toNumber = (s: string): number | null => {
  const parts = s.trim().split(/\s+/);
  let total = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [a, b] = p.split('/').map(Number);
      if (!b) return null;
      total += a / b;
    } else {
      const n = Number(p);
      if (Number.isNaN(n)) return null;
      total += n;
    }
  }
  return total;
};

const FRACTIONS: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, ''],
];

const pretty = (n: number) => {
  const whole = Math.floor(n);
  const frac = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  const w = best[0] === 1 ? whole + 1 : whole;
  const f = best[0] === 1 ? '' : best[1];
  if (Math.abs(n - (w + (best[0] === 1 ? 0 : best[0]))) > 0.05) return String(Math.round(n * 100) / 100);
  return w === 0 ? f || '0' : `${w}${f}`;
};

/** Scales "1-2", "1 1/2", "1/4". Returns the original text when it isn't a number. */
export function scaleAmount(amount: string, factor: number): string {
  if (!amount) return amount;
  const [lo, hi] = amount.split('-');
  const a = toNumber(lo);
  const b = hi !== undefined ? toNumber(hi) : null;
  if (a === null || (hi !== undefined && b === null)) return amount;
  return b === null ? pretty(a * factor) : `${pretty(a * factor)}–${pretty(b * factor)}`;
}

const PLURALS: Record<string, string> = { cup: 'cups', clove: 'cloves', can: 'cans', slice: 'slices', pound: 'pounds', ounce: 'ounces', teaspoon: 'teaspoons', tablespoon: 'tablespoons', bottle: 'bottles' };
const SINGULARS = Object.fromEntries(Object.entries(PLURALS).map(([s, p]) => [p, s]));

/** DEMO: "cup" ↔ "cups" to match a scaled amount ("3 cups", "½ cup"). Phase 1's scaling engine replaces this. */
export function unitFor(unit: string, scaledAmount: string): string {
  if (!unit) return unit;
  const lead = scaledAmount.split(/[–-]/).pop() ?? '';
  const n = toNumber(lead.replace(/[¼½¾⅓⅔⅛]/g, (c) => ({ '¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8' })[c] ?? c).trim());
  if (n === null) return unit;
  const lower = unit.toLowerCase();
  if (n > 1 && PLURALS[lower]) return PLURALS[lower];
  if (n <= 1 && SINGULARS[lower]) return SINGULARS[lower];
  return unit;
}

/** The number an amount starts with ("1-2" → 1, "1 1/2" → 1.5, "pinch" → null). Used to scale by an ingredient (issue #3). */
export function amountValue(amount: string): number | null {
  if (!amount) return null;
  const first = amount.split(/[–-]/)[0];
  const n = toNumber(first);
  return n && n > 0 ? n : null;
}

/** Friendly number for servings and multipliers: 6, 4.5, 1.33 → "1⅓"-style is overkill here, so up to 2 decimals. */
export const friendly = (n: number) => String(Math.round(n * 100) / 100);
