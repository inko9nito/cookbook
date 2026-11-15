import { useMemo } from 'react';
import UnitPopover, { type ConvertTarget } from './UnitPopover';
import UnitSheet from './UnitSheet';
import type { UnitPicks } from './ui/ingredientLine';
import { readUnitPickerMode } from './ui/unitPickerMode';

type Props = {
  target: ConvertTarget | null;
  factor: number;
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onClosed: () => void;
  /** where the picker goes while open; by default the app, which a popup (cook mode) would cover */
  containerEl?: string;
  /** "fixed": the Page keeps it outside its scrolling content (Framework7 only reads this on the Page's own children) */
  slot?: string;
};

/**
 * Where the unit choices open when an underlined amount is tapped (issue #6): a bottom sheet, or a popover beside the
 * amount. TEMPORARY: Settings switches between them while comparing on the phone (ui/unitPickerMode.ts).
 */
export default function UnitPicker({ target, slot: _slot, ...rest }: Props) {
  // read the switch each time an amount is tapped
  const mode = useMemo(() => readUnitPickerMode(), [target]);
  return (
    <>
      <UnitPopover {...rest} target={mode === 'popover' ? target : null} />
      <UnitSheet {...rest} target={mode === 'sheet' ? target : null} />
    </>
  );
}
