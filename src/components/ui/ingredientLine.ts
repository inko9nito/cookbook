// How an ingredient row reads at today's scale, shared by the recipe page and cook mode.
import type { Ingredient } from '../../lib/recipe';
import { readAmount, scaleAmount, unitFor } from '../../lib/ingredients';
import { formatConverted, neaterAmount } from '../../lib/units';

/** The bold part of the row: "1½ cups", "2–4 tsp", "a pinch". */
export function amountText(i: Ingredient, factor: number) {
  const a = scaleAmount(i.amount, factor);
  return [a, unitFor(i.unit, a)].filter(Boolean).join(' ');
}

/** The amount in a neater unit when there is one (issue #6): "12 tbsp" → "¾ cup". */
export function neaterText(i: Ingredient, factor: number) {
  const c = neaterAmount(scaleAmount(i.amount, factor), i.unit);
  return c ? `= ${formatConverted(c)}` : '';
}

/**
 * The muted line under the row: the neater unit, the note, and "not scaled" for an amount that isn't a number while
 * scaling (R5), e.g. "= ¾ cup · melted".
 */
export function footerText(i: Ingredient, factor: number) {
  const unscaled = Math.abs(factor - 1) > 0.001 && !!i.amount && !readAmount(i.amount);
  return [neaterText(i, factor), i.note, unscaled ? 'not scaled' : ''].filter(Boolean).join(' · ');
}
