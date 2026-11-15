// TEMPORARY (issue #6): two layouts for the unit popover, to try on the phone; Settings switches between them.
// Remove the switch once one is picked.
//   beside: next to the tapped amount, its arrow pointing at it
//   above:  above the tapped row, its arrow pointing down at it
export type ConvertLayout = 'beside' | 'above';
const KEY = 'cookbook.convertLayout';

export function readConvertLayout(): ConvertLayout {
  try {
    return localStorage.getItem(KEY) === 'above' ? 'above' : 'beside';
  } catch {
    return 'beside';
  }
}

export function saveConvertLayout(layout: ConvertLayout) {
  try {
    localStorage.setItem(KEY, layout);
  } catch {
    /* storage unavailable: back to the default next time */
  }
}
