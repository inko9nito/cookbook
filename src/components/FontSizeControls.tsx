import { Block, Range, Link } from 'framework7-react';
import { SIZE_MAX, SIZE_MIN, fontChoiceNow, resetFontSizes, setFontSizes, sizesOf, useFontChoice, usualSizes, type FontSizes } from '../data/font';

/**
 * Issue #135: the sizes of the chosen font, its own for each font (some run larger than others). Two Framework7
 * sliders on a card, one for titles and buttons and one for reading text, as a percent of the font's own size; the app
 * changes while the slider moves. Reset puts both back to the font's usual sizes (90% for Parkinsans, else 100%).
 */
export default function FontSizeControls() {
  const choice = useFontChoice();
  const sizes = sizesOf(choice);

  const row = (key: keyof FontSizes, label: string) => (
    <div className="ck-size-row">
      <div className="ck-size-head">
        <span>{label}</span>
        <span className="ck-size-value">{sizes[key]}%</span>
      </div>
      <Range
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={1}
        value={sizes[key]}
        onRangeChange={(v: number) => {
          // Framework7 also reports the value it's given back from here: only a new one is a change
          if (v !== sizesOf(fontChoiceNow())[key]) setFontSizes({ [key]: v });
        }}
      />
    </div>
  );

  return (
    <Block strong inset className="ck-size-controls">
      {row('display', 'Titles and buttons')}
      {row('text', 'Reading text')}
      <Link className={`ck-size-reset ${usualSizes(choice) ? 'disabled' : ''}`} onClick={resetFontSizes}>
        Reset sizes
      </Link>
    </Block>
  );
}
