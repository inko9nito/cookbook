import { useRef, useSyncExternalStore } from 'react';
import { Fab, Sheet, Toolbar, Link, PageContent, Block, Segmented, Button } from 'framework7-react';
import { Type } from 'lucide-react';
import { FONTS, setFont, setFontButton, useFontTrial } from '../data/font';
import FontSizeControls, { type FontSizeControlsHandle } from './FontSizeControls';
import { navIcon } from './ui/icons';

// whether the font sheet is open: one sheet for the whole app, opened from any tab's button
let sheetOpen = false;
const sheetListeners = new Set<() => void>();
const setSheetOpen = (open: boolean) => {
  sheetOpen = open;
  sheetListeners.forEach((l) => l());
};
const useSheetOpen = () =>
  useSyncExternalStore(
    (l) => {
      sheetListeners.add(l);
      return () => sheetListeners.delete(l);
    },
    () => sheetOpen,
  );

/**
 * Issue #135: switching fonts on the fly while trying them. A small dark Aa button (Framework7's FAB) on the right
 * edge, halfway down, clear of the tab bar, the Cooking pill and the recipe page's Start cooking bar, on every screen:
 * one in each tab's View (App.tsx), above its pages, since the Views are drawn over anything beside them. Hide button
 * takes it away; Settings → Appearance → Font Button brings it back.
 */
export function FontFab() {
  const trial = useFontTrial();
  if (!trial.button) return null;
  return (
    <Fab position="right-center" className="ck-font-fab" onClick={() => setSheetOpen(true)} aria-label="Try fonts">
      <Type {...navIcon} />
    </Fab>
  );
}

/**
 * The Aa button's sheet, once in App.tsx: no backdrop, so the screen behind stays bright and changes as you pick: the
 * fonts (each name in its own font) and the sizes for this font.
 */
export function FontSheet() {
  const trial = useFontTrial();
  const opened = useSheetOpen();
  const sizes = useRef<FontSizeControlsHandle>(null);
  const setOpened = setSheetOpen;
  return (
    <>
      <Sheet
        opened={opened}
        onSheetOpen={() => requestAnimationFrame(() => sizes.current?.layout())}
        onSheetClosed={() => setOpened(false)}
        swipeToClose
        backdrop={false}
        closeByOutsideClick
        style={{ height: 'auto' }}
        className="ck-edit-sheet ck-font-sheet"
      >
        <Toolbar>
          <div className="left">
            <b>Font</b>
          </div>
          <div className="right">
            <Link sheetClose>Done</Link>
          </div>
        </Toolbar>
        <PageContent>
          <Block>
            <Segmented strong className="ck-font-picker">
              {FONTS.map((f) => (
                <Button key={f.id} active={trial.font === f.id} onClick={() => setFont(f.id)}>
                  <span data-font-sample={f.id}>{f.name}</span>
                </Button>
              ))}
            </Segmented>
          </Block>
          <FontSizeControls ref={sizes} />
          <Block className="ck-font-sheet-foot">
            <Link
              onClick={() => {
                setOpened(false);
                setFontButton(false);
              }}
            >
              Hide button
            </Link>
          </Block>
        </PageContent>
      </Sheet>
    </>
  );
}
