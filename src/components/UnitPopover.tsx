import { useEffect, useRef, type ComponentProps, type CSSProperties, type MouseEvent } from 'react';
import { Popover, List, ListItem } from 'framework7-react';
import type { Ingredient } from '../lib/recipe';
import { titleCase } from '../lib/recipe';
import { scaleAmount } from '../lib/ingredients';
import { conversions, formatConverted, neaterAmount } from '../lib/units';
import { amountText, canConvert, originalAmount, type UnitPicks } from './ui/ingredientLine';

// Unit conversions (issue #6), on the recipe page and in cook mode: an amount in a measuring unit is underlined; tapping
// it opens this popover, where a unit can be picked to replace the amount, or Original to put it back.

/** The tapped amount: which ingredient, and the element the popover points at. */
export type ConvertTarget = { ing: Ingredient; el: Element };

type PopoverRef = NonNullable<ComponentProps<typeof Popover>['ref']>;

// narrow, against the right side of the screen with the page's 16px gutter
const WIDTH = 200;
const GUTTER = 16;

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

type Props = {
  target: ConvertTarget | null;
  factor: number;
  picks: UnitPicks;
  /** a unit for the ingredient, or null for the recipe's own */
  onPick: (ingredientId: string, unit: string | null) => void;
  onClosed: () => void;
  /** where Framework7 puts it while open; by default the app, which a popup (cook mode) would cover */
  containerEl?: string;
  /** "fixed": the Page keeps it outside its scrolling content (Framework7 only reads this on the Page's own children) */
  slot?: string;
};

/**
 * The popover itself (Framework7), like iOS's edit menu: against the right side of the screen, level with the amount,
 * with a pointer to it, 10px corners and a soft shadow, the page not dimmed, opening small at the pointer and growing
 * (approved animation exception, cookbook.css). Put it in the Page it belongs to, with slot="fixed".
 */
export default function UnitPopover({ target, factor, picks, onPick, onClosed, containerEl }: Props) {
  const ref = useRef(null) as unknown as PopoverRef;

  // once the options are rendered, open it beside the amount. Framework7 places a popover beside a target ("middle"),
  // or failing room on its left, right after it: the target given is the stretch from the amount to where the popover
  // should start, so it lands against the right side
  useEffect(() => {
    const popover = ref.current?.f7Popover();
    if (!target || !popover) return;
    const amount = target.el.getBoundingClientRect();
    const left = Math.max(window.innerWidth - GUTTER - WIDTH, amount.right + 12);
    Object.assign(popover.params, {
      targetX: amount.right,
      targetY: amount.top,
      targetWidth: left - amount.right,
      targetHeight: amount.height,
      verticalPosition: 'middle',
    });
    popover.open();
  }, [target]);

  // after Framework7 has placed it: keep it clear of the status bar and any bottom bar (Framework7 keeps a popover
  // beside its target only 5px inside the screen), point at the amount, and grow out of the pointer's tip
  const place = () => {
    const el = ref.current?.el;
    if (!el || !target) return;
    const amount = target.el.getBoundingClientRect();
    // Framework7's top, in screen pixels (the open animation scales it, so its measured box isn't real yet)
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--f7-safe-area-top')) || 0;
    const bottomBar = el.closest('.page')?.querySelector('.toolbar.ck-cta')?.getBoundingClientRect().top ?? window.innerHeight;
    const top = Math.max(safeTop + 8, Math.min(parseFloat(el.style.top), bottomBar - 8 - el.offsetHeight));
    el.style.top = `${top}px`;
    const arrowY = Math.min(Math.max(amount.top + amount.height / 2 - top, 22), el.offsetHeight - 22);
    el.style.setProperty('--ck-arrow-y', `${arrowY}px`);
    el.style.transformOrigin = `-14px ${arrowY}px`;
  };

  const pick = (unit: string | null) => {
    if (target) onPick(target.ing.id, unit);
    ref.current?.f7Popover().close();
  };

  const ing = target?.ing;

  return (
    <Popover
      slot="fixed"
      ref={ref}
      className="ck-convert"
      {...(containerEl ? { containerEl } : {})}
      // no dimmed page behind it, like iOS's menus; a tap anywhere else closes it
      backdrop={false}
      closeByOutsideClick
      style={{ '--f7-popover-width': `${WIDTH}px` } as CSSProperties}
      // Framework7's own open handler (which places it) runs after this one
      onPopoverOpen={() => requestAnimationFrame(place)}
      onPopoverClosed={onClosed}
    >
      {ing && (
        <>
          <div className="ck-convert-head">
            <span className="ck-convert-name">{titleCase(ing.name)}</span>
          </div>
          <UnitOptions ing={ing} factor={factor} picks={picks} onPick={pick} />
        </>
      )}
    </Popover>
  );
}

/** Set or clear one ingredient's picked unit. */
export const withPick = (picks: UnitPicks, id: string, unit: string | null): UnitPicks => {
  const { [id]: _old, ...rest } = picks;
  return unit ? { ...rest, [id]: unit } : rest;
};

/**
 * The choices for one ingredient, as radio rows: the recipe's own amount ("Original"), then the same amount in the
 * other units, the neatest marked "Simpler". Used by the popover and the bottom sheet.
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
