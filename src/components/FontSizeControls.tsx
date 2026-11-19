import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Block, Range, Link } from 'framework7-react';
import type { Range as F7Range } from 'framework7/types';
import { SIZE_MAX, SIZE_MIN, fontTrialNow, sameSizes, setFontSizes, sizesOf, useFontTrial, type FontSizes } from '../data/font';

type RangeRef = { el: HTMLElement | null; f7Range: () => F7Range.Range };
export type FontSizeControlsHandle = { layout: () => void };

/**
 * Issue #135: the sizes of the font being tried, its own for each font (some run larger than others). Two Framework7
 * sliders, one for titles and buttons and one for reading text, as a percent of the font's own size; the app changes
 * while the slider moves. Reset puts both back to 100%. Used on the Font page (on a card, like its other groups) and in
 * the Aa sheet.
 */
const FontSizeControls = forwardRef<FontSizeControlsHandle, { card?: boolean }>(function FontSizeControls({ card }, ref) {
  const trial = useFontTrial();
  const sizes = sizesOf(trial);
  const display = useRef(null as unknown as RangeRef);
  const text = useRef(null as unknown as RangeRef);
  // a slider drawn while its sheet was hidden has no width yet: the sheet lays them out again as it opens
  useImperativeHandle(ref, () => ({
    layout: () =>
      [display, text].forEach((r) => {
        // Range's own calcSize() and layout(), which Framework7 runs on a resize but leaves out of its types
        const range = r.current?.f7Range?.() as unknown as { calcSize?: () => void; layout?: () => void } | undefined;
        range?.calcSize?.();
        range?.layout?.();
      }),
  }));

  const row = (key: keyof FontSizes, label: string, r: React.MutableRefObject<RangeRef>) => (
    <div className="ck-size-row">
      <div className="ck-size-head">
        <span>{label}</span>
        <span className="ck-size-value">{sizes[key]}%</span>
      </div>
      <Range
        ref={r}
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={1}
        value={sizes[key]}
        onRangeChange={(v: number) => {
          // Framework7 also reports the value it's given back from here: only a new one is a change
          if (v !== sizesOf(fontTrialNow())[key]) setFontSizes({ [key]: v });
        }}
      />
    </div>
  );

  return (
    <Block strong={card} inset={card} className="ck-size-controls">
      {row('display', 'Titles and buttons', display)}
      {row('text', 'Reading text', text)}
      <Link className={`ck-size-reset ${sameSizes(sizes) ? 'disabled' : ''}`} onClick={() => setFontSizes({ display: 100, text: 100 })}>
        Reset sizes
      </Link>
    </Block>
  );
});

export default FontSizeControls;
