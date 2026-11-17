// Which tab the app opens on. Normally Recipes (the first page of each tab, see App.tsx), but a reload the app does
// itself comes back to the tab it was on: Settings → Version's refresh reloads into a new version, and landing on
// Recipes after it was jarring (issue #48: the version you just updated to is on Settings).
//
// Kept in sessionStorage: it lasts for this one reload and is gone once read, so opening the app later starts on
// Recipes as before. Storage can be missing or refuse (a private window), and then the app just opens on Recipes.

export type TabId = 'recipes' | 'cookbooks' | 'plan' | 'groceries' | 'settings';

const KEY = 'ck-reopen-tab';
const TABS: TabId[] = ['recipes', 'cookbooks', 'plan', 'groceries', 'settings'];

/** Before reloading: open the app on this tab when it comes back. */
export function reopenOnTab(tab: TabId) {
  try {
    sessionStorage.setItem(KEY, tab);
  } catch {
    /* no storage: the app opens on Recipes */
  }
}

/** The tab to open on (once: it's forgotten as it's read). */
export function takeStartTab(): TabId {
  try {
    const tab = sessionStorage.getItem(KEY) as TabId | null;
    sessionStorage.removeItem(KEY);
    return tab && TABS.includes(tab) ? tab : 'recipes';
  } catch {
    return 'recipes';
  }
}
