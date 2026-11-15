import type { MouseEvent } from 'react';
import { List, ListItem } from 'framework7-react';
import type { Ingredient } from '../lib/recipe';
import { scaleAmount } from '../lib/ingredients';
import { conversions, formatConverted, neaterAmount } from '../lib/units';
import { amountText, canConvert, originalAmount, type UnitPicks } from './ui/ingredientLine';

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

/**
 * The choices for one ingredient, as radio rows: the recipe's own amount ("Original"), then the same amount in the
 * other units, the neatest marked "Simpler".
 */
export function UnitOptions({
  ing,
  factor,
  picks,
  onPick,
  className = '',
}: {
  ing: Ingredient;
  factor: number;
  picks: UnitPicks;
  onPick: (unit: string | null) => void;
  className?: string;
}) {
  const scaled = scaleAmount(ing.amount, factor);
  const simpler = neaterAmount(scaled, ing.unit)?.id;
  return (
    <List className={`ck-convert-list ${className}`} dividersIos>
      <ListItem radio radioIcon="start" name="ck-unit" checked={!picks[ing.id]} onChange={() => onPick(null)} title={originalAmount(ing, factor)} after="Original" />
      {conversions(scaled, ing.unit).map((c) => (
        <ListItem
          key={c.id}
          radio
          radioIcon="start"
          name="ck-unit"
          checked={picks[ing.id] === c.id}
          onChange={() => onPick(c.id)}
          title={formatConverted(c)}
          after={simpler === c.id ? 'Simpler' : undefined}
        />
      ))}
    </List>
  );
}

/** Set or clear one ingredient's picked unit. */
export const withPick = (picks: UnitPicks, id: string, unit: string | null): UnitPicks => {
  const { [id]: _old, ...rest } = picks;
  return unit ? { ...rest, [id]: unit } : rest;
};
