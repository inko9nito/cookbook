import { useSyncExternalStore } from 'react';

/**
 * Trying fonts in the app (issue #135): Settings → Appearance → Font. The user picked these from three rounds of
 * comparisons and chooses between them on the phone. The choice is this phone's only (localStorage), so it can be put
 * on the page by the script in index.html's head before the first paint, like the fonts themselves (a font arriving
 * after the first paint drew everything twice). `html[data-font]` swaps --ck-font and --ck-font-display
 * (src/theme/cookbook.css); today's pair has no attribute. Keep the ids in step with index.html's head script.
 */
export type FontId = 'fredoka' | 'funnel' | 'parkinsans' | 'redhat';

export const FONTS: { id: FontId; name: string }[] = [
  { id: 'fredoka', name: 'Fredoka' },
  { id: 'funnel', name: 'Funnel' },
  { id: 'parkinsans', name: 'Parkinsans' },
  { id: 'redhat', name: 'Red Hat' },
];

const KEY = 'ck-font';
const listeners = new Set<() => void>();

function read(): FontId {
  const v = document.documentElement.dataset.font;
  return FONTS.some((f) => f.id === v) ? (v as FontId) : 'fredoka';
}

export function setFont(id: FontId) {
  const html = document.documentElement;
  if (id === 'fredoka') delete html.dataset.font;
  else html.dataset.font = id;
  try {
    if (id === 'fredoka') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    // private browsing: the font still changes until the app is closed
  }
  listeners.forEach((l) => l());
}

export function useFont(): FontId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}

export const fontName = (id: FontId) => FONTS.find((f) => f.id === id)?.name ?? '';
