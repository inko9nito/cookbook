import { useEffect, useRef, type ComponentProps } from 'react';
import { Sheet, Toolbar, Link } from 'framework7-react';
import { titleCase } from '../lib/recipe';
import type { UnitPicks } from './ui/ingredientLine';
import { UnitOptions, type ConvertTarget } from './UnitPopover';

type SheetRef = NonNullable<ComponentProps<typeof Sheet>['ref']>;

type Props = {
  target: ConvertTarget | null;
  factor: number;
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onClosed: () => void;
  /** where Framework7 puts it while open; by default the app, which a popup (cook mode) would cover */
  containerEl?: string;
};

/**
 * The unit choices in a Framework7 bottom sheet (issue #6), out from under the thumb that tapped the amount: the
 * ingredient as the sheet's title with Done, then the radio rows. The page isn't dimmed, and Framework7 scrolls it so
 * the tapped ingredient stays above the sheet. Picking a unit closes it; so does swiping it down or tapping elsewhere.
 */
export default function UnitSheet({ target, factor, picks, onPick, onClosed, containerEl }: Props) {
  const ref = useRef(null) as unknown as SheetRef;

  useEffect(() => {
    const sheet = ref.current?.f7Sheet();
    if (!target || !sheet) return;
    // keep the tapped ingredient in view above the sheet (on the recipe page; cook mode's halves scroll on their own)
    sheet.params.scrollToEl = (target.el.closest('li') ?? target.el) as HTMLElement;
    sheet.open();
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
      closeByOutsideClick
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
