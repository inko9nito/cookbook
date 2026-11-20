import type { MouseEvent } from 'react';
import type { Ingredient } from '../lib/recipe';
import { amountText, canConvert, type UnitPicks } from './ingredientLine';

// Unit conversions (issue #6), on the recipe page and in cook mode: an amount in a measuring unit is underlined;
// tapping it opens the unit sheet (UnitSheet), where a unit can be picked to replace the amount, or Original to put
// it back.

/** The tapped amount: which ingredient, and its element (the sheet keeps its row in view). */
export type ConvertTarget = { ing: Ingredient; el: Element };

/** The bold amount of a row: underlined and tappable when it converts. */
export function ConvertibleAmount({
  ing,
  factor,
  picks,
  onOpen,
}: {
  ing: Ingredient;
  factor: number;
  picks: UnitPicks;
  onOpen: (target: ConvertTarget) => void;
}) {
  const text = amountText(ing, factor, picks);
  if (!canConvert(ing, factor)) return <span className="ck-amount">{text}</span>;
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    // in cook mode the row is a checkbox: tapping the amount converts it instead of ticking it
    e.preventDefault();
    e.stopPropagation();
    onOpen({ ing, el: e.currentTarget });
  };
  return (
    <button
      type="button"
      className={`ck-amount ck-convertible ${picks[ing.id] ? 'ck-converted' : ''}`}
      aria-label={`${text}, show in other units`}
      onClick={open}
    >
      {text}
    </button>
  );
}

/**
 * Tapping an amount: its sheet opens, or, if that ingredient's sheet is already open (it's highlighted), it closes.
 * Tapping another ingredient's amount switches the sheet to it.
 */
export const toggleTarget = (current: ConvertTarget | null, tapped: ConvertTarget) =>
  current?.ing.id === tapped.ing.id ? null : tapped;

/** Set or clear one ingredient's picked unit. */
export const withPick = (picks: UnitPicks, id: string, unit: string | null): UnitPicks => {
  const { [id]: _old, ...rest } = picks;
  return unit ? { ...rest, [id]: unit } : rest;
};
