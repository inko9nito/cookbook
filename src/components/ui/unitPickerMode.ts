// TEMPORARY (issue #6): the unit choices open in a bottom sheet or a popover, to compare on the phone; Settings
// switches between them. Remove the switch once one is picked.
export type UnitPickerMode = 'sheet' | 'popover';
const KEY = 'cookbook.unitPicker';

export function readUnitPickerMode(): UnitPickerMode {
  try {
    return localStorage.getItem(KEY) === 'popover' ? 'popover' : 'sheet';
  } catch {
    return 'sheet';
  }
}

export function saveUnitPickerMode(mode: UnitPickerMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable: back to the default next time */
  }
}
