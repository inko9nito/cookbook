import { useEffect, useRef, type ComponentProps } from 'react';
import { Sheet, Toolbar, Link } from 'framework7-react';
import { titleCase } from '../lib/recipe';
import type { UnitPicks } from './ui/ingredientLine';
import { UnitOptions, type ConvertTarget } from './UnitChoices';

type SheetRef = NonNullable<ComponentProps<typeof Sheet>['ref']>;

type Props = {
  /** the ingredient whose units are shown; null closes the sheet */
  target: ConvertTarget | null;
  factor: number;
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onClosed: () => void;
  /** where Framework7 puts it while open; by default the app, which a popup (cook mode) would cover */
  containerEl?: string;
  /** "fixed": the Page keeps it outside its scrolling content (Framework7 only reads this on the Page's own children) */
  slot?: string;
};

/**
 * The unit choices in a Framework7 bottom sheet (issue #6), out from under the thumb that tapped the amount: the
 * ingredient as the sheet's title with Done, then the radio rows. The page isn't dimmed, and Framework7 scrolls it so
 * the tapped ingredient stays above the sheet. Picking a unit closes it; so do Done, swiping it down, tapping
 * elsewhere, and tapping the same amount again. Tapping another amount switches the sheet to that ingredient.
 */
export default function UnitSheet({ target, factor, picks, onPick, onClosed, containerEl }: Props) {
  const ref = useRef(null) as unknown as SheetRef;

  // open for a tapped amount, stay open and switch for another one, close when the target is cleared
  useEffect(() => {
    const sheet = ref.current?.f7Sheet();
    if (!sheet) return;
    if (!target) {
      if (sheet.opened) sheet.close();
      return;
    }
    // keep the tapped ingredient in view above the sheet (on the recipe page; cook mode's halves scroll on their own)
    sheet.params.scrollToEl = (target.el.closest('li') ?? target.el) as HTMLElement;
    if (!sheet.opened) sheet.open();
  }, [target]);

  // a tap anywhere but the sheet or an underlined amount closes it (amounts open, switch or close it themselves)
  useEffect(() => {
    if (!target) return;
    const close = (e: Event) => {
      const el = e.target as Element;
      if (!el.closest('.ck-unit-sheet, .ck-convertible')) ref.current?.f7Sheet().close();
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [target]);

  const pick = (unit: string | null) => {
    if (target) onPick(target.ing.id, unit);
    ref.current?.f7Sheet().close();
  };

  return (
    <Sheet
      ref={ref}
      className="ck-edit-sheet ck-unit-sheet"
      style={{ height: 'auto' }}
      swipeToClose
      backdrop={false}
      {...(containerEl ? { containerEl } : {})}
      onSheetClosed={onClosed}
    >
      <Toolbar>
        <div className="left">
          <b>{target ? titleCase(target.ing.name) : ''}</b>
        </div>
        <div className="right">
          <Link sheetClose>Done</Link>
        </div>
      </Toolbar>
      {/* no PageContent: a handful of rows needs no scrolling, and a .page-content here (inside the recipe Page) would be
          found before the page's own by anything looking for it */}
      <div className="ck-unit-sheet-body">
        {target && <UnitOptions ing={target.ing} factor={factor} picks={picks} onPick={pick} className="ck-unit-sheet-list" />}
      </div>
    </Sheet>
  );
}
