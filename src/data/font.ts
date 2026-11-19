import { useSyncExternalStore } from 'react';

/**
 * Trying fonts in the app (issue #135): Settings → Appearance → Font, and the floating Aa button (FontFab) for
 * switching on the fly. The user picked these from three rounds of comparisons and chooses between them on the phone.
 * Each font has its own sizes (titles and buttons, reading text), since some run larger than others.
 *
 * The trial is this phone's only. public/font-trial.js keeps it (localStorage) and draws it, from index.html's head
 * before the first paint (a font arriving after the first paint drew everything twice) and from here through
 * window.ckFontTrial. Keep the font ids in step with it.
 */
export type FontId = 'fredoka' | 'funnel' | 'parkinsans' | 'redhat';
export type FontSizes = { display: number; text: number };
export type FontTrial = { font: FontId; sizes: Partial<Record<FontId, FontSizes>>; button: boolean };

declare global {
  interface Window {
    ckFontTrial?: { read(): FontTrial; save(t: FontTrial): void };
  }
}

export const FONTS: { id: FontId; name: string }[] = [
  { id: 'fredoka', name: 'Fredoka' },
  { id: 'funnel', name: 'Funnel' },
  { id: 'parkinsans', name: 'Parkinsans' },
  { id: 'redhat', name: 'Red Hat' },
];

/** the size sliders: percent of the font's own size */
export const SIZE_MIN = 80;
export const SIZE_MAX = 125;
const SAME: FontSizes = { display: 100, text: 100 };

const listeners = new Set<() => void>();
let current: FontTrial = window.ckFontTrial?.read() ?? { font: 'fredoka', sizes: {}, button: true };

function change(next: FontTrial) {
  current = next;
  window.ckFontTrial?.save(next);
  listeners.forEach((l) => l());
}

export const setFont = (font: FontId) => change({ ...current, font });
export const setFontSizes = (sizes: Partial<FontSizes>) =>
  change({ ...current, sizes: { ...current.sizes, [current.font]: { ...sizesOf(current), ...sizes } } });
export const setFontButton = (button: boolean) => change({ ...current, button });

export const sizesOf = (t: FontTrial): FontSizes => t.sizes[t.font] ?? SAME;
export const sameSizes = (s: FontSizes) => s.display === 100 && s.text === 100;

export function useFontTrial(): FontTrial {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const fontTrialNow = () => current;

export const fontName = (id: FontId) => FONTS.find((f) => f.id === id)?.name ?? '';
