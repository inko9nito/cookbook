import { f7 } from 'framework7-react';

// Picks and applies an Open Design design system on top of Framework7's iOS theme.
// The token data (src/theme/design-systems.json) is loaded lazily, so it doesn't slow app start.
// Phase 1 moves the saved choice from this device's storage into my settings in the database.

export type DesignSystem = {
  id: string;
  name: string;
  category: string;
  summary: string;
  tokens: Record<string, string>;
};

export const DEFAULT_ID = 'ios'; // plain Framework7 iOS look, follows light/dark mode
const DEFAULT_ACCENT = '#d9572b';
const STORAGE_KEY = 'cookbook.designSystem';

/** Shortlist shown first in the picker: warm, food- and reading-friendly looks. */
export const SUGGESTED = [
  'warm-editorial', 'terracotta', 'paper', 'kami', 'editorial', 'resy-ios',
  'goodreads-ios', 'things-3-ios', 'headspace-ios', 'minimal', 'apple',
];

let cache: DesignSystem[] | null = null;
export async function loadDesignSystems(): Promise<DesignSystem[]> {
  if (!cache) cache = (await import('./design-systems.json')).default as DesignSystem[];
  return cache;
}

export function savedDesignSystemId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

const TOKEN_PROPS = (tokens: Record<string, string>) => Object.keys(tokens).map((k) => `--ds-${k}`);
let appliedProps: string[] = [];

export async function applyDesignSystem(id: string, persist = true) {
  const root = document.documentElement;
  for (const p of appliedProps) root.style.removeProperty(p);
  appliedProps = [];

  const ds = id === DEFAULT_ID ? null : (await loadDesignSystems()).find((d) => d.id === id) ?? null;

  if (ds) {
    for (const [k, v] of Object.entries(ds.tokens)) root.style.setProperty(`--ds-${k}`, v);
    appliedProps = TOKEN_PROPS(ds.tokens);
    root.classList.add('ds-active');
    // Design-system palettes are light; keep the app light while one is active.
    f7.setDarkMode(false);
    f7.setColorTheme(ds.tokens.accent);
  } else {
    root.classList.remove('ds-active');
    f7.setDarkMode('auto');
    f7.setColorTheme(DEFAULT_ACCENT);
  }

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, ds ? ds.id : DEFAULT_ID);
    } catch {
      /* storage unavailable */
    }
  }
  return ds;
}
