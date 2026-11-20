import { useSyncExternalStore } from 'react';

/**
 * The app's font (issue #135): Parkinsans at 90%, or another picked in Settings → Appearance → Font (FontPage). Each
 * font has its own sizes (titles and buttons, reading text), since some run larger than others.
 *
 * The choice is this phone's only. public/fonts.js keeps it (localStorage) and draws it, from index.html's head before
 * the first paint (a font arriving after the first paint drew everything twice) and from here through window.ckFonts.
 * Keep the font ids and the default in step with it, and with the default in src/theme/cookbook.css.
 */
export type FontId = 'parkinsans' | 'funnel' | 'redhat' | 'fredoka';
export type FontSizes = { display: number; text: number };
export type FontChoice = { font: FontId; sizes: Partial<Record<FontId, FontSizes>> };

declare global {
  interface Window {
    ckFonts?: { read(): FontChoice; save(t: FontChoice): void; defaultSizes(id: FontId): FontSizes };
  }
}

export const FONTS: { id: FontId; name: string }[] = [
  { id: 'parkinsans', name: 'Parkinsans' },
  { id: 'funnel', name: 'Funnel' },
  { id: 'redhat', name: 'Red Hat' },
  { id: 'fredoka', name: 'Fredoka' },
];

/** the size sliders: percent of the font's own size */
export const SIZE_MIN = 80;
export const SIZE_MAX = 125;

const listeners = new Set<() => void>();
let current: FontChoice = window.ckFonts?.read() ?? { font: 'parkinsans', sizes: {} };

function change(next: FontChoice) {
  current = next;
  window.ckFonts?.save(next);
  listeners.forEach((l) => l());
}

export const defaultSizes = (id: FontId): FontSizes => window.ckFonts?.defaultSizes(id) ?? { display: 100, text: 100 };
export const sizesOf = (t: FontChoice): FontSizes => t.sizes[t.font] ?? defaultSizes(t.font);
export const usualSizes = (t: FontChoice) => {
  const s = sizesOf(t);
  const d = defaultSizes(t.font);
  return s.display === d.display && s.text === d.text;
};

export const setFont = (font: FontId) => change({ ...current, font });
export const setFontSizes = (sizes: Partial<FontSizes>) =>
  change({ ...current, sizes: { ...current.sizes, [current.font]: { ...sizesOf(current), ...sizes } } });
export const resetFontSizes = () => setFontSizes(defaultSizes(current.font));

export function useFontChoice(): FontChoice {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const fontChoiceNow = () => current;

export const fontName = (id: FontId) => FONTS.find((f) => f.id === id)?.name ?? '';
