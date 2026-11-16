/*
  Font trial (issue #21): rounded Google Fonts to try across the whole app, picked in Settings → Font.
  The user liked Nunito's roundness, so the others are rounded too.
  They're served from this site (Fontsource), not Google's servers, so they work offline and need no second service.
  A font's files only download once it's chosen. When the user settles on one, keep it as `--ck-font` in
  cookbook.css, drop the others and this picker.
*/
import '@fontsource-variable/nunito';
import '@fontsource-variable/quicksand';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/baloo-2';
// these two also cover Japanese: load only their Latin letters, in the weights the app uses
import '@fontsource/m-plus-rounded-1c/latin-400.css';
import '@fontsource/m-plus-rounded-1c/latin-500.css';
import '@fontsource/m-plus-rounded-1c/latin-700.css';
import '@fontsource/m-plus-rounded-1c/latin-800.css';
import '@fontsource/zen-maru-gothic/latin-400.css';
import '@fontsource/zen-maru-gothic/latin-500.css';
import '@fontsource/zen-maru-gothic/latin-700.css';
import '@fontsource/zen-maru-gothic/latin-900.css';

export type FontChoice = { id: string; name: string; family: string };

const SYSTEM = "-apple-system, system-ui, 'SF Pro Text', 'Helvetica Neue', sans-serif";

export const FONTS: FontChoice[] = [
  { id: 'system', name: 'iPhone (current)', family: SYSTEM },
  { id: 'nunito', name: 'Nunito', family: `'Nunito Variable', ${SYSTEM}` },
  { id: 'mplus', name: 'M PLUS Rounded', family: `'M PLUS Rounded 1c', ${SYSTEM}` },
  { id: 'zen-maru', name: 'Zen Maru Gothic', family: `'Zen Maru Gothic', ${SYSTEM}` },
  { id: 'quicksand', name: 'Quicksand', family: `'Quicksand Variable', ${SYSTEM}` },
  { id: 'fredoka', name: 'Fredoka', family: `'Fredoka Variable', ${SYSTEM}` },
  { id: 'baloo', name: 'Baloo 2', family: `'Baloo 2 Variable', ${SYSTEM}` },
];

const KEY = 'cookbook.font';

export function savedFont(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && FONTS.some((f) => f.id === id)) return id;
  } catch {
    /* storage blocked: the iPhone font */
  }
  return 'system';
}

/** Switches the whole app to a font (it overrides the `--ck-font` token) and remembers it on this phone. */
export function applyFont(id: string, remember = true) {
  const font = FONTS.find((f) => f.id === id) ?? FONTS[0];
  if (font.id === 'system') document.documentElement.style.removeProperty('--ck-font');
  else document.documentElement.style.setProperty('--ck-font', font.family);
  if (!remember) return;
  try {
    localStorage.setItem(KEY, font.id);
  } catch {
    /* not remembered, still applied */
  }
}
