// Helpers for cook mode: timers found in a step's text, and the ingredients a step mentions.
import type { Ingredient } from './recipe';

export type StepTimer = { label: string; seconds: number };

const UNIT_SECONDS: Record<string, number> = { sec: 1, min: 60, hr: 3600 };

/**
 * Durations written in a step ("10 to 15 minutes", "8 hours", "1 minute more").
 * A range offers its low end, so you check early rather than late.
 */
export function stepTimers(text: string): StepTimer[] {
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:to|-|–)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/gi;
  const found: StepTimer[] = [];
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    const unit = m[3].toLowerCase().startsWith('h') ? 'hr' : m[3].toLowerCase().startsWith('s') ? 'sec' : 'min';
    const seconds = Math.round(n * UNIT_SECONDS[unit]);
    if (!seconds || found.some((t) => t.seconds === seconds)) continue;
    found.push({ label: `${n} ${unit}`, seconds });
  }
  return found;
}

// words too general to tie an ingredient to a step ("2 tsp ground cumin" should match on "cumin", not "ground")
const GENERIC = new Set([
  'fresh', 'large', 'small', 'medium', 'ground', 'plain', 'whole', 'boneless', 'skinless', 'chopped', 'minced', 'sliced',
  'grated', 'dried', 'unsalted', 'salted', 'sharp', 'finely', 'extra', 'virgin', 'kosher', 'leaves', 'sauce', 'juice',
  'purpose', 'all-purpose', 'baking', 'crushed', 'red', 'yellow', 'warm', 'cold', 'light', 'dark', 'heavy', 'green', 'white', 'black', 'sprigs', 'cloves', 'lean',
]);

const stem = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, '').replace(/(es|s)$/, '');

/**
 * Ingredients a step mentions ("Whisk the yogurt, olive oil…" → yogurt, olive oil).
 * An ingredient matches when the step uses one of its specific words that no other ingredient has ("chicken", "yogurt",
 * "onion"), or all of its specific words ("bell peppers" needs "bell", so "red pepper flakes" in the text doesn't pull
 * in the bell peppers).
 */
export function stepIngredients(text: string, ingredients: Ingredient[]): Ingredient[] {
  const words = new Set(text.split(/[^A-Za-z-]+/).filter(Boolean).map(stem));
  const items = ingredients
    .filter((i) => i.kind !== 'header')
    .map((i) => {
      const keys = i.name.split(/[\s,]+/).map(stem).filter((w) => w.length >= 3 && !GENERIC.has(w));
      return { i, keys };
    })
    .filter((x) => x.keys.length);
  const owners = (k: string) => items.filter((o) => o.keys.includes(k)).length;
  return items
    .filter(({ keys }) => keys.every((k) => words.has(k)) || keys.some((k) => words.has(k) && owners(k) === 1))
    .map((x) => x.i);
}

/** 125 → "2:05", 3725 → "1:02:05" */
export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
