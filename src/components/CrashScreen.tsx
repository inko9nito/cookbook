import { Component, useEffect, useState, type ReactNode } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { hideLaunchLoader } from '../data/launch';
import { reopenOnTab, type TabId } from '../data/startTab';
import { isDemo } from '../data/api';

const TABS: TabId[] = ['recipes', 'cookbooks', 'plan', 'groceries', 'settings'];

/** The tab on screen (each tab's view is #view-<tab>), to come back to after the reload. */
function shownTab(): TabId | null {
  const id = document.querySelector('.views > .view.tab-active')?.id.replace(/^view-/, '') as TabId | undefined;
  return id && TABS.includes(id) ? id : null;
}

/**
 * What shows when the app crashes (issue #140), instead of a blank white screen with no way out but closing the app.
 * React takes the whole app away after an error it can't recover from; this catches it and shows what happened (the
 * error itself, small, for a screenshot in the issue) and one button, Reload, which opens the app again on the tab it
 * was on. Framework7 went with the app, so this is plain markup in the shape of an empty state (DESIGN.md → Crash
 * screen), with Framework7's button styles.
 */
export class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null; tab: TabId | null }> {
  state = { error: null as Error | null, tab: null as TabId | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)), tab: shownTab() };
  }

  render() {
    const { error, tab } = this.state;
    return error ? <CrashScreen error={error} tab={tab} /> : this.props.children;
  }
}

function CrashScreen({ error, tab }: { error: Error; tab: TabId | null }) {
  // a crash while the app starts would otherwise stay under the launch loader's pot
  useEffect(() => hideLaunchLoader(), []);
  const reload = () => {
    if (tab) reopenOnTab(tab);
    location.reload();
  };
  return (
    <div className="ck-crash" role="alert">
      <div className="ck-empty">
        <span className="ck-empty-icon" aria-hidden="true">
          <TriangleAlert size={40} strokeWidth={1.75} />
        </span>
        <h1 className="ck-empty-title">Something went wrong</h1>
        <button type="button" className="button button-large button-fill button-round ck-main ck-empty-button" onClick={reload}>
          <RotateCw size={20} strokeWidth={2.5} aria-hidden="true" />
          Reload
        </button>
        <p className="ck-crash-error">{error.message || error.name}</p>
      </div>
    </div>
  );
}

/**
 * On the demo only (never the real site), window.ckCrash() makes the app crash where it is, so the UI check can see the
 * crash screen and that Reload comes back to the same tab.
 */
export function CrashForCheck() {
  const [crash, setCrash] = useState(false);
  useEffect(() => {
    if (!isDemo) return;
    (window as { ckCrash?: () => void }).ckCrash = () => setCrash(true);
  }, []);
  if (crash) throw new Error('A crash for the UI check (ckCrash)');
  return null;
}
