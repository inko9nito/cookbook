/*
  Font trial (issue #21): five Google Fonts to try across the whole app, picked in Settings → Font.
  They're served from this site (Fontsource), not Google's servers, so they work offline and need no second service.
  A font's files only download once it's chosen. When the user settles on one, keep it as `--ck-font` in
  cookbook.css, drop the others and this picker.
*/
import '@fontsource-variable/nunito';
import '@fontsource-variable/rubik';
import '@fontsource-variable/figtree';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/dm-sans';

export type FontChoice = { id: string; name: string; family: string };

const SYSTEM = "-apple-system, system-ui, 'SF Pro Text', 'Helvetica Neue', sans-serif";

export const FONTS: FontChoice[] = [
  { id: 'system', name: 'iPhone (current)', family: SYSTEM },
  { id: 'nunito', name: 'Nunito', family: `'Nunito Variable', ${SYSTEM}` },
  { id: 'rubik', name: 'Rubik', family: `'Rubik Variable', ${SYSTEM}` },
  { id: 'figtree', name: 'Figtree', family: `'Figtree Variable', ${SYSTEM}` },
  { id: 'jakarta', name: 'Plus Jakarta Sans', family: `'Plus Jakarta Sans Variable', ${SYSTEM}` },
  { id: 'dm-sans', name: 'DM Sans', family: `'DM Sans Variable', ${SYSTEM}` },
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
