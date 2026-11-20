// How an ingredient row reads at today's scale, shared by the recipe page and cook mode.
import type { Ingredient } from '../lib/recipe';
import { readAmount, scaleAmount, unitFor } from '../lib/ingredients';
import { conversions, convertTo, formatConverted } from '../lib/units';

/**
 * Units picked for some ingredients while the recipe is open (issue #6): ingredient id → unit id ("cup").
 * A pick replaces the recipe's own unit on the recipe page and in cook mode, until it's put back to Original.
 */
export type UnitPicks = Record<string, string>;

/** The recipe's own amount at today's scale: "1½ cups", "2–4 tsp", "a pinch". */
export function originalAmount(i: Ingredient, factor: number) {
  const a = scaleAmount(i.amount, factor);
  return [a, unitFor(i.unit, a)].filter(Boolean).join(' ');
}

/** The bold part of the row: the picked unit when there is one ("¼ cup"), otherwise the recipe's own. */
export function amountText(i: Ingredient, factor: number, picks?: UnitPicks) {
  const pick = picks?.[i.id];
  const c = pick ? convertTo(scaleAmount(i.amount, factor), i.unit, pick) : null;
  return c ? formatConverted(c) : originalAmount(i, factor);
}

/** Whether the amount can be shown in other units (it's a number in a measuring unit): it's underlined to say so. */
export const canConvert = (i: Ingredient, factor: number) => conversions(scaleAmount(i.amount, factor), i.unit).length > 0;

/** The muted line under the row: the note, and "not scaled" for an amount that isn't a number while scaling (R5). */
export function footerText(i: Ingredient, factor: number) {
  const unscaled = Math.abs(factor - 1) > 0.001 && !!i.amount && !readAmount(i.amount);
  return [i.note, unscaled ? 'not scaled' : ''].filter(Boolean).join(' · ');
}
